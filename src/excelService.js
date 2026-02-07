
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
                
                let allData = [];

                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX_LIB.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    if (jsonData.length === 0) return;

                    // Simple header detection (assuming row 0 is header)
                    const headers = jsonData[0].map(h => h ? h.toString().trim() : '');
                    const map = {
                        line: headers.findIndex(h => h.includes('線路') || h.toLowerCase().includes('line')),
                        port: headers.findIndex(h => h.toLowerCase().includes('port')),
                        usage: headers.findIndex(h => h.includes('用途') || h.toLowerCase().includes('usage')),
                        remarks: headers.findIndex(h => h.includes('備註') || h.toLowerCase().includes('remark'))
                    };

                    // If critical headers missing, maybe skip or assume order? 
                    // Let's assume order if headers not found: Line, Port, Usage, Remarks
                    // But for robustness, we try to map.
                    
                    for (let i = 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!row || row.length === 0) continue;

                        const line_name = map.line !== -1 ? row[map.line] : row[0];
                        const port = map.port !== -1 ? row[map.port] : row[1];
                        
                        if (!line_name && !port) continue; // Skip empty rows

                        allData.push({
                            station_name: sheetName,
                            fiber_name: line_name || '',
                            port: port || '',
                            usage: map.usage !== -1 ? row[map.usage] || '' : row[2] || '',
                            notes: map.remarks !== -1 ? row[map.remarks] || '' : row[3] || ''
                        });
                    }
                });

                resolve(allData);
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
