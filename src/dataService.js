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

export async function addRecord(record) {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase not configured");

    // Determine table from station name
    let tableName = 'udc'; // Default
    const station = (record.station_name || '').toLowerCase();
    
    if (station.includes('udc')) tableName = 'udc';
    else if (station.includes('1ph')) tableName = 'station_1ph';
    else if (station.includes('2ph')) tableName = 'station_2ph';
    else if (station.includes('dkb')) tableName = 'dkb';
    else if (station.includes('5kb')) tableName = 'station_5kb';
    else if (station.includes('ms2')) tableName = 'ms2';
    else if (station.includes('ms3')) tableName = 'ms3';
    else if (station.includes('ms4')) tableName = 'ms4';
    else if (station.includes('o2')) tableName = 'o2';
    else if (station.includes('room') || station.includes('機房')) tableName = 'room';

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
    return currentData.filter(d => 
        (d.fiber_name && String(d.fiber_name).toLowerCase().includes(lowerQ)) ||
        (d.usage && String(d.usage).toLowerCase().includes(lowerQ)) ||
        (d.notes && String(d.notes).toLowerCase().includes(lowerQ))
    );
}

export function getFiberPath(fiberName) {
    return currentData.filter(d => d.fiber_name === fiberName);
}
