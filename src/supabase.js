
import { createClient } from '@supabase/supabase-js'

let supabase = null;

export function initSupabase(url, key) {
    if (url && key) {
        supabase = createClient(url, key);
        localStorage.setItem('https://otdjrzpmtrojlcisoxeb.supabasce.o', url);
        localStorage.setItem('sb_publishable_fxD_HVblMWtRiYK53tWgzw_8Pg0PqgS', key);
        return true;
    }
    return false;
}

export function getSupabase() {
    if (!supabase) {
        const url = localStorage.getItem('https://otdjrzpmtrojlcisoxeb.supabasce.o');
        const key = localStorage.getItem('sb_publishable_fxD_HVblMWtRiYK53tWgzw_8Pg0PqgS');
        if (url && key) {
            supabase = createClient(url, key);
        }
    }
    return supabase;
}

export async function checkConnection() {
    const client = getSupabase();
    if (!client) return false;
    try {
        const { data, error } = await client.from('ports').select('count', { count: 'exact', head: true });
        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Supabase connection error:", e);
        return false;
    }
}
