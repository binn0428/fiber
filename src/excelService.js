
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
                    const findIndexSafe = (keyword) => headers.findIndex(h => h && h.toLowerCase().includes(keyword));
                    
                    const map = {
                        line: findIndexSafe('線路') !== -1 ? findIndexSafe('線路') : findIndexSafe('line'),
                        port: findIndexSafe('port'),
                        usage: findIndexSafe('用途') !== -1 ? findIndexSafe('用途') : findIndexSafe('usage'),
                        remarks: findIndexSafe('備註') !== -1 ? findIndexSafe('備註') : findIndexSafe('remark'),
                        core_count: findIndexSafe('芯數') !== -1 ? findIndexSafe('芯數') : findIndexSafe('core'),
                        destination: findIndexSafe('目的') !== -1 ? findIndexSafe('目的') : findIndexSafe('dest'),
                        source: findIndexSafe('來源') !== -1 ? findIndexSafe('來源') : findIndexSafe('source')
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
                            // Reset context on empty row separation? 
                            // Usually safer not to reset unless we are sure, but standard Excel behavior 
                            // for data tables often implies continuity only if no gap.
                            // However, let's keep it simple: if row is empty, just skip.
                            // But if we encounter a new valid line_name later, it updates lastFiberName.
                            continue; 
                        }

                        // 1. Fill down Line Name (Handle merged cells/empty fields for same cable)
                        if (!line_name && port && lastFiberName) {
                            line_name = lastFiberName;
                        }
                        
                        if (line_name) {
                            lastFiberName = line_name;
                        }

                        // 2. Parse Core Count from Line Name (User Rule: "48_xx" -> 48)
                        let parsedCoreCount = '';
                        if (line_name) {
                            const strName = String(line_name);
                            const match = strName.match(/^(\d+)_/);
                            if (match) {
                                parsedCoreCount = match[1];
                            }
                        }

                        // 3. Determine Final Core Count
                        // Priority: Explicit Excel Value > Parsed from Name > Inherited from Group
                        let finalCoreCount = raw_core_count;
                        
                        if (!finalCoreCount && parsedCoreCount) {
                            finalCoreCount = parsedCoreCount;
                        }
                        
                        // Inherit from previous row if in same group (same Line Name)
                        if (!finalCoreCount && line_name === lastFiberName && lastCoreCount) {
                            finalCoreCount = lastCoreCount;
                        }

                        if (finalCoreCount) {
                            lastCoreCount = finalCoreCount;
                        }

                        rows.push({
                            station_name: sheetName,
                            fiber_name: line_name || '',
                            port: port || '',
                            usage: map.usage !== -1 ? row[map.usage] || '' : row[2] || '',
                            notes: map.remarks !== -1 ? row[map.remarks] || '' : row[3] || '',
                            core_count: finalCoreCount || '',
                            destination: map.destination !== -1 ? row[map.destination] || '' : '',
                            source: map.source !== -1 ? row[map.source] || '' : '',
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
            "Port": item.port,
            "用途": item.usage,
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
