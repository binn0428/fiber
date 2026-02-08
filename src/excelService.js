
// Use global XLSX if available (from CDN), otherwise try import from CDN
// This handles both build (where import works if configured) and CDN usage
const XLSX_LIB = (typeof XLSX !== 'undefined') ? XLSX : (await import('https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs').catch(() => ({})));

export async function parseExcel(file) {
    if (!XLSX_LIB.read) {
        throw new Error("XLSX library not loaded");
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX_LIB.read(data, { type: 'array' });
                
                const sheets = [];

                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX_LIB.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    if (jsonData.length === 0) return;

                    // Simple header detection (assuming row 0 is header)
                    const headers = jsonData[0].map(h => h ? h.toString().trim() : '');
                    
                    const findHeader = (keywords) => {
                        // 1. Try exact match
                        for (const k of keywords) {
                            const idx = headers.findIndex(h => h === k);
                            if (idx !== -1) return idx;
                        }
                        // 2. Try includes (fallback)
                        for (const k of keywords) {
                            const idx = headers.findIndex(h => h && h.toLowerCase().includes(k.toLowerCase()));
                            if (idx !== -1) return idx;
                        }
                        return -1;
                    };
                    
                    const map = {
                        line: findHeader(['線路名稱', 'Line Name', '線路']),
                        port: findHeader(['Port']),
                        usage: findHeader(['用途', 'Usage']),
                        remarks: findHeader(['備註', 'Remarks']),
                        core_count: findHeader(['芯數', 'Core Count', 'Core']),
                        
                        // New fields
                        source: findHeader(['線路來源', 'Source']),
                        connection_line: findHeader(['來源線路', 'Connection Line', 'Source Circuit']),
                        net_start: findHeader(['網路起點', 'Network Start']),
                        net_end: findHeader(['網路終點', 'Network End', '目的', 'Destination']),
                        department: findHeader(['使用單位', 'Department']),
                        contact: findHeader(['聯絡人', 'Contact']),
                        phone: findHeader(['連絡電話', 'Phone'])
                    };

                    const rows = [];
                    let lastFiberName = '';
                    let lastCoreCount = '';

                    for (let i = 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!row || row.length === 0) continue;

                        let line_name = map.line !== -1 ? row[map.line] : row[0];
                        const port = map.port !== -1 ? row[map.port] : row[1];
                        let raw_core_count = map.core_count !== -1 ? row[map.core_count] : '';

                        // Skip completely empty rows
                        if (!line_name && !port) {
                            continue; 
                        }

                        // 1. Fill down Line Name (Handle merged cells/empty fields for same cable)
                        if (!line_name && port && lastFiberName) {
                            line_name = lastFiberName;
                        }
                        
                        if (line_name) {
                            lastFiberName = line_name;
                        }

                        // 2. Determine Final Core Count
                        // Priority: Explicit Excel Value > Inherited from Group
                        // (Removed parsing from Line Name as per user request: "Line Name is not Line Number")
                        let finalCoreCount = raw_core_count;
                        
                        // Inherit from previous row if in same group (same Line Name)
                        if (!finalCoreCount && line_name === lastFiberName && lastCoreCount) {
                            finalCoreCount = lastCoreCount;
                        }

                        if (finalCoreCount) {
                            lastCoreCount = finalCoreCount;
                        }
                        
                        // Map net_end to destination as well for backward compatibility/topology
                        const valNetEnd = map.net_end !== -1 ? row[map.net_end] || '' : '';
                        // If we have a separate destination field (not likely if mapped to net_end), use it.
                        // But here we mapped '目的' to net_end.
                        const valDestination = valNetEnd;

                        rows.push({
                            station_name: sheetName,
                            fiber_name: line_name || '',
                            port: port || '',
                            usage: map.usage !== -1 ? row[map.usage] || '' : row[2] || '',
                            notes: map.remarks !== -1 ? row[map.remarks] || '' : row[3] || '',
                            core_count: finalCoreCount || '',
                            destination: valDestination,
                            source: map.source !== -1 ? row[map.source] || '' : '',
                            connection_line: map.connection_line !== -1 ? row[map.connection_line] || '' : '',
                            net_start: map.net_start !== -1 ? row[map.net_start] || '' : '',
                            net_end: valNetEnd,
                            department: map.department !== -1 ? row[map.department] || '' : '',
                            contact: map.contact !== -1 ? row[map.contact] || '' : '',
                            phone: map.phone !== -1 ? row[map.phone] || '' : '',
                            sequence: i // Preserve Excel row order
                        });
                    }
                    
                    if (rows.length > 0) {
                        sheets.push({ name: sheetName, rows: rows });
                    }
                });

                resolve(sheets);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

export function exportToExcel(data) {
    if (!XLSX_LIB.utils) {
        throw new Error("XLSX library not loaded");
    }
    // Group by site
    const sites = {};
    data.forEach(item => {
        const site = item.station_name || 'Unknown';
        if (!sites[site]) sites[site] = [];
        sites[site].push({
            "線路名稱": item.fiber_name,
            "芯數": item.core_count,
            "線路來源": item.source,
            "來源線路": item.connection_line,
            "Port": item.port,
            "網路起點": item.net_start,
            "網路終點": item.net_end,
            "用途": item.usage,
            "使用單位": item.department,
            "聯絡人": item.contact,
            "連絡電話": item.phone,
            "備註": item.notes
        });
    });

    const wb = XLSX_LIB.utils.book_new();
    
    for (const siteName in sites) {
        const ws = XLSX_LIB.utils.json_to_sheet(sites[siteName]);
        XLSX_LIB.utils.book_append_sheet(wb, ws, siteName);
    }

    XLSX_LIB.writeFile(wb, "fiber_management_export.xlsx");
}
