import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

let supabase = null;

const STORAGE_KEY_URL = 'supabase_url';
const STORAGE_KEY_KEY = 'supabase_key';

export function initSupabase(url, key) {
    if (url && key) {
        try {
            supabase = createClient(url, key);
            localStorage.setItem(STORAGE_KEY_URL, url);
            localStorage.setItem(STORAGE_KEY_KEY, key);
            return true;
        } catch (e) {
            console.error("Supabase init error:", e);
            return false;
        }
    }
    return false;
}

export function getSupabase() {
    if (!supabase) {
        // Priority: 1. LocalStorage, 2. Env Vars
        let url = localStorage.getItem(STORAGE_KEY_URL);
        let key = localStorage.getItem(STORAGE_KEY_KEY);

        // Fallback to weird keys if standard ones missing (Legacy support)
        if (!url) url = localStorage.getItem('https://otdjrzpmtrojlcisoxeb.supabasce.o');
        if (!key) key = localStorage.getItem('sb_publishable_fxD_HVblMWtRiYK53tWgzw_8Pg0PqgS');

        // Fallback to Env vars
        if ((!url || !key) && import.meta.env) {
            url = url || import.meta.env.VITE_SUPABASE_URL;
            key = key || import.meta.env.VITE_SUPABASE_KEY;
        }

        // Final Fallback: Hardcoded keys from original project
        if (!url) url = 'https://otdjrzpmtrojlcisoxeb.supabase.co';
        if (!key) key = 'sb_publishable_fxD_HVblMWtRiYK53tWgzw_8Pg0PqgS';

        if (url && key) {
            try {
                supabase = createClient(url, key);
            } catch (e) {
                console.error("Supabase client creation error:", e);
            }
        }
    }
    return supabase;
}

export async function checkConnection() {
    const client = getSupabase();
    if (!client) return false;
    try {
        // Check connection by querying one of the known tables (e.g., udc)
        const { count, error } = await client.from('udc').select('*', { count: 'exact', head: true });
        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Supabase connection error:", e);
        return false;
    }
}
