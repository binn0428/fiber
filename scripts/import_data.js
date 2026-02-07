import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Error: SUPABASE_URL and SUPABASE_KEY environment variables are required.');
    console.log('Usage: set SUPABASE_URL=... && set SUPABASE_KEY=... && node scripts/import_data.js');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const DATA_DIR = path.join(__dirname, '../fiber_data');

// Mapping filenames to table names (sanitized)
const FILE_MAPPING = {
    'udc.xlsx': 'udc',
    '#1ph.xlsx': 'station_1ph',
    '#2ph.xlsx': 'station_2ph',
    'dkb.xlsx': 'dkb',
    '5kb.xlsx': 'station_5kb',
    'ms2.xlsx': 'ms2',
    'ms3.xlsx': 'ms3',
    'ms4.xlsx': 'ms4',
    'o2.xlsx': 'o2',
    'room.xlsx': 'room',
    '機房.xlsx': 'room'
};

async function importData() {
    const files = fs.readdirSync(DATA_DIR).filter(file => file.endsWith('.xlsx'));
    
    for (const file of files) {
        if (!FILE_MAPPING[file]) {
            console.log(`Skipping ${file} (no table mapping defined)`);
            continue;
        }

        const tableName = FILE_MAPPING[file];
        console.log(`Processing ${file} -> Table: ${tableName}...`);
        
        const filePath = path.join(DATA_DIR, file);
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        const stationName = file.replace('.xlsx', '').toUpperCase(); // Use filename as station name
        
        const records = data.map(row => {
            // Handle column mapping variations
            // dkb.xlsx has 'Unnamed: 1' for destination and '來源線路' for connection_line
            // others have '線路目的' and '跳接線路'
            
            return {
                station_name: stationName,
                fiber_name: row['線路名稱'] || null,
                destination: row['線路目的'] || row['Unnamed: 1'] || null,
                core_count: row['芯數'] ? String(row['芯數']) : null,
                source: row['線路來源'] || null,
                connection_line: row['跳接線路'] || row['來源線路'] || null,
                port: row['Port'] ? String(row['Port']) : null,
                net_start: row['網路起點'] || null,
                net_end: row['網路終點'] || null,
                usage: row['用途'] || null,
                department: row['使用單位'] || null,
                contact: row['聯絡人'] || null,
                phone: row['連絡電話'] ? String(row['連絡電話']) : null,
                notes: row['備註'] || null
            };
        });

        if (records.length > 0) {
            // Check if table exists (optional, but good for debugging)
            // Insert data
            const { error } = await supabase.from(tableName).insert(records);
            if (error) {
                console.error(`Error inserting data into ${tableName}:`, error);
            } else {
                console.log(`Successfully inserted ${records.length} records into ${tableName}`);
            }
        } else {
            console.log(`No records found in ${file}`);
        }
    }
}

importData().catch(console.error);
