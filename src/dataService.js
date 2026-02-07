import { getSupabase } from './supabase.js';

let currentData = [];
let listeners = [];

export function subscribe(listener) {
    listeners.push(listener);
}

function notify() {
    listeners.forEach(cb => cb(currentData));
}

const TABLES = ['udc', 'station_1ph', 'station_2ph', 'dkb', 'station_5kb', 'ms2', 'ms3', 'ms4', 'o2'];

export async function loadData() {
    const sb = getSupabase();
    if (!sb) {
        console.warn("Supabase not configured");
        return [];
    }
    
    let allData = [];
    
    try {
        const promises = TABLES.map(async (table) => {
            const { data, error } = await sb.from(table).select('*');
            if (error) {
                console.warn(`Error loading from ${table} (table might not exist yet):`, error.message);
                return [];
            }
            return data.map(d => ({ ...d, _table: table }));
        });

        const results = await Promise.all(promises);
        allData = results.flat();
    } catch (err) {
        console.error("Critical error loading data:", err);
    }
    
    currentData = allData || [];
    notify();
    return currentData;
}

export async function addRecord(record) {
    const sb = getSupabase();
    if (!sb) return null;

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
        // Define 'used' as having a value in 'usage' or 'net_start'/'net_end'
        // Or simply if 'usage' is not empty.
        const isUsed = (d.usage && d.usage.trim().length > 0) || (d.fiber_name && d.fiber_name.trim().length > 0);
        
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
        (d.fiber_name && d.fiber_name.toLowerCase().includes(lowerQ)) ||
        (d.usage && d.usage.toLowerCase().includes(lowerQ)) ||
        (d.notes && d.notes.toLowerCase().includes(lowerQ))
    );
}

// Function to find path for a fiber
// Logic: Find all records with this fiber_name across different stations
export function getFiberPath(fiberName) {
    return currentData.filter(d => d.fiber_name === fiberName);
}
