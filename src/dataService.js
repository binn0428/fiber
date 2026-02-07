
import { getSupabase } from './supabase.js';

let currentData = [];
let listeners = [];

export function subscribe(listener) {
    listeners.push(listener);
}

function notify() {
    listeners.forEach(cb => cb(currentData));
}

export async function loadData() {
    const sb = getSupabase();
    if (!sb) {
        console.warn("Supabase not configured");
        return [];
    }
    
    const { data, error } = await sb.from('ports').select('*');
    if (error) {
        console.error("Error loading data:", error);
        throw error;
    }
    
    currentData = data || [];
    notify();
    return currentData;
}

export async function syncData(newData) {
    // This replaces all data or appends? 
    // Strategy: Delete all for the sites present in newData? Or just simple truncate and insert?
    // "Import and re-parse" suggests a refresh.
    // For safety, let's try to upsert or just insert. 
    // Given the complexity of diffing, "Clear and Insert" is easiest for "Import Excel" feature usually.
    // But let's be careful. I'll implement "Insert/Upsert".
    
    // To keep it simple: We will upload the new rows.
    // Ideally we should empty the table first if it's a full import.
    
    const sb = getSupabase();
    if (!sb) {
        // Offline mode: just update local
        currentData = newData.map((d, i) => ({ ...d, id: `local_${i}` }));
        notify();
        return;
    }

    // Batch insert
    // 1. Delete all? (Optional, maybe user wants to append)
    // Let's ask user or assume replace for "Import Excel and re-parse" often implies resetting state to the file.
    // But to be safe, I will just Insert and let user manage duplicates or delete manually? 
    // Actually, "Re-parse" usually means "Here is the new source of truth".
    // I will delete all for now to ensure consistency with the file.
    
    const { error: delError } = await sb.from('ports').delete().neq('id', 0); // Delete all rows
    if (delError) console.error("Error clearing table:", delError);

    // Chunking inserts
    const chunkSize = 1000;
    for (let i = 0; i < newData.length; i += chunkSize) {
        const chunk = newData.slice(i, i + chunkSize);
        const { error } = await sb.from('ports').insert(chunk);
        if (error) throw error;
    }
    
    await loadData();
}

export async function updatePort(id, updates) {
    const sb = getSupabase();
    
    // Optimistic update
    const idx = currentData.findIndex(d => d.id === id);
    if (idx !== -1) {
        currentData[idx] = { ...currentData[idx], ...updates };
        notify();
    }

    if (sb) {
        const { error } = await sb.from('ports').update(updates).eq('id', id);
        if (error) {
            console.error("Error updating port:", error);
            // Revert?
            await loadData(); // Reload to be safe
            throw error;
        }
    }
}

export function getData() {
    return currentData;
}

export function getStats() {
    const sites = {};
    currentData.forEach(d => {
        if (!sites[d.site_name]) {
            sites[d.site_name] = { name: d.site_name, total: 0, used: 0, free: 0 };
        }
        sites[d.site_name].total++;
        if (d.usage && d.usage.trim()) {
            sites[d.site_name].used++;
        } else {
            sites[d.site_name].free++;
        }
    });
    return Object.values(sites);
}

export function getSiteData(siteName) {
    return currentData.filter(d => d.site_name === siteName);
}

export function searchLine(query) {
    if (!query) return [];
    const lowerQ = query.toLowerCase();
    return currentData.filter(d => 
        (d.line_name && d.line_name.toLowerCase().includes(lowerQ))
    );
}
