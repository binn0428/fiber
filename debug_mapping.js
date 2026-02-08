
function getTableForStation(stationName) {
    const station = (stationName || '').toLowerCase().trim();
    
    console.log(`Testing station: "${stationName}" -> normalized: "${station}"`);

    // Priority: Specific stations first, then generic 'udc'
    if (station.includes('ms2')) return 'ms2';
    if (station.includes('ms3')) return 'ms3';
    if (station.includes('ms4')) return 'ms4';
    if (station.includes('1ph')) return 'station_1ph';
    if (station.includes('2ph')) return 'station_2ph';
    if (station.includes('dkb')) return 'dkb';
    if (station.includes('5kb')) return 'station_5kb';
    if (station.includes('o2')) return 'o2';
    if (station.includes('room') || station.includes('機房')) return 'room';
    
    // UDC check moved to lower priority
    if (station.includes('udc')) return 'udc';
    
    // Fallback: Check if the station name exactly matches one of the known tables (ignoring case/prefix)
    const knownTables = ['ms2', 'ms3', 'ms4', 'o2', 'dkb', 'udc'];
    for (const t of knownTables) {
        if (station.includes(t)) return t;
    }
    
    return 'udc'; // Default
}

// Test cases
const testCases = [
    'UDC-MS2',
    'MS2',
    'ms2',
    'UDC_MS2',
    'UDC MS2',
    'UDC-MS3',
    'MS3',
    'UDC-MS4',
    'MS4',
    'UDC',
    'UDC-Main',
    'Some Other Station'
];

testCases.forEach(t => {
    console.log(`Result for "${t}": ${getTableForStation(t)}`);
});
