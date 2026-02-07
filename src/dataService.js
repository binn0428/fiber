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
    const station = (stationName || '').toLowerCase();
    if (station.includes('udc')) return 'udc';
    if (station.includes('1ph')) return 'station_1ph';
    if (station.includes('2ph')) return 'station_2ph';
    if (station.includes('dkb')) return 'dkb';
    if (station.includes('5kb')) return 'station_5kb';
    if (station.includes('ms2')) return 'ms2';
    if (station.includes('ms3')) return 'ms3';
    if (station.includes('ms4')) return 'ms4';
    if (station.includes('o2')) return 'o2';
    if (station.includes('room') || station.includes('機房')) return 'room';
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

export async function updateRecord(id, updates) {
    const sb = getSupabase();
    
    // Optimistic update
    const idx = currentData.findIndex(d => d.id === id);
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
                if ((row.core_count||'') !== (existing.core_count||'')) updates.core_count = row.core_count;
                if ((row.source||'') !== (existing.source||'')) updates.source = row.source;
                
                // If any changes, update
                if (Object.keys(updates).length > 0) {
                    await sb.from(tableName).update(updates).eq('id', existing.id);
                    // Update local cache
                    const localIdx = currentData.findIndex(d => d.id === existing.id);
                    if (localIdx !== -1) {
                        currentData[localIdx] = { ...currentData[localIdx], ...updates };
                    }
                }
            } else {
                // Insert new
                const { data: newRec } = await sb.from(tableName).insert([row]).select();
                if (newRec) {
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
    return currentData.filter(d => d.station_name === siteName);
}

export function getStats() {
    const sites = {};
    
    currentData.forEach(d => {
        const name = d.station_name || 'Unknown';
        if (!sites[name]) {
            sites[name] = { name, total: 0, used: 0, free: 0 };
        }
        
        sites[name].total++;
        
        // Safely check for usage
        const usage = d.usage ? String(d.usage).trim() : '';
        const fiberName = d.fiber_name ? String(d.fiber_name).trim() : '';
        
        const isUsed = usage.length > 0 || fiberName.length > 0;
        
        if (isUsed) {
            sites[name].used++;
        } else {
            sites[name].free++;
        }
    });
    
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
        (d.station_name && String(d.station_name).toLowerCase().includes(lowerQ)) || // Source
        (d.destination && String(d.destination).toLowerCase().includes(lowerQ))      // Destination
    );
}

export function getFiberPath(fiberName) {
    return currentData.filter(d => d.fiber_name === fiberName);
}
