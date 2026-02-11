import { getSupabase } from './supabase.js';

let currentData = [];
let listeners = [];

export function subscribe(listener) {
    listeners.push(listener);
}

function notify() {
    listeners.forEach(cb => cb(currentData));
}

const TABLES = ['udc', 'station_1ph', 'station_2ph', 'dkb', 'station_5kb', 'ms2', 'ms3', 'ms4', 'o2', 'room'];

export async function getAppSettings(key) {
    const sb = getSupabase();
    if (!sb) return null;
    
    try {
        const { data, error } = await sb.from('app_settings').select('value').eq('key', key).single();
        if (error) {
            if (error.code !== 'PGRST116') { // Ignore 'row not found'
                console.warn(`Error fetching setting ${key}:`, error);
            }
            return null;
        }
        return data?.value;
    } catch (e) {
        console.error(`Exception fetching setting ${key}:`, e);
        return null;
    }
}

export async function setAppSettings(key, value) {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase not configured");

    try {
        const { error } = await sb.from('app_settings').upsert({ 
            key: key, 
            value: value,
            updated_at: new Date().toISOString()
        });
        
        if (error) throw error;
        return true;
    } catch (e) {
        console.error(`Error saving setting ${key}:`, e);
        throw e;
    }
}

export async function loadData() {
    console.log("dataService: loadData called");
    const sb = getSupabase();
    if (!sb) {
        console.warn("Supabase not configured");
        return [];
    }
    
    let allData = [];
    
    try {
        console.log("dataService: Starting to fetch tables...");
        const promises = TABLES.map(async (table) => {
            try {
                // Add a timeout to prevent hanging indefinitely
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`Timeout loading ${table}`)), 10000)
                );
                
                const fetchPromise = sb.from(table).select('*');
                
                const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);
                
                if (error) {
                    console.warn(`Error loading from ${table}:`, error.message);
                    return [];
                }
                if (!data) return [];
                return data.map(d => ({ ...d, _table: table }));
            } catch (e) {
                console.error(`Exception loading table ${table}:`, e);
                return [];
            }
        });

        const results = await Promise.all(promises);
        allData = results.flat();
        console.log(`dataService: Fetched ${allData.length} total records.`);
    } catch (err) {
        console.error("Critical error loading data:", err);
    }
    
    currentData = allData || [];
    notify();
    return currentData;
}

function getTableForStation(stationName) {
    const station = (stationName || '').toLowerCase().trim();
    
    // Priority: Specific stations first, then generic 'udc'
    if (station.includes('ms2')) return 'ms2';
    if (station.includes('ms3')) return 'ms3';
    if (station.includes('ms4')) return 'ms4';
    if (station.includes('1ph')) return 'station_1ph';
    if (station.includes('2ph')) return 'station_2ph';
    if (station.includes('dkb')) return 'dkb';
    if (station.includes('5kb')) return 'station_5kb';
    if (station.includes('o2')) return 'o2';
    if (station.includes('room') || station.includes('機房')) return 'room';
    
    // UDC check moved to lower priority
    if (station.includes('udc')) return 'udc';
    
    // Fallback: Check if the station name exactly matches one of the known tables (ignoring case/prefix)
    const knownTables = ['ms2', 'ms3', 'ms4', 'o2', 'dkb', 'udc'];
    for (const t of knownTables) {
        if (station.includes(t)) return t;
    }
    
    return 'udc'; // Default
}

export async function addRecord(record) {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase not configured");

    const tableName = getTableForStation(record.station_name);

    const { data, error } = await sb.from(tableName).insert([record]).select();
    if (error) {
        console.error(`Error adding record to ${tableName}:`, error);
        throw error;
    }
    
    if (data) {
        const newRecord = { ...data[0], _table: tableName };
        currentData.push(newRecord);
        notify();
        return newRecord;
    }
}

export async function updateRecord(id, updates, tableHint = null) {
    const sb = getSupabase();
    
    // Optimistic update
    // If tableHint is provided, ensure we match the correct record (avoid ID collisions across tables)
    const idx = currentData.findIndex(d => d.id === id && (!tableHint || d._table === tableHint));
    
    if (idx !== -1) {
        const tableName = currentData[idx]._table;
        currentData[idx] = { ...currentData[idx], ...updates };
        notify();
        
        if (sb && tableName) {
            const { error } = await sb.from(tableName).update(updates).eq('id', id);
            if (error) {
                console.error("Error updating record:", error);
                await loadData(); // Reload to revert
                throw error;
            }
        }
    } else {
        console.warn(`updateRecord: Record with id ${id} ${tableHint ? `in table ${tableHint}` : ''} not found.`);
    }
}

// Smart Upload: Update if changed, Insert if new
export async function syncData(rows, progressCallback) {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase not configured");
    
    let processed = 0;
    const total = rows.length;

    // Group rows by station to minimize table switching and allow fetching existing
    const rowsByStation = {};
    rows.forEach(r => {
        const s = r.station_name || 'Unknown';
        if (!rowsByStation[s]) rowsByStation[s] = [];
        rowsByStation[s].push(r);
    });

    for (const station in rowsByStation) {
        const stationRows = rowsByStation[station];
        const tableName = getTableForStation(station);
        
        // CLEANUP: If we are directing this station to a specific table (e.g. ms2),
        // ensure we remove any legacy records for this station from the default 'udc' table
        // to prevent duplicate/mixed data appearing in the UI.
        if (tableName !== 'udc') {
            try {
                // Delete records from 'udc' where station_name matches this station
                // This cleans up previous incorrect insertions
                await sb.from('udc').delete().eq('station_name', station);
            } catch (cleanupErr) {
                console.warn(`Cleanup for ${station} in udc table failed:`, cleanupErr);
            }
        }
        
        // Fetch existing data for this station/table to compare
        // We fetch ALL records for this table to ensure we match correctly
        // Optimization: In a real large DB, we might want to filter, but here datasets are small
        const { data: existingData, error } = await sb.from(tableName).select('*');
        if (error) {
            console.error(`Error fetching existing data for ${station}:`, error);
            continue;
        }

        // Build map for quick lookup: Key = Fiber + Port
        const existingMap = new Map();
        existingData.forEach(d => {
            // Composite key: fiber_name + port. 
            // Normalize to string and trim
            const key = `${String(d.fiber_name||'').trim()}_${String(d.port||'').trim()}`;
            existingMap.set(key, d);
        });

        for (const row of stationRows) {
            const key = `${String(row.fiber_name||'').trim()}_${String(row.port||'').trim()}`;
            const existing = existingMap.get(key);

            if (existing) {
                // Check for changes
                const updates = {};
                if ((row.usage||'') !== (existing.usage||'')) updates.usage = row.usage;
                if ((row.notes||'') !== (existing.notes||'')) updates.notes = row.notes;
                if ((row.destination||'') !== (existing.destination||'')) updates.destination = row.destination;
                if ((row.core_count||'') !== (existing.core_count||'')) updates.core_count = row.core_count === '' ? null : row.core_count;
                if ((row.source||'') !== (existing.source||'')) updates.source = row.source;
                
                // New fields sync
                if ((row.connection_line||'') !== (existing.connection_line||'')) updates.connection_line = row.connection_line;
                if ((row.net_start||'') !== (existing.net_start||'')) updates.net_start = row.net_start;
                if ((row.net_end||'') !== (existing.net_end||'')) updates.net_end = row.net_end;
                if ((row.department||'') !== (existing.department||'')) updates.department = row.department;
                if ((row.contact||'') !== (existing.contact||'')) updates.contact = row.contact;
                if ((row.phone||'') !== (existing.phone||'')) updates.phone = row.phone;

                // Sequence is likely not in DB schema, skipping update for now to prevent errors
                // if ((row.sequence||0) !== (existing.sequence||0)) updates.sequence = row.sequence; 
                
                // If any changes, update
                if (Object.keys(updates).length > 0) {
                    const { error: updateError } = await sb.from(tableName).update(updates).eq('id', existing.id);
                    
                    if (updateError) {
                        console.warn(`Update failed with extended fields, retrying with safe fields... (${updateError.message})`);
                        
                        // Fallback: Try updating only core fields if extended fields caused the error (e.g., missing columns)
                        const safeUpdates = {};
                        const SAFE_FIELDS = ['usage', 'notes', 'core_count']; // usage, notes, core_count are likely safe
                        
                        SAFE_FIELDS.forEach(f => {
                            if (updates[f] !== undefined) safeUpdates[f] = updates[f];
                        });
                        
                        if (Object.keys(safeUpdates).length > 0) {
                            const { error: retryError } = await sb.from(tableName).update(safeUpdates).eq('id', existing.id);
                            if (retryError) {
                                console.error(`Retry update error for ${key}:`, retryError);
                                throw new Error(`Update failed: ${retryError.message}`);
                            }
                        }
                    }

                    // Update local cache (optimistically update all fields in UI even if DB didn't take some)
                    const localIdx = currentData.findIndex(d => d.id === existing.id);
                    if (localIdx !== -1) {
                        currentData[localIdx] = { ...currentData[localIdx], ...updates };
                    }
                }
            } else {
                // Insert new
                // Prepare payload: remove internal fields like 'sequence' if DB doesn't have it
                // and handle empty strings for numeric fields
                const payload = { ...row };
                delete payload.sequence; 
                if (payload.core_count === '') payload.core_count = null;

                const { data: newRec, error: insertError } = await sb.from(tableName).insert([payload]).select();
                
                if (insertError) {
                    console.warn(`Insert failed with extended fields, retrying with safe fields... (${insertError.message})`);
                    
                    // Fallback: Remove potentially problematic new columns
                    const safePayload = { ...payload };
                    delete safePayload.destination;
                    delete safePayload.source;
                    delete safePayload.connection_line;
                    delete safePayload.net_start;
                    delete safePayload.net_end;
                    delete safePayload.department;
                    delete safePayload.contact;
                    delete safePayload.phone;
                    
                    const { data: retryRec, error: retryError } = await sb.from(tableName).insert([safePayload]).select();
                    
                    if (retryError) {
                         console.error(`Retry insert error for ${key}:`, retryError);
                         throw new Error(`Insert failed: ${retryError.message} (Details: ${retryError.details || ''})`);
                    }
                    
                    if (retryRec) {
                        currentData.push({ ...retryRec[0], _table: tableName });
                    }
                } else if (newRec) {
                    currentData.push({ ...newRec[0], _table: tableName });
                }
            }
            
            processed++;
            if (progressCallback) progressCallback(processed, total);
        }
    }
    
    notify();
}

export function getData() {
    return currentData;
}

export function getSiteData(siteName) {
    const data = currentData.filter(d => d.station_name === siteName || d.destination === siteName);
    // Sort by sequence if available
    return data.sort((a, b) => {
        const seqA = parseInt(a.sequence) || 999999;
        const seqB = parseInt(b.sequence) || 999999;
        return seqA - seqB;
    });
}

export function getStats() {
    const sites = {};
    const siteFibers = {};

    // 1. Build Adjacency Graph per Fiber & Init Local Stats
    const fiberGraph = {}; // { fName: { u: Set(v) } }

    currentData.forEach(d => {
        const sName = d.station_name || 'Unknown';
        const fName = d.fiber_name || 'Unclassified';
        
        // Initialize Source Site
        if (!sites[sName]) {
            sites[sName] = { name: sName, total: 0, used: 0, free: 0 };
        }
        if (!siteFibers[sName]) {
            siteFibers[sName] = {};
        }
        if (!siteFibers[sName][fName]) {
            siteFibers[sName][fName] = { 
                explicitCapacity: 0, 
                usedCount: 0, 
                rowCount: 0,
                validCoreCount: 0,
                usedCores: new Set(),
                allCores: new Set(),
                rowsWithoutCore: 0,
                usedRowsWithoutCore: 0
            };
        }
        
        const group = siteFibers[sName][fName];
        group.rowCount++;

        // Determine Usage
        const usage = d.usage ? String(d.usage).trim() : '';
        const destination = d.destination ? String(d.destination).trim() : '';
        const netEnd = d.net_end ? String(d.net_end).trim() : '';
        const department = d.department ? String(d.department).trim() : '';
        
        const isUsed = usage.length > 0 || destination.length > 0 || netEnd.length > 0 || department.length > 0;
        
        if (isUsed) {
            group.usedCount++;
        }

        // Track Unique Cores
        let cores = parseInt(d.core_count);
        if (!isNaN(cores)) {
            group.allCores.add(cores);
            if (isUsed) group.usedCores.add(cores);
            
            if (cores > group.explicitCapacity) {
                group.explicitCapacity = cores;
            }
            group.validCoreCount++;
        } else {
            group.rowsWithoutCore++;
            if (isUsed) group.usedRowsWithoutCore++;
        }

        // Build Connected Graph (Undirected)
        // If A connects to B via Fiber X, they are in the same component
        if (destination && destination !== sName) {
            if (!fiberGraph[fName]) fiberGraph[fName] = {};
            
            // Add Edge U <-> V
            if (!fiberGraph[fName][sName]) fiberGraph[fName][sName] = new Set();
            fiberGraph[fName][sName].add(destination);
            
            if (!fiberGraph[fName][destination]) fiberGraph[fName][destination] = new Set();
            fiberGraph[fName][destination].add(sName);
        }
    });

    // 2. Process Connected Components (Global Aggregation)
    // For each fiber, find connected components and aggregate stats
    for (const fName in fiberGraph) {
        const adj = fiberGraph[fName];
        const nodes = Object.keys(adj);
        const visited = new Set();
        
        for (const node of nodes) {
            if (visited.has(node)) continue;
            
            // BFS to find component
            const component = [];
            const queue = [node];
            visited.add(node);
            
            while (queue.length > 0) {
                const u = queue.shift();
                component.push(u);
                
                if (adj[u]) {
                    adj[u].forEach(v => {
                        if (!visited.has(v)) {
                            visited.add(v);
                            queue.push(v);
                        }
                    });
                }
            }
            
            // Aggregate Stats for Component
            const aggStats = {
                rowCount: 0,
                usedCount: 0,
                validCoreCount: 0,
                explicitCapacity: 0,
                usedCores: new Set(),
                allCores: new Set(),
                rowsWithoutCore: 0,
                usedRowsWithoutCore: 0
            };
            
            component.forEach(u => {
                if (siteFibers[u] && siteFibers[u][fName]) {
                    const g = siteFibers[u][fName];
                    aggStats.rowCount += g.rowCount;
                    aggStats.usedCount += g.usedCount;
                    aggStats.validCoreCount += g.validCoreCount;
                    aggStats.explicitCapacity = Math.max(aggStats.explicitCapacity, g.explicitCapacity);
                    
                    g.usedCores.forEach(c => aggStats.usedCores.add(c));
                    g.allCores.forEach(c => aggStats.allCores.add(c));
                    aggStats.rowsWithoutCore += g.rowsWithoutCore;
                    aggStats.usedRowsWithoutCore += g.usedRowsWithoutCore;
                }
            });
            
            // Assign Aggregated Stats to ALL nodes in component
            component.forEach(u => {
                // Ensure site exists (e.g. for passive destinations)
                if (!sites[u]) sites[u] = { name: u, total: 0, used: 0, free: 0 };
                if (!siteFibers[u]) siteFibers[u] = {};
                
                // Overwrite with aggregated stats
                siteFibers[u][fName] = { ...aggStats };
            });
        }
    }
    
    // Aggregate Stats per Site
    for (const sName in siteFibers) {
        const fibers = siteFibers[sName];
        
        // Expose the fiber groups in the result so UI can use them
        sites[sName].groups = fibers;
        
        for (const fName in fibers) {
            const group = fibers[fName];
            
            // Capacity Logic:
            // 1. Try to parse total from fiber name prefix (e.g., "48_fh_3" -> 48)
            let capacity = 0;
            const prefixMatch = fName.match(/^(\d+)/);
            if (prefixMatch) {
                capacity = parseInt(prefixMatch[1]);
            }

            // 2. Fallback: Use Unique Cores + Rows without Core
            if (!capacity || isNaN(capacity) || capacity === 0) {
                 capacity = group.allCores.size + group.rowsWithoutCore;
                 // Fallback to max of rowCount/explicit if sets are empty (edge case)
                 if (capacity === 0) capacity = Math.max(group.rowCount, group.explicitCapacity);
            }
            
            const used = group.usedCores.size + group.usedRowsWithoutCore;
            const free = Math.max(0, capacity - used);
            
            // Update group object with calculated values so main.js can use them
            group.total = capacity;
            group.used = used;
            group.free = free;
            
            sites[sName].total += capacity;
            sites[sName].used += used;
            sites[sName].free += free;
        }
    }
    
    return Object.values(sites);
}

export function searchLine(query) {
    if (!query) return [];
    const lowerQ = query.toLowerCase();
    
    // Fuzzy search: includes is simplest. 
    // User asked for "context". We return the full row.
    // Also search source and destination for better matches.
    return currentData.filter(d => 
        (d.fiber_name && String(d.fiber_name).toLowerCase().includes(lowerQ)) ||
        (d.usage && String(d.usage).toLowerCase().includes(lowerQ)) ||
        (d.notes && String(d.notes).toLowerCase().includes(lowerQ)) ||
        (d.station_name && String(d.station_name).toLowerCase().includes(lowerQ)) ||
        (d.destination && String(d.destination).toLowerCase().includes(lowerQ)) ||
        (d.net_end && String(d.net_end).toLowerCase().includes(lowerQ)) ||
        (d.net_start && String(d.net_start).toLowerCase().includes(lowerQ)) ||
        (d.department && String(d.department).toLowerCase().includes(lowerQ)) ||
        (d.connection_line && String(d.connection_line).toLowerCase().includes(lowerQ)) ||
        (d.contact && String(d.contact).toLowerCase().includes(lowerQ)) ||
        (d.phone && String(d.phone).toLowerCase().includes(lowerQ))
    );
}

export function getFiberPath(fiberName) {
    return currentData.filter(d => d.fiber_name === fiberName);
}

export async function deleteStation(stationName) {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase not configured");

    // Identify tables involved
    const records = currentData.filter(d => d.station_name === stationName);
    const tables = [...new Set(records.map(r => r._table).filter(Boolean))];
    
    if (tables.length === 0) {
        // Fallback to heuristic if no records found (e.g. maybe only stats existed?)
        const defaultTable = getTableForStation(stationName);
        tables.push(defaultTable);
    }

    for (const table of tables) {
        const { error } = await sb.from(table).delete().eq('station_name', stationName);
        if (error) {
             console.error(`Error deleting station ${stationName} from ${table}:`, error);
             throw error;
        }
    }

    // Update local state
    currentData = currentData.filter(d => d.station_name !== stationName);
    notify();
}
