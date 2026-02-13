
console.log("Main script starting...");

import { initSupabase, checkConnection, getSupabase } from './supabase.js';
import { loadData, addRecord, updateRecord, deleteRecord, getData, getStats, getSiteData, searchLine, getFiberPath, syncData, deleteStation, getAppSettings, setAppSettings, savePathHistory, getPathHistoryList, deletePathHistory } from './dataService.js';
import { parseExcel, exportToExcel } from './excelService.js';
import './mobile.js';

if (window.logToScreen) window.logToScreen("main.js loaded.");
console.log("main.js loaded");

// Global State
let isAdminLoggedIn = false;
let currentMainSites = []; // Stores the user-selected main sites for layout (Array)
let isEditMode = false; // New Edit Mode State

// Connection Creation State
let connectionCreationState = {
    active: false,
    step: 0, // 0: inactive, 1: select source, 2: select target
    source: null,
    target: null
};

let mapState = {
    panning: false,
    startX: 0,
    startY: 0,
    tx: 0,
    ty: 0,
    scale: 1
};

// Load saved map state
try {
    const saved = localStorage.getItem('fiber_map_state');
    if (saved) {
        const parsed = JSON.parse(saved);
        mapState.tx = parsed.tx || 0;
        mapState.ty = parsed.ty || 0;
        mapState.scale = parsed.scale || 1;
    }
} catch (e) { console.error("Failed to load map state", e); }

let nodePositions = {};
let hasAutoFitted = false; // Track if we have auto-fitted the map
let currentPage = 1;
const ITEMS_PER_PAGE = 20;



// DOM Elements
const navBtns = document.querySelectorAll('.nav-btn');
const viewSections = document.querySelectorAll('.view-section');
const globalSearchInput = document.getElementById('global-search');
const searchBtn = document.getElementById('search-btn');
const siteModal = document.getElementById('site-modal');
const pathModal = document.getElementById('path-modal');
const closeModals = document.querySelectorAll('.close-modal');
const modalSiteTitle = document.getElementById('modal-site-title');
const modalSiteStats = document.getElementById('modal-site-stats');
const modalTableBody = document.querySelector('#modal-table tbody');
const dataTableBody = document.querySelector('#data-table tbody');
const siteSelector = document.getElementById('site-selector');
const addForm = document.getElementById('add-form');
const mapContainer = document.getElementById('fiber-map');

// Config Elements
const saveConfigBtn = document.getElementById('save-config-btn');
const supabaseUrlInput = document.getElementById('supabase-url');
const supabaseKeyInput = document.getElementById('supabase-key');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    if (window.logToScreen) window.logToScreen("DOM Ready. Starting initialization...");
    console.log("DOMContentLoaded event fired");
    try {
        // Check Supabase config
        const sb = getSupabase();
        
        if (sb) {
            // Try to pre-fill URL for user convenience
            const url = localStorage.getItem('supabase_url') || 
                       (import.meta.env && import.meta.env.VITE_SUPABASE_URL) || 
                       'https://otdjrzpmtrojlcisoxeb.supabase.co'; // Default
            
            if (url && supabaseUrlInput) {
                supabaseUrlInput.value = url;
            }
            
            // Hide config panel if already connected (User Request: No need to enter again)
            const configPanel = supabaseUrlInput?.closest('.io-card');
            if (configPanel) {
                configPanel.style.display = 'none';
                // User Request: Remove the show button completely
            }

            if (window.logToScreen) window.logToScreen("Supabase initialized.");
            console.log("Supabase initialized successfully.");
        } else {
            if (window.logToScreen) window.logToScreen("Supabase init failed!", "error");
            console.warn("Supabase not initialized. Please configure.");
        }

        if (window.logToScreen) window.logToScreen("Loading data from Supabase...");
        const data = await loadData();
        
        // Load App Settings (Main Site)
        const mainSiteSetting = await getAppSettings('main_site');
        if (mainSiteSetting) {
            if (Array.isArray(mainSiteSetting.names)) {
                currentMainSites = mainSiteSetting.names;
            } else if (mainSiteSetting.name) {
                // Legacy support
                currentMainSites = [mainSiteSetting.name];
            }
            console.log("Loaded Main Sites preference:", currentMainSites);
        }

        // Load App Settings (Node Positions)
        const nodePositionsSetting = await getAppSettings('fiber_node_positions');
        if (nodePositionsSetting) {
             if (typeof nodePositionsSetting === 'string') {
                 try {
                     nodePositions = JSON.parse(nodePositionsSetting);
                 } catch (e) { console.error("Error parsing node positions", e); }
             } else {
                 nodePositions = nodePositionsSetting;
             }
             console.log("Loaded Node Positions from Supabase:", Object.keys(nodePositions).length);
        }
        
        if (window.logToScreen) window.logToScreen(`Loaded ${data.length} records.`);
        console.log(`Loaded ${data.length} records.`);
        
        renderDashboard();
        renderMap();
        renderDataTable();
        populateSiteSelector();
        
    } catch (e) {
        if (window.logToScreen) window.logToScreen(`Init Error: ${e.message}`, "error");
        console.error("Error in initialization:", e);
        if (mapContainer) {
            mapContainer.innerHTML = `<div class="error-message">
                <h3>載入失敗</h3>
                <p>${e.message}</p>
                <p>請檢查 Supabase 連線設定或網路狀態。</p>
            </div>`;
        }
        const statsContainer = document.getElementById('stats-container');
        if (statsContainer) {
            statsContainer.innerHTML = `<div class="error-message">載入失敗: ${e.message}</div>`;
        }
    }
});

// Login Logic
    const mgmtBtn = document.getElementById('mgmt-btn');
    const loginModal = document.getElementById('login-modal');
    const loginForm = document.getElementById('login-form');
    const loginPassword = document.getElementById('login-password');

    if (mgmtBtn && loginModal) {
        mgmtBtn.addEventListener('click', () => {
            if (isAdminLoggedIn) {
                if (confirm('確定要登出管理員模式嗎？')) {
                    isAdminLoggedIn = false;
                    mgmtBtn.textContent = '管理功能';
                    mgmtBtn.style.color = 'var(--warning-color)';
                    alert('已登出，編輯功能已鎖定。');

                    if (saveMapBtn) saveMapBtn.style.display = 'none';
                    if (addLinkBtn) addLinkBtn.style.display = 'none';
                    if (editMapBtn) {
                         editMapBtn.textContent = '✏️ 編輯架構';
                         editMapBtn.style.backgroundColor = 'var(--warning-color)';
                    }
                    isEditMode = false;
                    
                    // Switch to Dashboard
                    const dashboardBtn = document.querySelector('[data-target="dashboard"]');
                    if (dashboardBtn) {
                        dashboardBtn.click();
                        // Force switch if click didn't work (e.g. event propagation issues)
                        if (!document.getElementById('dashboard').classList.contains('active')) {
                             navBtns.forEach(b => b.classList.remove('active'));
                             dashboardBtn.classList.add('active');
                             viewSections.forEach(section => section.classList.remove('active'));
                             document.getElementById('dashboard').classList.add('active');
                             renderDashboard();
                        }
                    }
                    
                    renderDataTable(); // Refresh to remove editable inputs
                    
                    // Also close site details modal if open to prevent confusion
                    if (siteModal && !siteModal.classList.contains('hidden')) {
                        closeModal(siteModal);
                    }
                }
            } else {
                openModal(loginModal);
                // Auto focus
                setTimeout(() => {
                    if (loginPassword) loginPassword.focus();
                }, 100);
            }
        });
    }

    if (loginForm && loginPassword) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const pwd = loginPassword.value.trim();
            if (pwd === '179747') {
                isAdminLoggedIn = true;
                
                // Update Button State
                if (mgmtBtn) {
                    mgmtBtn.textContent = '登出';
                    mgmtBtn.style.color = 'var(--success-color)';
                }

                if (saveMapBtn) saveMapBtn.style.display = 'inline-block';

                alert('登入成功！現在可以使用編輯和匯入功能。');
                closeModal(loginModal);
                loginPassword.value = '';

                // Switch to Dashboard
                const dashboardBtn = document.querySelector('[data-target="dashboard"]');
                if (dashboardBtn) dashboardBtn.click();
                
                // Refresh views to enable editing
                renderDataTable();
                if (siteModal && !siteModal.classList.contains('hidden')) {
                     alert('請關閉並重新開啟站點詳情以啟用編輯功能。');
                }
            } else {
                alert('密碼錯誤');
                loginPassword.value = '';
                loginPassword.focus();
            }
        });
    }

    // Config Handler
if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', async () => {
        const url = supabaseUrlInput.value.trim();
        const key = supabaseKeyInput.value.trim();
        
        if (url && key) {
            const success = initSupabase(url, key);
            if (success) {
                const connected = await checkConnection();
                if (connected) {
                    alert('連線成功！');
                    location.reload(); // Reload to refresh data
                } else {
                    alert('連線失敗，請檢查 URL 和 Key 是否正確，或檢查網路。');
                }
            }
        } else {
            alert('請輸入 URL 和 Key');
        }
    });
}

// Map Controls Toggle Logic (Mobile)
const mapControlsToggle = document.getElementById('map-controls-toggle');
const mapControlsMenu = document.getElementById('map-controls-menu');

if (mapControlsToggle && mapControlsMenu) {
    mapControlsToggle.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent document click from closing immediately
        mapControlsMenu.classList.toggle('active');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && 
            mapControlsMenu.classList.contains('active') && 
            !mapControlsMenu.contains(e.target) && 
            !mapControlsToggle.contains(e.target)) {
            mapControlsMenu.classList.remove('active');
        }
    });
    
    // Close menu when clicking a button inside it
    const actionBtns = mapControlsMenu.querySelectorAll('.action-btn');
    actionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                    mapControlsMenu.classList.remove('active');
            }
        });
    });
}

// Restore Sidebar Button Logic
const restoreSidebarBtn = document.getElementById('restore-sidebar-btn');
if (restoreSidebarBtn) {
    restoreSidebarBtn.addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar');
        if(sidebar) sidebar.style.display = ''; // Restore default
        restoreSidebarBtn.style.display = 'none';
    });
}

// --- Auto Add & Path Management Logic ---

window.loadPathMgmtList = async function() {
    const container = document.getElementById('mgmt-path-list');
    if(!container) return;
    
    container.innerHTML = '<p>載入中...</p>';
    
    try {
        // Fetch from Supabase History Table
        const historyList = await getPathHistoryList();
        
        // Filter by Search
        const searchInput = document.getElementById('path-search');
        const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
        
        let pathList = historyList;
        
        if(keyword) {
            pathList = pathList.filter(p => {
                const searchStr = `${p.usage || ''} ${p.department || ''} ${p.notes || ''} ${p.id || ''}`.toLowerCase();
                return searchStr.includes(keyword);
            });
        }

        // Save list for global access (for showPathDetails)
        window.lastPathHistoryList = pathList;

        if(!pathList || pathList.length === 0) {
            container.innerHTML = '<div style="padding:10px; color:#aaa; text-align:center;">無符合條件的路徑資料</div>';
            return;
        }
        
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        
        table.innerHTML = `
            <thead>
                <tr style="background:rgba(255,255,255,0.05); color:var(--text-primary);">
                    <th style="padding:8px; border-bottom:1px solid #555; text-align:left;">ID</th>
                    <th style="padding:8px; border-bottom:1px solid #555; text-align:left;">起訖點</th>
                    <th style="padding:8px; border-bottom:1px solid #555; text-align:left;">用途</th>
                    <th style="padding:8px; border-bottom:1px solid #555; text-align:left;">單位</th>
                    <th style="padding:8px; border-bottom:1px solid #555; text-align:center;">芯數</th>
                    <th style="padding:8px; border-bottom:1px solid #555; text-align:center;">操作</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        
        const tbody = table.querySelector('tbody');
        
        pathList.forEach(p => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #444';
            
            // Extract Route
            let routeStr = '未知路徑';
            if (p.start_station && p.end_station) {
                 routeStr = `${p.start_station} <span style="color:var(--primary-color)">➝</span> ${p.end_station}`;
            } else if (p.path_nodes) {
                 let nodesArr = typeof p.path_nodes === 'string' ? JSON.parse(p.path_nodes) : p.path_nodes;
                 if(Array.isArray(nodesArr) && nodesArr.length >= 2) {
                     routeStr = `${nodesArr[0]} <span style="color:var(--primary-color)">➝</span> ${nodesArr[nodesArr.length-1]}`;
                 }
            } else if (p.nodes) { // Fallback for old records if any
                 let nodesArr = typeof p.nodes === 'string' ? JSON.parse(p.nodes) : p.nodes;
                 if(Array.isArray(nodesArr) && nodesArr.length >= 2) {
                     routeStr = `${nodesArr[0]} <span style="color:var(--primary-color)">➝</span> ${nodesArr[nodesArr.length-1]}`;
                 }
            }
            
            // Core Count (Schema doesn't have it, display '-' or check if user added it later)
            const coreCount = p.core_count ? p.core_count : '-';

            tr.innerHTML = `
                <td style="padding:8px; font-size:0.9em; color:#888;">${(p.id||'').substring(0,6)}...</td>
                <td style="padding:8px; cursor:pointer;" onclick="showPathDetails('${p.id}')" title="點選查看詳細路徑">
                    ${routeStr}
                </td>
                <td style="padding:8px;">${p.usage || '-'}</td>
                <td style="padding:8px;">${p.department || '-'}</td>
                <td style="padding:8px; text-align:center;">${coreCount}</td>
                <td style="padding:8px; text-align:center;">
                    <button onclick="showPathDetails('${p.id}')" title="詳細路徑" style="background:none; border:none; cursor:pointer; color:#8b5cf6; margin-right:5px;">📄</button>
                    <button onclick="viewPathOnMap('${p.id}')" title="地圖" style="background:none; border:none; cursor:pointer; color:var(--primary-color); margin-right:5px;">🗺️</button>
                    <button onclick="openEditPathModal('${p.id}')" title="編輯" style="background:none; border:none; cursor:pointer; color:var(--warning-color); margin-right:5px;">✏️</button>
                    <button onclick="deletePath('${p.id}')" title="刪除" style="background:none; border:none; cursor:pointer; color:#ef4444;">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        container.innerHTML = '';
        container.appendChild(table);

    } catch(e) {
        console.error(e);
        container.innerHTML = '<div style="color:red;">載入失敗: ' + e.message + '</div>';
    }
};

window.switchAutoTab = function(tab) {
    document.querySelectorAll('#auto-add .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#auto-add .tab-content-panel').forEach(p => p.style.display = 'none');
    
    const activeBtn = document.querySelector(`#auto-add .tab-btn[onclick*="${tab}"]`);
    if(activeBtn) activeBtn.classList.add('active');
    
    const panel = document.getElementById(`tab-auto-${tab}`);
    if(panel) panel.style.display = 'block';
    
    if(tab === 'mgmt') loadPathMgmtList();
};

window.initAutoAddView = function() {
    const data = getData();
    const stations = new Set();
    data.forEach(d => {
        if(d.station_name) stations.add(d.station_name);
        if(d.destination) stations.add(d.destination);
    });
    
    const datalist = document.getElementById('station-list');
    if(datalist) {
        datalist.innerHTML = Array.from(stations).sort().map(s => `<option value="${s}">`).join('');
    }
}

// Global variable to store current generated paths
let currentGeneratedPaths = [];
let selectedPathIndex = -1;
let currentHighlightedPath = null; // Stores the normalized node names of the path to highlight

// Event Listeners
const generatePathBtn = document.getElementById('generate-path-btn');
if (generatePathBtn) {
    generatePathBtn.addEventListener('click', () => {
        if (!isAdminLoggedIn) {
            alert("權限不足：自動生成路徑功能僅供管理員使用");
            return;
        }

        const start = document.getElementById('auto-start-node').value.trim();
        const end = document.getElementById('auto-end-node').value.trim();
        if(!start || !end) {
            alert("請輸入起點和終點");
            return;
        }
        if(start === end) {
            alert("起點和終點不能相同");
            return;
        }
        
        generatePaths(start, end);
    });
}

const clearPathBtn = document.getElementById('clear-path-btn');
if (clearPathBtn) {
    clearPathBtn.addEventListener('click', () => {
        document.getElementById('auto-start-node').value = '';
        document.getElementById('auto-end-node').value = '';
        const coreInput = document.getElementById('auto-core-count');
        if(coreInput) {
            coreInput.value = '1';
            coreInput.disabled = false;
        }
        
        // Clear results
        const resultsDiv = document.getElementById('path-results');
        if(resultsDiv) resultsDiv.style.display = 'none';
        
        const pathList = document.getElementById('path-list');
        if(pathList) pathList.innerHTML = '';
        
        const detailsForm = document.getElementById('path-details-form');
        if(detailsForm) detailsForm.style.display = 'none';
        
        currentGeneratedPaths = [];
        selectedPathIndex = -1;
    });
}

const confirmAutoAddBtn = document.getElementById('confirm-auto-add-btn');
if (confirmAutoAddBtn) {
    confirmAutoAddBtn.addEventListener('click', confirmAutoAdd);
}

const pathSearchBtn = document.getElementById('path-search-btn');
if (pathSearchBtn) {
    pathSearchBtn.addEventListener('click', loadPathMgmtList);
}

const pathRefreshBtn = document.getElementById('path-refresh-btn');
if (pathRefreshBtn) {
    pathRefreshBtn.addEventListener('click', async () => {
        pathRefreshBtn.disabled = true;
        const originalText = pathRefreshBtn.textContent;
        pathRefreshBtn.textContent = "載入中...";
        try {
            await loadData();
            loadPathMgmtList();
            // alert("資料已更新！"); // Optional: less intrusive
        } catch(e) {
            console.error(e);
            alert("更新失敗: " + e.message);
        } finally {
            pathRefreshBtn.disabled = false;
            pathRefreshBtn.textContent = originalText;
        }
    });
}

// ... Path Finding Logic ...
// Normalization Helper
function normalizeStationName(name) {
    if (!name) return '';
    // Remove ( , / and subsequent text. 
    // Handle # only if it is NOT at the start (to allow names like #1CCB)
    
    // First split by ( and / and SPACE
    let clean = name.split(/[(\/\s]/)[0];
    
    // Check for #
    const hashIndex = clean.indexOf('#');
    if (hashIndex > 0) {
        // Only strip if # is not the first character
        clean = clean.substring(0, hashIndex);
    }
    
    return clean.trim().toUpperCase();
}

function generatePaths(start, end) {
    const data = getData();
    // Get required core count from input, default to 1
    const requiredCores = parseInt(document.getElementById('auto-core-count').value) || 1;

    // 1. Pre-process: Identify Physical Connections (Topology) & Station Fibers
    const physicalAdj = {}; // uNorm -> Set(vNorm)
    const stationFibers = {}; // uNorm -> Set(fiber_name)
    const fiberDestinations = {}; // uNorm -> fiber_name -> Set(vNorm)
    const globalFiberDestinations = {}; // fiber_name -> Set(vNorm) - NEW: Global Map
    const normToOriginal = {}; // uNorm -> OriginalName (e.g. "500區" -> "500區(c5)")

    data.forEach(d => {
        const uNorm = normalizeStationName(d.station_name);
        if(!uNorm) return;

        // Store original name mapping (First one wins, or maybe prefer longer?)
        if (!normToOriginal[uNorm] || d.station_name.length > normToOriginal[uNorm].length) {
            normToOriginal[uNorm] = d.station_name;
        }
        
        const vNorm = normalizeStationName(d.destination);
        if (vNorm && (!normToOriginal[vNorm] || d.destination.length > normToOriginal[vNorm].length)) {
             normToOriginal[vNorm] = d.destination;
        }

        // Register Fiber at Station
        if(d.fiber_name) {
            if(!stationFibers[uNorm]) stationFibers[uNorm] = new Set();
            stationFibers[uNorm].add(d.fiber_name.trim());
        }

        // Register Physical Link (Topology)
        // Note: vNorm is already calculated above, but we need to ensure it's in scope or re-use it.
        // It was declared at line 355.
        if(vNorm && uNorm !== vNorm) {
            // Bi-directional registration of the Physical Link
            if(!physicalAdj[uNorm]) physicalAdj[uNorm] = new Set();
            physicalAdj[uNorm].add(vNorm);
            
            if(!physicalAdj[vNorm]) physicalAdj[vNorm] = new Set();
            physicalAdj[vNorm].add(uNorm);

            // Register Fiber Destination (for resolving empty destinations later)
            if (d.fiber_name) {
                const fName = d.fiber_name.trim();
                
                // Local Map
                if (!fiberDestinations[uNorm]) fiberDestinations[uNorm] = {};
                if (!fiberDestinations[uNorm][fName]) fiberDestinations[uNorm][fName] = new Set();
                fiberDestinations[uNorm][fName].add(vNorm);

                // Global Map (NEW)
                if (!globalFiberDestinations[fName]) globalFiberDestinations[fName] = new Set();
                globalFiberDestinations[fName].add(vNorm);
            }
        }
    });

    // 2. Build Graph: Adjacency List (Normalized Nodes)
    const graph = {};
    
    data.forEach(row => {
        if(!row.station_name) return;
        
        const uNorm = normalizeStationName(row.station_name);
        // Check availability
        const isAvailable = !row.usage || row.usage.trim() === '';
        if(!isAvailable) return;

        // Determine Potential Destinations
        // 1. Explicit Destination
        let potentialDests = [];
        if(row.destination) {
            potentialDests.push(normalizeStationName(row.destination));
        } else {
            // 2. Inferred Destination
            // A. Based on Known Fiber Destinations (Strong Inference from other rows)
            if (row.fiber_name) {
                 const fName = row.fiber_name.trim();
                 
                 // Try Local First
                 if (fiberDestinations[uNorm] && fiberDestinations[uNorm][fName]) {
                     fiberDestinations[uNorm][fName].forEach(v => potentialDests.push(v));
                 } 
                 // Try Global Fallback (NEW)
                 // If local didn't provide a destination, check global map
                 // STRICT CONSTRAINT: Only allow if 'v' is a physical neighbor (prevent skipping stations)
                 else if (globalFiberDestinations[fName]) {
                      globalFiberDestinations[fName].forEach(v => {
                          if (physicalAdj[uNorm] && physicalAdj[uNorm].has(v)) {
                              potentialDests.push(v);
                          }
                      });
                 }
            }

            // B. Based on Physical Link + Fiber Name Match (Weak Inference)
            // "First judge if there is a physical connection, then correspond fiber names"
            if(row.fiber_name && physicalAdj[uNorm]) {
                const fName = row.fiber_name.trim();
                physicalAdj[uNorm].forEach(vNorm => {
                    // Check if the neighbor V has the same fiber
                    if(stationFibers[vNorm] && stationFibers[vNorm].has(fName)) {
                        potentialDests.push(vNorm);
                    }
                });
            }
        }
        
        // Remove duplicates and self-loops
        potentialDests = [...new Set(potentialDests)].filter(d => d && d !== uNorm);
        
        potentialDests.forEach(vNorm => {
             // Add Edge u -> v
             if(!graph[uNorm]) graph[uNorm] = {};
             if(!graph[uNorm][vNorm]) graph[uNorm][vNorm] = [];
             
             graph[uNorm][vNorm].push(row);
        });
    });
    
    // 2.5 Post-Process Graph to ensure Bidirectionality
    // Fallback for Reverse Connectivity where downstream data is missing
    // If A->B exists (explicit), but B has NO record for this fiber.
    // The user wants "Bidirectional Inference".
    // If we only have A->B, can we traverse B->A?
    // If we traverse B->A using A's row, we are essentially using the cable.
    // Let's re-add the explicit reverse injection BUT be careful.
    // The user said "First determine physical connection".
    // If A connects to B.
    // We can infer B connects to A.
    // If B has no data, we can create a "Virtual Row" or reuse A's row for the return path?
    // Reuse A's row is dangerous for updates.
    // Better approach:
    // If A->B is established by Row A.
    // And we need B->A.
    // Check if graph[vNorm][uNorm] exists.
    // If not, maybe inject Row A as a placeholder?
    // But confirmAutoAdd needs to update.
    // If we update Row A, it marks the core used.
    // That should be enough for the link?
    // Let's stick to: "Only lock rows that exist".
    // If B has no row, we don't lock B.
    // But we still need the EDGE in the graph to traverse.
    for(const u in graph) {
        for(const v in graph[u]) {
            // u -> v exists.
            // Check v -> u
            if(!graph[v]) graph[v] = {};
            if(!graph[v][u]) {
                 // v -> u missing. 
                 // It implies v has no available rows for this link.
                 // OR v's rows are full.
                 // OR v's rows are missing destination/inference.
                 
                 // If we want to allow traversal B->A even if B has no data:
                 // We can inject the SAME rows from A->B into B->A?
                 // This effectively treats the cable as a single resource managed at A.
                 // This is common in simple fiber mgmt.
                 // Let's do this:
                 // graph[v][u] = graph[u][v]; 
                 // But wait, graph[u][v] contains rows with 'id'.
                 // If we use them for B->A, confirmAutoAdd will try to lock them.
                 // It will lock Row A.
                 // That's fine! Locking Row A marks the cable used.
                 graph[v][u] = [...graph[u][v]];
            } else {
                 // v -> u exists (has its own rows).
                 // We combine them? Or keep separate?
                 // If we have rows at B, we should prefer them.
                 // But if we run out of rows at B?
                 // Let's just keep what we found.
            }
        }
    }

    // 2.6 Inject Passthrough Edges (Bridging Gaps)
    // For nodes like PCU8 that might be physically connected but lack specific available records for a fiber,
    // we use global fiber knowledge + physical topology to inject virtual edges.
    // This solves the issue where a path exists (fiber continues) but intermediate records are missing or reserved.
    for (const u in stationFibers) {
        stationFibers[u].forEach(fName => {
            // If this fiber goes to 'v' globally
            if (globalFiberDestinations[fName]) {
                globalFiberDestinations[fName].forEach(v => {
                     // STRICT CONSTRAINT: Only if u is physically connected to v
                     // This ensures we don't skip stations (e.g. 2PH -> 500區 blocked if PCU8 is in between)
                     if (physicalAdj[u] && physicalAdj[u].has(v)) {
                         if (!graph[u]) graph[u] = {};
                         if (!graph[u][v]) graph[u][v] = [];
                         
                         // Add a Virtual Row if we don't have an available record for this fiber yet
                         // This allows "passing through" even if the specific record is missing/reserved
                         // FIX: We need to inject enough virtual rows to satisfy the 'requiredCores' count.
                         // Otherwise, path finding will fail if user requests e.g. 2 cores but we only have 1 virtual row.
                         
                         const availableCount = graph[u][v].filter(r => r.fiber_name === fName && (!r.usage || r.usage === '')).length;
                         
                         if (availableCount < requiredCores) {
                             const needed = requiredCores - availableCount;
                             for(let i=0; i<needed; i++) {
                                 graph[u][v].push({
                                     station_name: normToOriginal[u] || u, // Use Original Name if available
                                     destination: normToOriginal[v] || v,   // Use Original Name if available
                                     fiber_name: fName,
                                     usage: '', 
                                     _generated: true
                                 });
                             }
                         }
                     }
                });
            }
        });
    }
    
    // 3. BFS to find paths
    const startNorm = normalizeStationName(start);
    const endNorm = normalizeStationName(end);

    const paths = [];
    // Queue stores: current (norm), path (norm list for cycle check), records (edges with LOCKED rows)
    const queue = [ { current: startNorm, path: [startNorm], records: [] } ];
    
    let iterations = 0;
    const maxIterations = 10000;
    
    while(queue.length > 0 && paths.length < 5 && iterations < maxIterations) {
        iterations++;
        const state = queue.shift();
        const { current, path, records } = state;
        
        if(current === endNorm) {
            paths.push({ nodes: path, records: records });
            continue;
        }
        
        if(path.length >= 10) continue; // Max depth 10
        
        if(graph[current]) {
            for(const neighbor in graph[current]) {
                if(path.includes(neighbor)) continue; // Avoid cycles
                
                // Get available rows for this link
                let availableRows = graph[current][neighbor];
                
                // 1. Filter by Capacity (from Fiber Name Prefix)
                // e.g. "48_aa_1" -> Max 48 cores. "24-bb-2" -> Max 24 cores.
                if (availableRows.length > 0) {
                    const fName = availableRows[0].fiber_name || '';
                    const match = fName.match(/^(\d+)[-_]/);
                    if (match) {
                        const capacity = parseInt(match[1]);
                        if (!isNaN(capacity) && capacity > 0) {
                            availableRows = availableRows.filter(r => {
                                const c = parseInt(r.core_count);
                                // If core_count is present, it must be <= capacity.
                                // If core_count is missing (virtual row), keep it.
                                return isNaN(c) || c <= capacity;
                            });
                        }
                    }
                }

                // 2. Sorting: Core Number Ascending (Gap Filling)
                // Real records with lower core numbers come first.
                // Virtual/Undefined core numbers come last (or handle as needed).
                availableRows.sort((a, b) => {
                     const cA = parseInt(a.core_count);
                     const cB = parseInt(b.core_count);
                     
                     const hasA = !isNaN(cA);
                     const hasB = !isNaN(cB);
                     
                     if (hasA && hasB) return cA - cB; // Both have cores: Ascending (1, 2, 3...)
                     if (hasA && !hasB) return -1;     // A has core, B doesn't -> Prefer A (Reuse existing)
                     if (!hasA && hasB) return 1;      // B has core, A doesn't -> Prefer B
                     
                     // Fallback: Sort by Fiber Name if no cores (or both virtual)
                     const fA = a.fiber_name || '';
                     const fB = b.fiber_name || '';
                     return fA.localeCompare(fB, undefined, {numeric: true});
                });

                if (availableRows.length < requiredCores) {
                     continue;
                }

                // LOCK ROWS: Pick the first N specific rows
                const lockedRows = availableRows.slice(0, requiredCores);
                
                queue.push({
                    current: neighbor,
                    path: [...path, neighbor],
                    records: [...records, { from: current, to: neighbor, rows: lockedRows }]
                });
            }
        }
    }

    // Disable input to prevent changes during selection
    const coreInput = document.getElementById('auto-core-count');
    if(coreInput) coreInput.disabled = true;

    // Attach original start/end inputs to each path for later use
    paths.forEach(p => {
        p.originalStart = start;
        p.originalEnd = end;
        // Store the core count used for generation
        p.generatedCoreCount = requiredCores;
    });
    
    currentGeneratedPaths = paths;
    renderPaths(paths);
}

function renderPaths(paths) {
    const container = document.getElementById('path-list');
    const resultsArea = document.getElementById('path-results');
    const formArea = document.getElementById('path-details-form');
    
    if(!container) return;

    container.innerHTML = '';
    if(formArea) formArea.style.display = 'none';
    
    const requiredCores = parseInt(document.getElementById('auto-core-count').value) || 1;
    
    if(paths.length === 0) {
        if(resultsArea) resultsArea.style.display = 'block';
        container.innerHTML = `<div class="no-data" style="padding:10px; color:#aaa;">找不到符合條件的可用路徑<br>(無足夠連續區段或芯線不足 ${requiredCores} 芯)</div>`;
        // Debug info if needed
        console.log("No paths found. Check if start/end exist in graph and have enough available cores.");
        return;
    }
    
    if(resultsArea) resultsArea.style.display = 'block';
    
    paths.forEach((path, index) => {
        const div = document.createElement('div');
        div.className = 'path-option';
        div.style.padding = '15px';
        div.style.border = '1px solid #555';
        div.style.borderRadius = '5px';
        div.style.cursor = 'pointer';
        div.style.marginBottom = '8px';
        div.style.backgroundColor = 'var(--bg-secondary)';
        div.style.transition = 'all 0.2s';
        
        const pathStr = path.nodes.join(' <span style="color:var(--primary-color)">➝</span> ');
        div.innerHTML = `<strong style="display:block; margin-bottom:5px;">路徑 ${index + 1}</strong> <span style="font-size:1.1em;">${pathStr}</span>`;
        
        div.onmouseover = () => { if(selectedPathIndex !== index) div.style.borderColor = 'var(--primary-color)'; };
        div.onmouseout = () => { if(selectedPathIndex !== index) div.style.borderColor = '#555'; };
        
        div.onclick = () => selectPath(index);
        container.appendChild(div);
    });
}

function selectPath(index) {
    selectedPathIndex = index;
    const path = currentGeneratedPaths[index];
    
    // Highlight UI
    const options = document.querySelectorAll('.path-option');
    options.forEach((opt, i) => {
        if(i === index) {
            opt.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
            opt.style.borderColor = 'var(--success-color)';
        } else {
            opt.style.backgroundColor = 'var(--bg-secondary)';
            opt.style.borderColor = '#555';
        }
    });
    
    const formArea = document.getElementById('path-details-form');
    if(formArea) formArea.style.display = 'block';
    
    const info = document.getElementById('selected-path-info');
    if(info) {
        info.innerHTML = `
            <div>已選擇: ${path.nodes.join(' ➝ ')} (共 ${path.records.length} 段)</div>
            <button id="preview-path-btn" class="action-btn" style="margin-top:8px; font-size:0.9em; background-color:#3b82f6;">
                🗺️ 在架構圖中顯示
            </button>
        `;

        // Add Event Listener for Preview
        const previewBtn = document.getElementById('preview-path-btn');
        if(previewBtn) {
            previewBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent bubbling
                currentHighlightedPath = path.nodes; // These are already normalized
                
                // Switch to Map View
                const mapBtn = document.querySelector('[data-target="map-view"]');
                if(mapBtn) {
                    mapBtn.click();
                    
                    // Hide Sidebar
                    const sidebar = document.querySelector('.sidebar');
                    if(sidebar) sidebar.style.display = 'none';
                    
                    // Show Restore Button
                    const restoreBtn = document.getElementById('restore-sidebar-btn');
                    if(restoreBtn) restoreBtn.style.display = 'inline-flex';
                    
                    // showToast(`已顯示路徑: ${path.nodes.join('->')}`, 3000);
                }
            });
        }
    }
    
    // Auto fill hint
    const noteInput = document.getElementById('auto-notes');
    if(noteInput && !noteInput.value) {
        noteInput.placeholder = "自動填入路徑資訊...";
    }
}

async function confirmAutoAdd() {
    if (!isAdminLoggedIn) {
        alert("權限不足：僅管理員可確認新增路徑");
        return;
    }

    if(selectedPathIndex === -1) return;
    
    const path = currentGeneratedPaths[selectedPathIndex];
    // Get required core count from input or path metadata
    let requiredCores = 1;
    if (path.generatedCoreCount) {
        requiredCores = path.generatedCoreCount;
    } else {
        requiredCores = parseInt(document.getElementById('auto-core-count').value.trim()) || 1;
    }

    const updates = {
        usage: document.getElementById('auto-usage').value.trim(),
        department: document.getElementById('auto-department').value.trim(),
        contact: document.getElementById('auto-contact').value.trim(),
        notes: document.getElementById('auto-notes').value.trim(),
        net_start: path.originalStart,
        net_end: path.originalEnd
        // core_count: document.getElementById('auto-core-count').value.trim(), // DO NOT OVERWRITE
        // port: document.getElementById('auto-port').value.trim() // DO NOT OVERWRITE
    };
    
    // Validate
    if(!updates.usage) {
        alert("請輸入用途");
        return;
    }

    if(!confirm(`確定要將此路徑 (${path.nodes.join('->')}) 設為已使用？\n(將佔用每個區段 ${requiredCores} 芯)`)) return;

    // Add Path ID to notes
    const pathId = 'PATH-' + Date.now();
    // Ensure existing notes is treated as string and not null/undefined
    const existingNotes = updates.notes ? String(updates.notes) : '';
    // Save Path Nodes for visualization
    const noteWithId = (existingNotes ? existingNotes + ' ' : '') + `[PathID:${pathId}] [PathNodes:${path.nodes.join(',')}]`;

    // 1. Validate & Prepare Updates (Locking)
    try {
        // Use PRE-LOCKED rows from path generation to avoid re-search errors
        const recordsToUpdate = [];
        const recordsToCreate = []; // New list for virtual/passthrough rows
        
        const data = getData(); // Get fresh data for verification

        // Helper to find next available core number for a specific link
        // UPDATED: Finds the smallest available core numbers (Gap Filling) instead of just Max+1
        const getAvailableCoreNumbers = (station, destination, fiberName, requiredCount) => {
            // Find all records for this specific link (A->B or B->A with same fiber)
            // Normalize names to be safe
            const sNorm = normalizeStationName(station);
            const dNorm = normalizeStationName(destination);
            const fName = fiberName.trim();

            // Extract Capacity from Fiber Name
            // e.g. "48_aa_1" -> 48. "24-bb" -> 24.
            const capMatch = fName.match(/^(\d+)[-_]/);
            const capacity = capMatch ? parseInt(capMatch[1]) : 9999;

            const existingCores = new Set(data.filter(d => {
                const uNorm = normalizeStationName(d.station_name);
                const vNorm = normalizeStationName(d.destination);
                const fiber = (d.fiber_name || '').trim();
                
                // AGGRESSIVE MATCHING (Global Unique Fiber Name):
                if (fiber === fName) return true;

                return false;
            }).map(d => {
                const num = parseInt(d.core_count);
                return isNaN(num) ? 0 : num;
            }));

            const available = [];
            let candidate = 1;
            while (available.length < requiredCount) {
                if (candidate > capacity) break; // Enforce Capacity Limit

                if (!existingCores.has(candidate)) {
                    available.push(candidate);
                }
                candidate++;
                // Safety break to prevent infinite loops in extreme cases
                if (candidate > 1000) break;
            }
            return available;
        };

        // Cache for next core numbers to handle multiple cores in one batch
        // Key: "station|dest|fiber" -> Array of allocated cores [c1, c2, ...]
        const allocatedCoresCache = {}; 
        // We also need an index to know which one to pick next for the same link in the same batch
        const allocatedCoresIndex = {}; 

        for(const segment of path.records) {
            if(!segment.records && segment.rows) { 
                // Compatibility handle
            }
            
            if(!segment.rows || segment.rows.length < requiredCores) {
                 throw new Error(`路徑段 ${segment.from} -> ${segment.to} 資料異常，無法鎖定芯線。請重新搜尋。`);
            }
            
            // Pre-calculate how many new core assignments are needed for this segment
            const rowsNeedingAssignment = segment.rows.filter(r => r._generated || !r.core_count);
            
            for(const row of rowsNeedingAssignment) {
                 // Check if it's a real row (unused) that just lacks core_count, or a virtual row
                 // Use FRESH data to check core_count existence if it's a real row
                 let isRealRowNeedsUpdate = false;
                 if (!row._generated) {
                      const freshRow = data.find(d => d.id === row.id && d._table === row._table);
                      if (freshRow && !freshRow.core_count) {
                          isRealRowNeedsUpdate = true;
                      }
                 }
                 
                 if (row._generated || isRealRowNeedsUpdate) {
                      const key = `${row.station_name}|${row.destination}|${row.fiber_name}`;
                      
                      // Initialize cache if needed
                      if (!allocatedCoresCache[key]) {
                          // We need to count how many rows for THIS link need assignment in this batch
                          const countForLink = rowsNeedingAssignment.filter(r => 
                              `${r.station_name}|${r.destination}|${r.fiber_name}` === key
                          ).length;
                          
                          allocatedCoresCache[key] = getAvailableCoreNumbers(row.station_name, row.destination, row.fiber_name, countForLink);
                          allocatedCoresIndex[key] = 0;
                      }
                 }
            }

            for(const row of segment.rows) {
                 if (row._generated) {
                     // Passthrough/Virtual Row
                     const key = `${row.station_name}|${row.destination}|${row.fiber_name}`;
                     const idx = allocatedCoresIndex[key]++;
                     const assignedCore = allocatedCoresCache[key][idx];
                     
                     if (!assignedCore) {
                         throw new Error(`芯線容量不足！(${row.fiber_name} 上限 ${allocatedCoresCache[key].length < 1 ? '未知' : '已滿'})`);
                     }

                     row._assignedCore = String(assignedCore);
                     recordsToCreate.push(row);
                     continue;
                 }

                 // Verify row exists and is unused
                 const freshRow = data.find(d => d.id === row.id && d._table === row._table);
                 if(!freshRow) {
                      throw new Error(`芯線資料過期 (ID: ${row.id})，請重新搜尋。`);
                 }
                 if(freshRow.usage && freshRow.usage.trim() !== '') {
                      throw new Error(`芯線已被佔用 (${freshRow.station_name} ${freshRow.fiber_name})，請重新搜尋。`);
                 }
                 
                 // If core_count is missing, assign it temporarily for update
                 if (!freshRow.core_count) {
                      const key = `${freshRow.station_name}|${freshRow.destination}|${freshRow.fiber_name}`;
                      const idx = allocatedCoresIndex[key]++;
                      const assignedCore = allocatedCoresCache[key][idx];
                      
                      if (!assignedCore) {
                          throw new Error(`芯線容量不足！(${freshRow.fiber_name} 上限已滿)`);
                      }

                      freshRow._assignedCore = String(assignedCore);
                 }
                 recordsToUpdate.push(freshRow);
            }
        }
        
        // Execute Updates
        document.getElementById('confirm-auto-add-btn').disabled = true;
        document.getElementById('confirm-auto-add-btn').innerText = "處理中...";
        
        // 2. Execute Record Updates (Create/Update)
        // We do this BEFORE saving history to ensure data integrity.
        // If this fails, we catch error and do NOT save history.
        
        // 2.1 Create New Records for Passthrough Edges
        for (const row of recordsToCreate) {
             const newRecord = {
                 station_name: row.station_name,
                 destination: row.destination,
                 fiber_name: row.fiber_name,
                 usage: updates.usage,
                 source: 'AUTO',
                 notes: noteWithId,
                 department: updates.department,
                 contact: updates.contact,
                 net_start: updates.net_start,
                 net_end: updates.net_end,
                 // Auto-assign core number for virtual rows
                 core_count: row._assignedCore || '1'
             };
             
             await addRecord(newRecord);
        }

        // 2.2 Update Existing Records
        for(const record of recordsToUpdate) {
            // Append PathID to EXISTING record notes to preserve history if any
            const currentRecordNotes = record.notes ? String(record.notes) : '';
            
            const updatePayload = {
                ...updates,
                notes: noteWithId
            };

            // Fix: If core_count is missing (marked by _assignedCore), assign it
            if (record._assignedCore) {
                updatePayload.core_count = record._assignedCore;
            }

            await updateRecord(record.id, updatePayload, record._table);
        }

        // 3. Save to History Table (Supabase) - Only if records updated successfully
        const historyData = {
            id: pathId,
            start_station: path.originalStart,
            end_station: path.originalEnd,
            path_nodes: path.nodes, 
            usage: updates.usage,
            department: updates.department,
            contact: updates.contact,
            notes: existingNotes,
            applicant: null, 
            created_at: new Date().toISOString()
        };
        await savePathHistory(historyData);
        
        alert("新增成功！路徑 ID: " + pathId);
        
        // Clear Form and reset UI
        document.getElementById('auto-usage').value = '';
        document.getElementById('auto-notes').value = '';
        document.getElementById('path-details-form').style.display = 'none';
        document.getElementById('path-list').innerHTML = '';
        document.getElementById('path-results').style.display = 'none';
        
        // Re-enable core count input for new search
        const coreInput = document.getElementById('auto-core-count');
        if(coreInput) coreInput.disabled = false;

        selectedPathIndex = -1;
        
        // Refresh Data
        await loadData(); 
        renderDataTable(); 
        
        // Switch to Management Tab to show the new record
        switchAutoTab('mgmt');
        
    } catch(e) {
        console.error(e);
        alert("錯誤: " + e.message + "\n(路徑未儲存)");
    } finally {
        const btn = document.getElementById('confirm-auto-add-btn');
        if(btn) {
            btn.disabled = false;
            btn.innerText = "確認新增並佔用線路";
        }
    }
}

window.viewPathOnMap = function(pathId) {
    const data = getData();
    // Find any record with this PathID
    const record = data.find(d => d.notes && d.notes.includes(`[PathID:${pathId}]`));
    
    if(!record) {
        alert("找不到路徑資料");
        return;
    }
    
    // Extract Nodes
    const match = record.notes.match(/\[PathNodes:([^\]]+)\]/);
    if(match) {
        const nodes = match[1].split(',');
        currentHighlightedPath = nodes;
        
        // Switch to Map View
        const mapBtn = document.querySelector('[data-target="map-view"]');
        if(mapBtn) {
            mapBtn.click();
            
            // Hide Sidebar
            const sidebar = document.querySelector('.sidebar');
            if(sidebar) sidebar.style.display = 'none';
            
            // Show Restore Button
            const restoreBtn = document.getElementById('restore-sidebar-btn');
            if(restoreBtn) restoreBtn.style.display = 'inline-flex';
        }
    } else {
        alert("此路徑未包含視覺化資料");
    }
};

window.showPathDetails = function(pathId) {
    if (!window.lastPathHistoryList) return;
    const path = window.lastPathHistoryList.find(p => p.id === pathId);
    if (!path) return;

    let nodes = [];
    if (path.nodes) {
         nodes = typeof path.nodes === 'string' ? JSON.parse(path.nodes) : path.nodes;
    } else if (path.path_nodes) {
         nodes = typeof path.path_nodes === 'string' ? JSON.parse(path.path_nodes) : path.path_nodes;
    }

    const container = document.getElementById('path-container');
    if (!container) return;

    if (document.getElementById('modal-path-title')) {
        document.getElementById('modal-path-title').textContent = `詳細路徑: ${path.start_station || nodes[0]} ➝ ${path.end_station || nodes[nodes.length-1]}`;
    }
    
    container.innerHTML = '';
    
    if (!nodes || nodes.length === 0) {
        container.innerHTML = '無路徑資料';
    } else {
        const pathDiv = document.createElement('div');
        pathDiv.style.display = 'flex';
        pathDiv.style.alignItems = 'center';
        pathDiv.style.gap = '10px';
        pathDiv.style.flexWrap = 'wrap';
        pathDiv.style.padding = '20px';
        pathDiv.style.justifyContent = 'center';

        nodes.forEach((nodeName, index) => {
            const node = document.createElement('div');
            node.className = 'path-node';
            node.innerHTML = `<strong>${nodeName}</strong>`;
            
            pathDiv.appendChild(node);

            if (index < nodes.length - 1) {
                const arrow = document.createElement('div');
                arrow.innerHTML = '➜';
                arrow.style.fontSize = '20px';
                arrow.style.color = '#555';
                pathDiv.appendChild(arrow);
            }
        });
        
        container.appendChild(pathDiv);
    }

    // 2. Display Detailed Records Table
    const allData = getData();
    // Filter records that belong to this path (using PathID in notes)
    const pathRecords = allData.filter(d => d.notes && d.notes.includes(`[PathID:${pathId}]`));

    if (pathRecords.length > 0) {
        // Sort records by order in path
        const sortedRecords = [];
        const usedRecordIds = new Set();
        
        // Iterate through path segments to find matching records
        for (let i = 0; i < nodes.length - 1; i++) {
            const u = nodes[i];
            const v = nodes[i+1];
            
            const segmentRecords = pathRecords.filter(r => {
                if (usedRecordIds.has(r.id)) return false;
                
                const rStart = normalizeStationName(r.station_name);
                const rEnd = normalizeStationName(r.destination);
                
                // Check if record connects u and v (bidirectional check)
                const match = (rStart === u && rEnd === v) || (rStart === v && rEnd === u);
                return match;
            });
            
            // Sort segment records by core count/number if needed, or just keep as is
            // Usually we want lower core numbers first? 
            // Let's assume default order is fine or sort by fiber_name/core
            segmentRecords.sort((a, b) => {
                // Try to sort by numeric part of fiber_name if possible
                const nA = parseInt((a.fiber_name || '').replace(/\D/g, '')) || 0;
                const nB = parseInt((b.fiber_name || '').replace(/\D/g, '')) || 0;
                return nA - nB;
            });

            segmentRecords.forEach(r => {
                // Determine display direction: if record is stored as V->U but path is U->V, mark as reversed
                const rStart = normalizeStationName(r.station_name);
                const isReversed = (rStart === v); // If record start is 'v' (destination of this segment), it's reversed
                
                sortedRecords.push({ data: r, isReversed: isReversed });
                usedRecordIds.add(r.id);
            });
        }
        
        // Add any remaining records (fallback)
        pathRecords.forEach(r => {
            if (!usedRecordIds.has(r.id)) {
                sortedRecords.push({ data: r, isReversed: false });
            }
        });

        const detailsDiv = document.createElement('div');
        detailsDiv.style.marginTop = '20px';
        detailsDiv.style.borderTop = '1px solid #555';
        detailsDiv.style.paddingTop = '10px';
        
        detailsDiv.innerHTML = '<h3 style="margin-bottom:10px; color:#ddd;">詳細線路資料</h3>';
        
        const tableContainer = document.createElement('div');
        tableContainer.style.overflowX = 'auto';
        
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.fontSize = '0.9rem';
        
        // Header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr style="background-color: #333; color: #fff;">
                <th style="padding:8px; border:1px solid #555; text-align:left;">站點</th>
                <th style="padding:8px; border:1px solid #555; text-align:left;">線路名稱</th>
                <th style="padding:8px; border:1px solid #555; text-align:left;">目的地</th>
                <th style="padding:8px; border:1px solid #555; text-align:center;">芯數</th>
                <th style="padding:8px; border:1px solid #555; text-align:center;">Port</th>
                <th style="padding:8px; border:1px solid #555; text-align:left;">備註</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Body
        const tbody = document.createElement('tbody');
        sortedRecords.forEach(item => {
            const r = item.data;
            const isReversed = item.isReversed;
            
            // Swap display if reversed to match path flow
            const displayStart = isReversed ? r.destination : r.station_name;
            const displayEnd = isReversed ? r.station_name : r.destination;
            
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #444';
            tr.innerHTML = `
                <td style="padding:8px; border:1px solid #555;">${displayStart || '-'}</td>
                <td style="padding:8px; border:1px solid #555;">${r.fiber_name || '-'}</td>
                <td style="padding:8px; border:1px solid #555;">${displayEnd || '-'}</td>
                <td style="padding:8px; border:1px solid #555; text-align:center;">${r.core_count || '-'}</td>
                <td style="padding:8px; border:1px solid #555; text-align:center;">${r.port || '-'}</td>
                <td style="padding:8px; border:1px solid #555; font-size:0.85em; color:#aaa;">${(r.notes||'').replace(/\[PathID:[^\]]+\]/g, '').replace(/\[PathNodes:[^\]]+\]/g, '').trim()}</td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        
        tableContainer.appendChild(table);
        detailsDiv.appendChild(tableContainer);
        container.appendChild(detailsDiv);
    }
    
    const modal = document.getElementById('path-modal');
    if (modal) openModal(modal);
};



window.deletePath = async function(pathId) {
    if(!isAdminLoggedIn) {
        alert("權限不足：僅管理員可刪除路徑");
        return;
    }
    if(!confirm('確定要刪除此路徑並釋放所有相關芯線嗎？\n(這將清除用途、芯數、Port等資料並恢復為可用狀態)')) return;
    
    const data = getData();
    // 1. Clear Core Records (Notes)
    const records = data.filter(d => d.notes && d.notes.includes(`[PathID:${pathId}]`));
    
    try {
        if(records.length > 0) {
            for(const r of records) {
                let shouldDelete = false;

                if (r.source === 'AUTO') {
                    // Check if this core number is valid within fiber capacity
                    // If valid, we should KEEP it as an empty core (fill gap)
                    // If invalid (e.g. temporary core > capacity?), delete it.
                    
                    const fName = (r.fiber_name || '').trim();
                    const capMatch = fName.match(/^(\d+)[-_]/);
                    const capacity = capMatch ? parseInt(capMatch[1]) : 0;
                    const coreNum = parseInt(r.core_count);
                    
                    // If core number is valid and <= capacity, we keep it to maintain "1-48" structure
                    if (capacity > 0 && !isNaN(coreNum) && coreNum <= capacity && coreNum >= 1) {
                        shouldDelete = false;
                    } else {
                        // If it exceeds capacity or is invalid, we can delete it (cleanup)
                        // OR if user wants to keep everything? 
                        // User said: "48 cores must be 1-48". 
                        // So extra cores (if any) could be deleted, but let's be safe and delete only if clearly out of bounds or no capacity found.
                        shouldDelete = true;
                    }
                }

                if (shouldDelete) {
                    // 如果是自動生成的虛擬路徑且超出範圍，直接刪除該筆資料
                    await deleteRecord(r.id, r._table);
                } else {
                    // 如果是既有實體線路被佔用，或是需要保留的自動生成線路(補齊編號)
                    // 則清除使用資訊，使其變為"可用"狀態
                    await updateRecord(r.id, {
                        usage: null,
                        department: null,
                        contact: null,
                        phone: null, 
                        notes: null,
                        // core_count: null, // DO NOT CLEAR CORE COUNT. User wants to preserve it.
                        // Wait, for manual records, core_count is usually fixed. 
                        // For AUTO records, we just decided to keep it.
                        // But if we clear core_count, it becomes "Unnumbered".
                        // User specifically said: "Don't delete core number".
                        // So we remove core_count from this list.
                        port: null,
                        net_start: null,
                        net_end: null,
                        connection_line: null
                    }, r._table);
                }
            }
        }
        
        // 2. Delete from History
        await deletePathHistory(pathId);
        
        alert(`已成功刪除路徑並釋放 ${records.length} 筆芯線資料，同時移除歷史紀錄。`);
        window.loadPathMgmtList(); // Refresh list
        renderDataTable(); // Refresh main table
    } catch(e) {
        console.error(e);
        alert('刪除失敗: ' + e.message);
    }
};

window.openEditPathModal = function(pathId) {
    if(!isAdminLoggedIn) {
        alert("權限不足");
        return;
    }
    
    const data = getData();
    const records = data.filter(d => d.notes && d.notes.includes(`[PathID:${pathId}]`));
    
    if(records.length === 0) {
        alert("找不到路徑資料");
        return;
    }
    
    // Use the first record to populate (assuming consistency)
    const r = records[0];
    
    // Extract and preserve PathNodes
    let pathNodesStr = '';
    const nodesMatch = r.notes.match(/\[PathNodes:[^\]]+\]/);
    if(nodesMatch) pathNodesStr = nodesMatch[0];
    
    // Store for saving
    document.getElementById('edit-path-modal').dataset.pathNodes = pathNodesStr;

    const notesClean = r.notes.replace(`[PathID:${pathId}]`, '')
                              .replace(/\[PathNodes:[^\]]+\]/, '')
                              .trim();
    
    document.getElementById('edit-path-id').value = pathId;
    document.getElementById('edit-path-usage').value = r.usage || '';
    document.getElementById('edit-path-department').value = r.department || '';
    document.getElementById('edit-path-contact').value = r.contact || '';
    document.getElementById('edit-path-notes').value = notesClean;
    
    openModal(document.getElementById('edit-path-modal'));
};

const editPathForm = document.getElementById('edit-path-form');
if(editPathForm) {
    editPathForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const pathId = document.getElementById('edit-path-id').value;
        const updates = {
            usage: document.getElementById('edit-path-usage').value.trim(),
            department: document.getElementById('edit-path-department').value.trim(),
            contact: document.getElementById('edit-path-contact').value.trim(),
            notes: document.getElementById('edit-path-notes').value.trim()
        };
        
        if(!updates.usage) {
            alert("用途為必填");
            return;
        }
        
        // Re-append PathID and PathNodes
        const savedPathNodes = document.getElementById('edit-path-modal').dataset.pathNodes || '';
        const noteWithId = (updates.notes ? updates.notes + ' ' : '') + `[PathID:${pathId}]` + (savedPathNodes ? ' ' + savedPathNodes : '');
        updates.notes = noteWithId;
        
        try {
            const data = getData();
            const records = data.filter(d => d.notes && d.notes.includes(`[PathID:${pathId}]`));
            
            const btn = editPathForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerText = "儲存中...";
            
            for(const r of records) {
                await updateRecord(r.id, updates, r._table);
            }
            
            alert("更新成功！");
            closeModal(document.getElementById('edit-path-modal'));
            
            await loadData();
            loadPathMgmtList();
            renderDataTable();
        } catch(e) {
            console.error(e);
            alert("更新失敗: " + e.message);
        } finally {
             const btn = editPathForm.querySelector('button[type="submit"]');
             btn.disabled = false;
             btn.innerText = "儲存變更";
        }
    });
}



function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, duration);
}





// Auto Fit Map Logic
function fitMapToView() {
    const mapWrapper = document.querySelector('.map-container');
    const mapInner = document.getElementById('fiber-map');
    const nodes = document.querySelectorAll('.site-node');
    
    if (!mapWrapper || !mapInner || nodes.length === 0) return false;

    // Get Dimensions
    const wrapperRect = mapWrapper.getBoundingClientRect();
    // Use offsetWidth for inner content to get unscaled size
    const innerW = mapInner.offsetWidth; 
    const innerH = mapInner.offsetHeight;

    if (wrapperRect.width === 0 || wrapperRect.height === 0 || innerW === 0 || innerH === 0) return false;

    // Calculate Bounding Box of Nodes (in pixels relative to mapInner)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    nodes.forEach(node => {
        // Parse left/top percentages
        const leftPct = parseFloat(node.style.left);
        const topPct = parseFloat(node.style.top);
        
        if (isNaN(leftPct) || isNaN(topPct)) return;

        const x = (leftPct / 100) * innerW;
        const y = (topPct / 100) * innerH;
        
        // Approximate node size (half-width/height for center offset + margin)
        // Nodes are centered (translate -50%), so x,y is the center.
        // Assume max node size ~150x80 px
        const halfW = 80;
        const halfH = 40;
        
        minX = Math.min(minX, x - halfW);
        maxX = Math.max(maxX, x + halfW);
        minY = Math.min(minY, y - halfH);
        maxY = Math.max(maxY, y + halfH);
    });

    if (minX === Infinity) return false;

    // Add Padding
    const padding = 40; // px
    const contentW = (maxX - minX) + (padding * 2);
    const contentH = (maxY - minY) + (padding * 2);
    
    // Calculate Scale
    const availW = wrapperRect.width;
    const availH = wrapperRect.height;
    
    const scaleX = availW / contentW;
    const scaleY = availH / contentH;
    
    // Choose smaller scale to fit both dimensions
    let newScale = Math.min(scaleX, scaleY);
    
    // Clamp Scale
    // Allow zooming out significantly for large maps, but cap zooming in
    newScale = Math.min(Math.max(newScale, 0.1), 1.5); 

    // Calculate Center
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    
    // We want contentCenterX * newScale + tx = availW / 2
    // tx = (availW / 2) - (contentCenterX * newScale)
    const newTx = (availW / 2) - (contentCenterX * newScale);
    const newTy = (availH / 2) - (contentCenterY * newScale);
    
    // Apply
    mapState.scale = newScale;
    mapState.tx = newTx;
    mapState.ty = newTy;
    
    // Update DOM
    const updateTransform = () => {
        mapInner.style.transform = `translate(${mapState.tx}px, ${mapState.ty}px) scale(${mapState.scale})`;
    };
    updateTransform();
    
    return true;
}

// Map Panning & Zooming Logic
function initMapPanning() {
    const mapInner = document.getElementById('fiber-map');
    const mapWrapper = document.querySelector('.map-container');
    
    if (!mapWrapper || !mapInner) return;

    // Helper to apply transform
    const updateTransform = () => {
        mapInner.style.transform = `translate(${mapState.tx}px, ${mapState.ty}px) scale(${mapState.scale})`;
    };
    
    // Apply initial state
    updateTransform();

    // --- Panning ---
    const onMouseDown = (e) => {
        if (e.target.closest('.site-node')) return;
        
        mapState.panning = true;
        mapState.startX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
        mapState.startY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
        
        mapWrapper.style.cursor = 'grabbing';
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('touchmove', onMouseMove, { passive: false });
        document.addEventListener('touchend', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!mapState.panning) return;
        
        // Check for pinch (2 fingers) -> Zoom logic handles this, ignore pan
        if (e.touches && e.touches.length === 2) return;

        const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
        const clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
        
        const dx = clientX - mapState.startX;
        const dy = clientY - mapState.startY;
        
        mapState.tx += dx;
        mapState.ty += dy;
        mapState.startX = clientX;
        mapState.startY = clientY;
        
        updateTransform();
        
        if (e.cancelable) e.preventDefault();
    };

    const onMouseUp = () => {
        if (mapState.panning) {
            mapState.panning = false;
            mapWrapper.style.cursor = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('touchmove', onMouseMove);
            document.removeEventListener('touchend', onMouseUp);
            
            // Save state
            localStorage.setItem('fiber_map_state', JSON.stringify({
                tx: mapState.tx,
                ty: mapState.ty,
                scale: mapState.scale
            }));
        }
    };

    mapWrapper.addEventListener('mousedown', onMouseDown);
    mapWrapper.addEventListener('touchstart', onMouseDown, { passive: false });

    // --- Zooming (Wheel) ---
    mapWrapper.addEventListener('wheel', (e) => {
        e.preventDefault(); // Stop page scroll
        
        const zoomIntensity = 0.1;
        const direction = e.deltaY > 0 ? -1 : 1;
        const factor = 1 + (direction * zoomIntensity);
        
        const rect = mapWrapper.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const newScale = Math.min(Math.max(0.1, mapState.scale * factor), 5);
        const actualFactor = newScale / mapState.scale;
        
        mapState.tx = mouseX - (mouseX - mapState.tx) * actualFactor;
        mapState.ty = mouseY - (mouseY - mapState.ty) * actualFactor;
        mapState.scale = newScale;
        
        updateTransform();
        
        localStorage.setItem('fiber_map_state', JSON.stringify({
            tx: mapState.tx,
            ty: mapState.ty,
            scale: mapState.scale
        }));
    }, { passive: false });

    // --- Zooming (Pinch) ---
    let initialPinchDistance = null;
    let initialScale = 1;

    const getDistance = (touches) => {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };

    mapWrapper.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            initialPinchDistance = getDistance(e.touches);
            initialScale = mapState.scale;
            mapState.panning = false; // Stop panning
        }
    }, { passive: false });

    mapWrapper.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && initialPinchDistance) {
            e.preventDefault();
            const currentDistance = getDistance(e.touches);
            const factor = currentDistance / initialPinchDistance;
            
            const newScale = Math.min(Math.max(0.1, initialScale * factor), 5);
            
            mapState.scale = newScale;
            updateTransform();
        }
    }, { passive: false });
    
    mapWrapper.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            initialPinchDistance = null;
            
            localStorage.setItem('fiber_map_state', JSON.stringify({
                tx: mapState.tx,
                ty: mapState.ty,
                scale: mapState.scale
            }));
        }
    });
}

// Navigation
if (navBtns.length > 0) {
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            console.log("Nav clicked:", targetId);

            // Admin Permission Check for Auto Add
            // REMOVED: Allow general users to access the tab for Querying (Mgmt)
            // Specific actions (Generate/Confirm) will be restricted instead.
            /*
            if (targetId === 'auto-add' && !isAdminLoggedIn) {
                alert('權限不足：此功能僅供管理員使用。請先登入。');
                const loginModal = document.getElementById('login-modal');
                if (loginModal) openModal(loginModal);
                return;
            }
            */

            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            viewSections.forEach(section => {
                section.classList.remove('active');
                if (section.id === targetId) section.classList.add('active');
            });
            
            if (targetId === 'dashboard') renderDashboard();
            if (targetId === 'map-view') renderMap();
            if (targetId === 'data-mgmt') renderDataTable();
            if (targetId === 'auto-add') initAutoAddView();
        });
    });
} else {
    console.error("No navigation buttons found!");
}

// Search Statistics Logic
let lastSearchResults = [];

function calculateAndRenderStats(results) {
    lastSearchResults = results;
    const container = document.getElementById('search-stats-container');
    if (!container) return;

    if (!results || results.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '1rem';
    container.innerHTML = '';

    // Helper to check usage (Same logic as dataService)
    const isRowUsed = (row) => {
        return (row.usage && String(row.usage).trim().length > 0) || 
               (row.destination && String(row.destination).trim().length > 0) || 
               (row.net_end && String(row.net_end).trim().length > 0) || 
               (row.department && String(row.department).trim().length > 0);
    };

    const getStatsMap = (field) => {
        const stats = {};
        results.forEach(row => {
            const val = row[field] || '未分類';
            if (!stats[val]) stats[val] = { total: 0, used: 0 };
            stats[val].total++;
            if (isRowUsed(row)) stats[val].used++;
        });
        return stats;
    };

    const applyFilters = () => {
        const selects = container.querySelectorAll('select');
        let filtered = [...lastSearchResults];

        selects.forEach(sel => {
            if (sel.value !== 'ALL') {
                const field = sel.dataset.field;
                filtered = filtered.filter(row => {
                    const val = row[field] || '未分類';
                    return val === sel.value;
                });
            }
        });

        renderTableRows(dataTableBody, filtered);
    };

    const createDropdown = (label, field) => {
        const stats = getStatsMap(field);
        const wrapper = document.createElement('div');
        wrapper.className = 'stat-group';
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';

        const labelEl = document.createElement('label');
        labelEl.textContent = `${label}: `;
        labelEl.style.marginRight = '0.5rem';
        labelEl.style.color = 'var(--text-muted)';

        const select = document.createElement('select');
        select.className = 'stat-select';
        select.dataset.field = field;
        select.addEventListener('change', applyFilters);
        
        const totalUsed = results.filter(isRowUsed).length;
        const defaultOption = document.createElement('option');
        defaultOption.value = 'ALL';
        defaultOption.textContent = `全部 (${totalUsed})`;
        select.appendChild(defaultOption);

        Object.entries(stats)
            .sort((a,b) => b[1].used - a[1].used)
            .forEach(([key, stat]) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = `${key} (${stat.used})`;
                select.appendChild(option);
            });

        wrapper.appendChild(labelEl);
        wrapper.appendChild(select);
        return wrapper;
    };

    container.appendChild(createDropdown('線路名稱', 'fiber_name'));
    container.appendChild(createDropdown('芯數', 'core_count'));
    container.appendChild(createDropdown('站點', 'station_name'));
    container.appendChild(createDropdown('用途', 'usage'));
    container.appendChild(createDropdown('使用單位', 'department'));
}

// Search Handler
if (searchBtn && globalSearchInput) {
    const performSearch = () => {
        const query = globalSearchInput.value.trim();
        if (!query) return;

        console.log("Searching for:", query);
        const results = searchLine(query);
        
        // Switch to Data Management view
        navBtns.forEach(b => b.classList.remove('active'));
        viewSections.forEach(s => s.classList.remove('active'));
        
        const dataBtn = document.querySelector('[data-target="data-mgmt"]');
        const dataSection = document.getElementById('data-mgmt');
        
        if (dataBtn) dataBtn.classList.add('active');
        if (dataSection) dataSection.classList.add('active');
        
        // Calculate and Render Stats
        calculateAndRenderStats(results);

        // Add Bulk Delete Button if Admin and filtered
        const bulkDeleteContainer = document.getElementById('bulk-delete-container');
        if (bulkDeleteContainer) {
            bulkDeleteContainer.innerHTML = '';
            if (isAdminLoggedIn && results.length > 0 && query) {
                 const deleteBtn = document.createElement('button');
                 deleteBtn.textContent = `🗑️ 刪除搜尋到的 ${results.length} 筆資料`;
                 deleteBtn.className = 'action-btn';
                 deleteBtn.style.backgroundColor = 'var(--danger-color)';
                 deleteBtn.style.marginBottom = '10px';
                 deleteBtn.onclick = async () => {
                     if(confirm(`警告：確定要刪除搜尋結果中的所有 ${results.length} 筆資料嗎？\n此操作無法復原！`)) {
                         try {
                             deleteBtn.disabled = true;
                             deleteBtn.textContent = '刪除中...';
                             
                             // Batch delete
                             for(const row of results) {
                                 await deleteRecord(row.id, row._table);
                             }
                             
                             alert('刪除完成');
                            // User Request: Maintain search view after delete
                            // Do NOT clear search input
                            // globalSearchInput.value = '';
                            
                            // Reload data to ensure consistency
                            await loadData();
                            
                            // Re-run search to update the view
                            performSearch();
                        } catch(e) {
                            console.error(e);
                            alert('刪除過程發生錯誤: ' + e.message);
                            // Reload anyway to show current state
                            await loadData();
                            // If search input still has value, re-search, otherwise reset
                            if (globalSearchInput.value.trim()) {
                                performSearch();
                            } else {
                                renderDataTable();
                            }
                        }
                     }
                 };
                 bulkDeleteContainer.appendChild(deleteBtn);
            }
        }

        renderTableRows(dataTableBody, results);
        
        // Reset site selector
        if (siteSelector) siteSelector.value = "";
    };

    searchBtn.addEventListener('click', performSearch);
    globalSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performSearch();
    });
}

// Map Edit Controls
const editMapBtn = document.getElementById('edit-map-btn');
const refreshMapBtn = document.getElementById('refresh-map-btn');
const multiCenterSortBtn = document.getElementById('multi-center-sort-btn');
const saveMapBtn = document.getElementById('save-map-btn');
const addLinkBtn = document.getElementById('add-link-btn');
const addStationBtn = document.getElementById('add-station-btn');

if (multiCenterSortBtn) {
    multiCenterSortBtn.addEventListener('click', () => {
        if (!isAdminLoggedIn) {
            alert('權限不足：僅管理員可執行排序變更');
            return;
        }

        if (currentMainSites.length === 0) {
            alert('請先在站點詳情中設定至少一個中心站點！');
            return;
        }

        if (confirm('確定要依據目前的中心點重新排列相關站點嗎？\n這將會清除相關站點的手動位置設定。')) {
            // We need to identify which nodes are in the cluster to clear their saved positions
            const data = getData();
            const nodes = {};
            const links = [];
            
            // Rebuild graph structure (simplified)
            data.forEach(row => {
                if (row.station_name) nodes[row.station_name] = { name: row.station_name };
                if (row.station_name && row.destination) {
                    if (row.station_name !== row.destination) {
                        links.push({ source: row.station_name, target: row.destination });
                    }
                }
            });

            const queue = [...currentMainSites];
            const visited = new Set(currentMainSites);
            
            // BFS to find all connected nodes
            while (queue.length > 0) {
                const currentName = queue.shift();
                
                // Find neighbors
                // Outgoing
                links.filter(l => l.source === currentName).forEach(l => {
                    if (!visited.has(l.target)) {
                        visited.add(l.target);
                        queue.push(l.target);
                    }
                });
                // Incoming
                links.filter(l => l.target === currentName).forEach(l => {
                    if (!visited.has(l.source)) {
                        visited.add(l.source);
                        queue.push(l.source);
                    }
                });
            }

            // Clear saved positions for these nodes (EXCEPT the roots themselves, so they stay anchored)
            visited.forEach(name => {
                if (!currentMainSites.includes(name)) {
                    delete nodePositions[name];
                }
            });

            // Re-render
            renderMap();
        }
    });
}

if (editMapBtn) {
    editMapBtn.addEventListener('click', () => {
        if (!isAdminLoggedIn) {
            alert('請先登入管理員模式！');
            return;
        }
        isEditMode = !isEditMode;
        editMapBtn.textContent = isEditMode ? '💾 完成編輯' : '✏️ 編輯架構';
        editMapBtn.style.backgroundColor = isEditMode ? 'var(--success-color)' : 'var(--warning-color)';
        
        if (addLinkBtn) addLinkBtn.style.display = isEditMode ? 'inline-block' : 'none';
        if (addStationBtn) addStationBtn.style.display = isEditMode ? 'inline-block' : 'none';

        // Re-render map to show/hide edit handles
        renderMap();
        
        if (isEditMode) {
            alert('進入編輯模式：\n1. 拖曳節點可移動位置\n2. 雙擊節點可重新命名\n3. 點擊連線可刪除\n4. 點擊「新增連線」按鈕可建立新連接');
        }
    });
}

if (addLinkBtn) {
    addLinkBtn.addEventListener('click', async () => {
        // Start Connection Creation Mode
        connectionCreationState = {
            active: true,
            step: 1,
            source: null,
            target: null
        };
        
        showToast("請點選【起點】站點", 5000);
        
        if (mapContainer) mapContainer.style.cursor = 'crosshair';
    });
}

let stationCreationState = { active: false };
if (addStationBtn) {
    addStationBtn.addEventListener('click', () => {
        if (!isAdminLoggedIn) {
            alert('請先登入管理員模式！');
            return;
        }
        if (!isEditMode) {
            alert('請先切換到編輯模式');
            return;
        }
        stationCreationState = { active: true };
        showToast('請在架構圖上點選位置以增加站點', 5000);
        if (mapContainer) mapContainer.style.cursor = 'crosshair';
    });
}

if (mapContainer) {
    mapContainer.addEventListener('click', async (e) => {
        if (!stationCreationState.active) return;
        if (e.target.closest('.site-node')) return;
        const rect = mapContainer.getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        const yPct = ((e.clientY - rect.top) / rect.height) * 100;
        const name = prompt('請輸入新站點名稱：', '');
        if (!name) {
            stationCreationState = { active: false };
            mapContainer.style.cursor = '';
            return;
        }
        try {
            const exists = getData().some(d => d.station_name === name);
            if (!exists) {
                await addRecord({ station_name: name, source: 'MANUAL', notes: '架構圖新增站點' });
                await loadData();
            }
            nodePositions[name] = { x: xPct, y: yPct };
            stationCreationState = { active: false };
            mapContainer.style.cursor = '';
            renderMap();
            renderDataTable();
        } catch (err) {
            stationCreationState = { active: false };
            mapContainer.style.cursor = '';
            alert('新增站點失敗: ' + err.message);
        }
    });
}

async function finishConnectionCreation(source, target) {
    const fiberName = prompt(`建立連線: ${source} -> ${target}\n請輸入光纜名稱 (例如: 96C)：`, "96C");
    if (fiberName === null) return; // User cancelled
    
    const coreCount = prompt("請輸入芯數：", "96");
    if (coreCount === null) return;
    
    try {
        // Create a new record representing this connection
        await addRecord({
            station_name: source,
            destination: target,
            fiber_name: fiberName,
            core_count: coreCount,
            usage: '預留',
                source: 'MANUAL',
            notes: '架構圖手動新增'
        });
        alert("連線建立成功！");
            await loadData();
            renderMap(); 
            renderDataTable();
    } catch (e) {
        console.error(e);
        alert("建立失敗：" + e.message);
    }
}


if (refreshMapBtn) {
    refreshMapBtn.addEventListener('click', () => {
        renderMap();
    });
}

if (saveMapBtn) {
    saveMapBtn.addEventListener('click', async () => {
        if (!isAdminLoggedIn) return;
        
        try {
            saveMapBtn.disabled = true;
            saveMapBtn.textContent = '儲存中...';
            
            await setAppSettings('fiber_node_positions', JSON.stringify(nodePositions));
            
            alert('佈局儲存成功！所有使用者將看到此畫面。');
        } catch (e) {
            alert('儲存失敗：' + e.message);
        } finally {
            saveMapBtn.disabled = false;
            saveMapBtn.textContent = '💾 儲存佈局';
        }
    });
}

// Modals
    function openModal(modal) {
        if (modal) modal.classList.remove('hidden');
    }

    function closeModal(modal) {
        if (modal) modal.classList.add('hidden');
    }

    // Initialize Map Panning
    initMapPanning();

    if (closeModals) {
    closeModals.forEach(btn => {
        btn.addEventListener('click', (e) => {
            closeModal(e.target.closest('.modal'));
        });
    });
}

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeModal(e.target);
    }
});

// Map Rendering
function renderMap() {
    const data = getData();
    if (!mapContainer) return;
    mapContainer.innerHTML = ''; // Clear
    
    // 1. Build Graph from ALL data
    const nodes = {}; 
    const links = [];
    const createdLinks = new Set();

    // Helper to ensure node exists
    const ensureNode = (name) => {
        if (!name) return null;
        const key = name.trim();
        if (!nodes[key]) {
            nodes[key] = { name: key, level: 0, inputs: 0, outputs: 0 };
        }
        return nodes[key];
    };

    // Initialize nodes from data
    data.forEach(row => {
        if (row.station_name) ensureNode(row.station_name);
        
        if (row.station_name && row.destination) {
            const source = ensureNode(row.station_name);
            const target = ensureNode(row.destination);
            
            if (source && target && source.name !== target.name) {
                const linkKey = `${source.name}->${target.name}`;
                if (!createdLinks.has(linkKey)) {
                    createdLinks.add(linkKey);
                    links.push({ source: source.name, target: target.name });
                    source.outputs++;
                    target.inputs++;
                }
            }
        }
    });

    if (Object.keys(nodes).length === 0) {
        mapContainer.innerHTML = '<div class="map-placeholder">暫無資料</div>';
        return;
    }

    // 2. Calculate Levels (BFS) - Multi-Cluster Logic
    const activeRoots = currentMainSites.map(name => nodes[name]).filter(n => n);
    const visited = new Set();
    const clusters = {}; // { rootName: [nodes...] }
    const nodeOwnership = {}; // { nodeName: rootName }

    // Initialize Clusters
    activeRoots.forEach(root => {
        clusters[root.name] = [];
        nodeOwnership[root.name] = root.name; // Root owns itself
        visited.add(root.name);
        root.level = 0;
    });
    
    // Only run BFS if we have active roots
    if (activeRoots.length > 0) {
        // Multi-Source BFS
        // Queue Item: { node, rootName }
        let queue = activeRoots.map(root => ({ node: root, rootName: root.name }));
        
        let maxIterations = Object.keys(nodes).length * 2;
        while (queue.length > 0 && maxIterations > 0) {
            maxIterations--;
            const { node: current, rootName } = queue.shift();
            
            // Collect neighbors (Both Outgoing and Incoming)
            const neighbors = [];
            links.filter(l => l.source === current.name).forEach(l => neighbors.push(nodes[l.target]));
            links.filter(l => l.target === current.name).forEach(l => neighbors.push(nodes[l.source]));

            neighbors.forEach(neighbor => {
                if (neighbor && !visited.has(neighbor.name)) {
                    visited.add(neighbor.name);
                    neighbor.level = current.level + 1;
                    
                    // Assign Ownership
                    nodeOwnership[neighbor.name] = rootName;
                    clusters[rootName].push(neighbor);
                    
                    queue.push({ node: neighbor, rootName: rootName });
                }
            });
        }
    } else {
        // If no roots selected, we might fallback to original logic or do nothing special here
        // The original logic calculated levels for everything starting from UDC.
        // We will skip global BFS if no user-selected root, and rely on the "Original Backbone Layout" block later.
    }

    // 3. Layout Strategy
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "connections");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.overflow = "visible"; 
    
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="55" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#3b82f6" />
        </marker>
        <marker id="arrow-red" markerWidth="10" markerHeight="10" refX="55" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#ef4444" />
        </marker>
    `;
    svg.appendChild(defs);
    mapContainer.appendChild(svg);

    if (activeRoots.length > 0) {
        // --- Custom Main Site Layout (Independent Clusters) ---
        
        // Iterate through each root and layout its owned nodes
        activeRoots.forEach(root => {
            // Determine Root Center (Default 50,50 or Saved Position)
            let rootX = 50;
            let rootY = 50;
            
            if (nodePositions[root.name]) {
                rootX = nodePositions[root.name].x;
                rootY = nodePositions[root.name].y;
            } else {
                // If multiple roots have no position, maybe spread them initially? 
                // But user says "drag to sort", so we assume they place the roots.
                // If they are all at 50,50, it will overlap.
                // Let's check if we have multiple roots without positions.
                if (activeRoots.length > 1 && !nodePositions[root.name]) {
                    // Spread them out in a circle if undefined
                    // This is a fallback initialization
                    const idx = activeRoots.indexOf(root);
                    const angle = (idx / activeRoots.length) * 2 * Math.PI;
                    rootX = 50 + 30 * Math.cos(angle);
                    rootY = 50 + 30 * Math.sin(angle);
                }
            }

            // Set Root Position (only if not saved, otherwise it's already set by loop end override)
            // Actually, we set .xPct here for the calculation of children
            root.xPct = rootX;
            root.yPct = rootY;
            root.isBackbone = true;

            // Get owned nodes for this cluster
            const clusterNodes = clusters[root.name] || [];
            
            // Group by level
            const levels = {};
            let maxLvl = 0;
            
            clusterNodes.forEach(n => {
                if (!levels[n.level]) levels[n.level] = [];
                levels[n.level].push(n);
                if (n.level > maxLvl) maxLvl = n.level;
            });

            // Layout Children Radially around THIS Root
            Object.entries(levels).forEach(([lvl, group]) => {
                const levelIdx = parseInt(lvl);
                
                // Radius increases with level
                const radius = 20 * levelIdx; 
                
                // Angle Step
                const step = (2 * Math.PI) / group.length;
                
                // Optional: Rotate each level slightly to avoid straight lines
                const offsetAngle = levelIdx * 0.2; 

                group.forEach((node, idx) => {
                    const angle = idx * step + offsetAngle;
                    node.xPct = rootX + radius * Math.cos(angle);
                    node.yPct = rootY + radius * Math.sin(angle);
                });
            });
        });

    } else {
        // --- Original Backbone Layout ---
        const backboneSequence = ['ROOM', 'UDC', '1PH', '2PH', 'DKB', 'MS2', 'MS3', 'MS4', '5KB', '2O2'];
        const radius = 45;
        const angleStep = (2 * Math.PI) / backboneSequence.length;
        
        const backboneNodes = [];
        backboneSequence.forEach((key, idx) => {
            const nodeName = Object.keys(nodes).find(n => {
                const normN = n.toUpperCase().replace('#', '');
                const normK = key.toUpperCase().replace('#', '');
                return normN.includes(normK) || normK.includes(normN);
            });

            if (nodeName && nodes[nodeName]) {
                const node = nodes[nodeName];
                const angle = idx * angleStep - (Math.PI / 2);
                node.xPct = 50 + radius * Math.cos(angle);
                node.yPct = 50 + radius * Math.sin(angle);
                node.isBackbone = true;
                node.level = -1; 
                backboneNodes.push(node);
            }
        });

        const satelliteGroups = {};
        backboneNodes.forEach(bn => satelliteGroups[bn.name] = []);
        const orphans = [];
        const nonBackboneNodes = Object.values(nodes).filter(n => !n.isBackbone);
        
        nonBackboneNodes.forEach(node => {
            const connectedBackbone = backboneNodes.find(bn => {
                return links.some(l => 
                    (l.source === node.name && l.target === bn.name) || 
                    (l.source === bn.name && l.target === node.name)
                );
            });

            if (connectedBackbone) {
                satelliteGroups[connectedBackbone.name].push(node);
            } else {
                orphans.push(node);
            }
        });

        Object.entries(satelliteGroups).forEach(([backboneName, group]) => {
            if (group.length === 0) return;
            const backboneNode = nodes[backboneName];
            const bx = backboneNode.xPct;
            const by = backboneNode.yPct;
            const angleFromCenter = Math.atan2(by - 50, bx - 50);
            
            let satelliteRadius = 25; 
            if (group.length > 5) satelliteRadius = 35;
            if (group.length > 10) satelliteRadius = 45;
            
            const totalArc = group.length > 4 ? (Math.PI * 0.9) : (Math.PI / 1.5);
            const startAngle = angleFromCenter - (totalArc / 2);
            
            group.forEach((node, idx) => {
                let offsetAngle = angleFromCenter;
                if (group.length > 1) {
                    offsetAngle = startAngle + (idx / (group.length - 1)) * totalArc;
                }
                node.xPct = bx + satelliteRadius * Math.cos(offsetAngle);
                node.yPct = by + satelliteRadius * Math.sin(offsetAngle);
            });
        });

        if (orphans.length > 0) {
            orphans.forEach((node, idx) => {
                const angle = (idx / orphans.length) * 2 * Math.PI;
                const r = 10;
                node.xPct = centerX + r * Math.cos(angle);
                node.yPct = centerY + r * Math.sin(angle);
            });
        }
    }

    // Override with saved positions
    Object.values(nodes).forEach(node => {
        if (nodePositions[node.name]) {
            node.xPct = nodePositions[node.name].x;
            node.yPct = nodePositions[node.name].y;
        }
    });

    // Create Elements
    Object.values(nodes).forEach(node => {
        const el = document.createElement('div');
        el.className = 'site-node';
        if (node.isBackbone) el.classList.add('backbone');
        if (isEditMode) el.classList.add('edit-mode');
        
        el.innerHTML = `
            <div>${node.name}</div>
            ${node.isBackbone ? '' : `<div style="font-size: 0.7em; opacity: 0.8">L${node.level}</div>`}
        `;
        el.style.left = `${node.xPct}%`;
        el.style.top = `${node.yPct}%`;
        el.setAttribute('data-site', node.name);
        
        // Highlight Logic for Nodes
        if (currentHighlightedPath) {
             const normName = normalizeStationName(node.name);
             if (currentHighlightedPath.includes(normName)) {
                 el.style.borderColor = '#f59e0b'; // Amber/Orange
                 el.style.borderWidth = '3px';
                 el.style.boxShadow = '0 0 20px rgba(245, 158, 11, 0.8)';
                 el.style.zIndex = '100';
                 el.style.transform = 'scale(1.1)'; // Slightly larger
             }
        }
        
        makeDraggable(el, node);

        let clickTimeout;
        el.addEventListener('click', (e) => {
            if (el.getAttribute('data-dragging') === 'true') return;
            
            // Connection Creation Logic
            if (connectionCreationState.active) {
                e.stopPropagation();
                
                if (connectionCreationState.step === 1) {
                    connectionCreationState.source = node.name;
                    connectionCreationState.step = 2;
                    showToast(`已選擇起點: ${node.name}。請點選【終點】站點`, 5000);
                    el.style.border = "3px solid #ef4444"; // Visual feedback
                    return;
                } else if (connectionCreationState.step === 2) {
                     if (node.name === connectionCreationState.source) {
                         alert("起點與終點不能相同！");
                         return;
                     }
                     
                    connectionCreationState.target = node.name;
                    const source = connectionCreationState.source;
                    const target = connectionCreationState.target;
                    
                    // Reset state
                    connectionCreationState = { active: false, step: 0, source: null, target: null };
                    if (mapContainer) mapContainer.style.cursor = '';
                    renderMap(); // Clear highlights
                    
                    // Delay slightly to allow render to clear
                    setTimeout(() => finishConnectionCreation(source, target), 100);
                    return;
                }
            }

            // Check if Manual Add tab is active for "Click to Select"
            const manualAddSection = document.getElementById('manual-add');
            if (manualAddSection && manualAddSection.classList.contains('active')) {
                 const sourceInput = document.querySelector('input[name="source"]');
                 if (sourceInput) {
                     sourceInput.value = node.name;
                     // Visual feedback
                     sourceInput.style.transition = 'background-color 0.3s';
                     sourceInput.style.backgroundColor = '#fef08a'; // Light yellow
                     setTimeout(() => sourceInput.style.backgroundColor = '', 500);
                     return; // Skip opening modal
                 }
            }

            if (clickTimeout) clearTimeout(clickTimeout);
            clickTimeout = setTimeout(() => {
                openSiteDetails(node.name);
            }, 250);
        });

        el.addEventListener('dblclick', async (e) => {
            if (clickTimeout) clearTimeout(clickTimeout);
            if (!isEditMode) return;
            e.stopPropagation();
            const newName = prompt(`請輸入站點 "${node.name}" 的新名稱：`, node.name);
            if (newName && newName !== node.name) {
                if (confirm(`確定要將 "${node.name}" 改名為 "${newName}" 嗎？\n這將會同步修改所有相關的線路資料。`)) {
                    await renameStation(node.name, newName);
                }
            }
        });
        
        mapContainer.appendChild(el);
    });

    // Draw Lines
    links.forEach(l => {
        drawLink(nodes[l.source], nodes[l.target], svg, 'normal');
    });

    // Helper to draw link
    function drawLink(source, target, svgContainer, type) {
        if (!source || !target || source.xPct === undefined || target.xPct === undefined) return;
        
        // 1. Visual Line
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", `${source.xPct}%`);
        line.setAttribute("y1", `${source.yPct}%`);
        line.setAttribute("x2", `${target.xPct}%`);
        line.setAttribute("y2", `${target.yPct}%`);
        
        let strokeColor = "#3b82f6";
        let strokeWidth = "2";
        let isHighlighted = false;

        // Highlight Logic for Links
        if (currentHighlightedPath) {
            const sNorm = normalizeStationName(source.name);
            const tNorm = normalizeStationName(target.name);
            const sIdx = currentHighlightedPath.indexOf(sNorm);
            const tIdx = currentHighlightedPath.indexOf(tNorm);
            
            // Check if they are adjacent in the path
            if (sIdx !== -1 && tIdx !== -1 && Math.abs(sIdx - tIdx) === 1) {
                 strokeColor = "#f59e0b";
                 strokeWidth = "5";
                 isHighlighted = true;
            }
        }

        line.setAttribute("stroke", strokeColor);
        line.setAttribute("stroke-width", strokeWidth); 
        line.setAttribute("marker-end", "url(#arrow)");
        
        if (isHighlighted) {
            // Add animation for visibility
            line.innerHTML = `<animate attributeName="stroke-opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />`;
            // Ensure highlighted lines are on top (by appending last? SVG doesn't have z-index)
            // We can handle this by sorting links before drawing, but for now this is okay.
        } else {
            // Clear animation if not highlighted (important for re-renders)
            line.innerHTML = '';
        }
        
        // Add Data Attributes for Update
        line.setAttribute("data-source", source.name);
        line.setAttribute("data-target", target.name);

        // 2. Invisible Hit Area (Thicker)
        const hitLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        hitLine.setAttribute("x1", `${source.xPct}%`);
        hitLine.setAttribute("y1", `${source.yPct}%`);
        hitLine.setAttribute("x2", `${target.xPct}%`);
        hitLine.setAttribute("y2", `${target.yPct}%`);
        hitLine.setAttribute("stroke", "transparent");
        hitLine.setAttribute("stroke-width", "15"); // Easy to click
        hitLine.style.cursor = isEditMode ? "pointer" : "default";

        // Add Data Attributes for Update
        hitLine.setAttribute("data-source", source.name);
        hitLine.setAttribute("data-target", target.name);

        // Make hitLine interactive for everyone
        hitLine.style.pointerEvents = 'all'; 
        hitLine.style.cursor = 'pointer';

        hitLine.addEventListener('click', async (e) => {
            e.stopPropagation();
            await handleConnectionClick(source.name, target.name);
        });

        // Hover effect
        hitLine.addEventListener('mouseenter', () => {
            line.setAttribute("stroke", "#ef4444"); // Red highlight
            // If strictly read-only, maybe blue? But red shows selection well.
        });
        hitLine.addEventListener('mouseleave', () => {
            line.setAttribute("stroke", "#3b82f6"); // Back to blue
        });
        
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `${source.name} -> ${target.name}`;
        line.appendChild(title);
        hitLine.appendChild(title.cloneNode(true));

        svgContainer.appendChild(line);
        svgContainer.appendChild(hitLine);
    }

    // Auto-fit on first load or whenever renderMap is called without user interaction override?
    // User requested "Original display to fit all sites".
    // We try to fit. If map is hidden, it fails and hasAutoFitted remains false.
    if (!hasAutoFitted) {
        if (fitMapToView()) {
            hasAutoFitted = true;
        }
    }

    if (mapContainer && mapState) {
        mapContainer.style.transform = `translate(${mapState.tx}px, ${mapState.ty}px) scale(${mapState.scale})`;
    }

    // Add Clear Highlight Button
    if (currentHighlightedPath) {
        const clearBtn = document.createElement('button');
        clearBtn.innerText = "清除路徑顯示";
        clearBtn.className = "action-btn";
        clearBtn.style.position = "absolute";
        clearBtn.style.top = "10px";
        clearBtn.style.right = "10px";
        clearBtn.style.zIndex = "1000";
        clearBtn.style.backgroundColor = "rgba(0,0,0,0.7)";
        clearBtn.style.color = "white";
        clearBtn.style.border = "1px solid #777";
        
        clearBtn.onclick = (e) => {
            e.stopPropagation();
            currentHighlightedPath = null;
            renderMap();
        };
        
        // We need to append to mapContainer's parent or a fixed overlay, 
        // because mapContainer itself is transformed (scaled/translated).
        // If we append to mapContainer, the button will move with the map.
        // Let's append to the wrapper.
        const wrapper = document.querySelector('.map-container');
        if (wrapper) {
            // Remove existing clear btn if any
            const existing = wrapper.querySelector('#clear-path-btn');
            if(existing) existing.remove();
            
            clearBtn.id = "clear-path-btn";
            wrapper.appendChild(clearBtn);
        }
    } else {
        // Remove button if it exists
        const wrapper = document.querySelector('.map-container');
        if (wrapper) {
            const existing = wrapper.querySelector('#clear-path-btn');
            if(existing) existing.remove();
        }
    }
}

// Edit Mode Helpers
async function handleConnectionClick(sourceName, targetName) {
    const data = getData();
    const records = data.filter(d => d.station_name === sourceName && d.destination === targetName);
    
    if (records.length === 0) {
        alert(`連線: ${sourceName} -> ${targetName}\n暫無詳細資料。`);
        return;
    }

    // Get synced fiber stats from getStats()
    const stats = getStats();
    const sourceSiteStats = stats.find(s => s.name === sourceName);
    const fiberStats = sourceSiteStats?.groups || {};

    // Group records by fiber_name to avoid duplicates
    const uniqueFibers = {};
    records.forEach(r => {
        const fName = r.fiber_name || 'Unclassified';
        if (!uniqueFibers[fName]) {
            const fiberGroup = fiberStats[fName];
            // Capacity: Use stats if available, otherwise fallback to row count or core_count
            let capacity;
            if (fiberGroup && fiberGroup.total !== undefined) {
                 capacity = fiberGroup.total;
            } else {
                 capacity = fiberGroup ? Math.max(fiberGroup.rowCount, fiberGroup.explicitCapacity) : (r.core_count || '?');
            }
            uniqueFibers[fName] = {
                name: fName,
                capacity: capacity,
                count: 1
            };
        } else {
            uniqueFibers[fName].count++;
        }
    });

    let msg = `連線: ${sourceName} -> ${targetName}\n找到 ${Object.keys(uniqueFibers).length} 條光纜資料 (共 ${records.length} 芯):\n`;
    
    Object.values(uniqueFibers).forEach((f, idx) => {
        msg += `${idx + 1}. 名稱: ${f.name}, 總芯數: ${f.capacity} (本段可用: ${f.count})\n`;
    });

    if (!isEditMode) {
        alert(msg);
        return;
    }

    msg += `\n請輸入:\n- 數字 (1-${Object.keys(uniqueFibers).length}): 編輯該光纜 (將開啟第一筆資料)\n- 'd': 刪除此連線所有資料\n- 取消: 關閉視窗`;

    const input = prompt(msg);
    if (!input) return;

    if (input.toLowerCase() === 'd') {
        if (confirm(`確定要刪除從 "${sourceName}" 到 "${targetName}" 的所有連線嗎？`)) {
            await deleteConnection(sourceName, targetName);
        }
        return;
    }

    const idx = parseInt(input) - 1;
    if (idx >= 0 && idx < records.length) {
        const record = records[idx];
        const newName = prompt("請輸入新的光纜名稱 (Fiber Name):", record.fiber_name);
        if (newName === null) return;
        
        const newCount = prompt("請輸入新的芯數 (Core Count):", record.core_count);
        if (newCount === null) return;

        try {
            await updateRecord(record.id, {
                fiber_name: newName,
                core_count: newCount
            });
            alert("更新成功！");
            renderMap(); // Refresh to reflect changes if visualized (though map mainly shows existence)
        } catch (e) {
            console.error(e);
            alert("更新失敗: " + e.message);
        }
    } else {
        alert("輸入無效！");
    }
}

async function renameStation(oldName, newName) {
    const data = getData();
    const updates = [];
    
    // 1. Update station_name
    const sourceRecords = data.filter(d => d.station_name === oldName);
    sourceRecords.forEach(r => {
        updates.push(updateRecord(r.id, { station_name: newName }));
    });
    
    // 2. Update destination
    const destRecords = data.filter(d => d.destination === oldName);
    destRecords.forEach(r => {
        updates.push(updateRecord(r.id, { destination: newName }));
    });
    
    try {
        await Promise.all(updates);
        alert(`已更新 ${updates.length} 筆資料。`);
        location.reload(); 
    } catch (e) {
        console.error("Renaming failed", e);
        alert("更名失敗：" + e.message);
    }
}

async function deleteConnection(sourceName, targetName) {
    const data = getData();
    const records = data.filter(d => d.station_name === sourceName && d.destination === targetName);
    
    if (records.length === 0) return;
    
    const updates = records.map(r => updateRecord(r.id, { destination: "" }));
    
    try {
        await Promise.all(updates);
        alert(`已移除 ${updates.length} 筆連線資料。`);
        renderMap();
    } catch (e) {
        console.error("Delete failed", e);
        alert("刪除失敗：" + e.message);
    }
}

// Draggable Logic
function makeDraggable(el, nodeData) {
    let isDragging = false;
    let startX, startY;
    let initialLeft, initialTop; // Store initial % positions
    
    
    // Unified Start Handler
    const onStart = (e) => {
        // Only left click or touch
        if (e.type === 'mousedown' && e.button !== 0) return;
        
        isDragging = true;
        el.setAttribute('data-dragging', 'false'); // Reset
        
        const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

        // Capture initial state
        startX = clientX;
        startY = clientY;
        initialLeft = parseFloat(el.style.left);
        initialTop = parseFloat(el.style.top);
        
        el.style.zIndex = 100;
        el.style.cursor = 'grabbing';
        
        if (e.type === 'mousedown') {
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
        } else {
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        }
        
        if (e.cancelable) e.preventDefault(); // Prevent text selection / scroll
    };
    
    // Unified Move Handler
    const onMove = (e) => {
        if (!isDragging) return;
        el.setAttribute('data-dragging', 'true');
        
        const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
        
        const containerRect = mapContainer.getBoundingClientRect();
        
        // Calculate Delta in Percentage relative to container size
        const deltaX = ((clientX - startX) / containerRect.width) * 100;
        const deltaY = ((clientY - startY) / containerRect.height) * 100;
        
        // Apply to Initial Position (Absolute Delta method avoids accumulation errors/jitter)
        const newLeft = initialLeft + deltaX;
        const newTop = initialTop + deltaY;
        
        el.style.left = `${newLeft}%`;
        el.style.top = `${newTop}%`;
        
        // Update node data for reference
        nodeData.xPct = newLeft;
        nodeData.yPct = newTop;
        
        // Update connected lines
        updateConnectedLines(nodeData.name, newLeft, newTop);
        
        if (e.cancelable) e.preventDefault();
    };
    
    // Unified End Handler
    const onEnd = (e) => {
        const wasDragging = el.getAttribute('data-dragging') === 'true';
        isDragging = false;
        el.style.zIndex = '';
        el.style.cursor = 'grab';
        
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        
        // Small timeout to clear dragging flag so click event doesn't fire immediately
        setTimeout(() => {
            el.setAttribute('data-dragging', 'false');
        }, 100);

        // Save position to memory
        nodePositions[nodeData.name] = { x: nodeData.xPct, y: nodeData.yPct };
        // localStorage.setItem('fiber_node_positions', JSON.stringify(nodePositions)); // Disabled: Only save via Admin button

        // Fix for Mobile: touchstart preventDefault() kills the click event.
        // If it was a touch event and NOT a drag, manually trigger the click.
        if (e && e.type === 'touchend' && !wasDragging) {
             el.click();
        }
    };
    
    el.addEventListener('mousedown', onStart);
    el.addEventListener('touchstart', onStart, { passive: false });
}

function updateConnectedLines(nodeName, xPct, yPct) {
    const svg = mapContainer.querySelector('svg.connections');
    if (!svg) return;
    
    // Update lines where this node is source
    const sourceLines = svg.querySelectorAll(`line[data-source="${nodeName}"]`);
    sourceLines.forEach(line => {
        line.setAttribute('x1', `${xPct}%`);
        line.setAttribute('y1', `${yPct}%`);
    });
    
    // Update lines where this node is target
    const targetLines = svg.querySelectorAll(`line[data-target="${nodeName}"]`);
    targetLines.forEach(line => {
        line.setAttribute('x2', `${xPct}%`);
        line.setAttribute('y2', `${yPct}%`);
    });
}

// Site Details
function openSiteDetails(siteName) {
    if (modalSiteTitle) modalSiteTitle.textContent = `站點詳情: ${siteName}`;
    const data = getSiteData(siteName);
    
    // Helper: Find owning main site for this station (nearest reachable)
    const getOwningMainSite = (name) => {
        if (!currentMainSites || currentMainSites.length === 0) return null;
        const mains = new Set(currentMainSites);
        const all = getData();
        const adj = {};
        const ensure = (n) => { if (n && !adj[n]) adj[n] = new Set(); };
        all.forEach(r => {
            const u = r.station_name;
            const v = r.destination;
            ensure(u);
            ensure(v);
            if (u && v && u !== v) {
                adj[u].add(v);
                adj[v].add(u);
            }
        });
        if (!adj[name]) return null;
        const visited = new Set([name]);
        const queue = [name];
        while (queue.length > 0) {
            const u = queue.shift();
            if (mains.has(u)) return u;
            if (adj[u]) {
                adj[u].forEach(v => {
                    if (!visited.has(v)) {
                        visited.add(v);
                        queue.push(v);
                    }
                });
            }
        }
        return null;
    };
    const ownerMainSite = getOwningMainSite(siteName);
    
    // Calculate stats using global getStats() to ensure sync with Main Station
    const allStats = getStats();
    const siteStats = allStats.find(s => s.name === siteName) || { total: 0, used: 0, free: 0, groups: {} };
    
    const { total, used, free } = siteStats;
    // Calculate usage rate based on the synced stats
    const usageRate = total > 0 ? Math.round((used / total) * 100) : 0;
    const stats = { total, used, free };

    if (modalSiteStats) {
        const isMain = currentMainSites.includes(siteName);
        const btnText = isMain ? "取消中心 (重整)" : "設為中心 (重整)";
        const btnColor = isMain ? "#ef4444" : "#3b82f6";

        // Check if admin is logged in
        let adminBtnHtml = '';
        if (isAdminLoggedIn) {
            adminBtnHtml = `
                <button id="btn-set-main" style="padding: 6px 12px; background: ${btnColor}; color: white; border: none; border-radius: 4px; cursor: pointer;">${btnText}</button>
                <button id="btn-delete-station" style="padding: 6px 12px; background: var(--danger-color); color: white; border: none; border-radius: 4px; cursor: pointer;">🗑️ 刪除站點</button>
            `;
        }

        modalSiteStats.innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 1rem;">
                ${adminBtnHtml}
            </div>
            <div style="display: flex; gap: 1rem; margin-bottom: 1rem; align-items: center;">
                <div class="stat-box">總數: <b>${stats.total}</b></div>
                <div class="stat-box used">已用: <b>${stats.used}</b></div>
                <div class="stat-box free">剩餘: <b>${stats.free}</b></div>
                <div class="stat-box">使用率: <b>${usageRate}%</b></div>
            </div>
        `;
        
        // Bind events immediately
        setTimeout(() => {
            const btnSetMain = document.getElementById('btn-set-main');
            if (btnSetMain) {
                btnSetMain.onclick = async () => {
                    const isNowMain = currentMainSites.includes(siteName);
                    let newSites = [...currentMainSites];
                    
                    if (isNowMain) {
                         newSites = newSites.filter(s => s !== siteName);
                    } else {
                         newSites.push(siteName);
                    }
                    
                    // Optimistic update
                    currentMainSites = newSites;
                    renderMap();
                    
                    // Update Button UI
                    const newIsMain = currentMainSites.includes(siteName);
                    btnSetMain.textContent = newIsMain ? "取消中心 (重整)" : "設為中心 (重整)";
                    btnSetMain.style.background = newIsMain ? "#ef4444" : "#3b82f6";

                    try {
                        await setAppSettings('main_site', { names: newSites });
                    } catch (e) {
                        console.error(e);
                        alert('儲存設定失敗');
                    }
                };
            }

            const btnDeleteStation = document.getElementById('btn-delete-station');
            if (btnDeleteStation) {
                btnDeleteStation.onclick = async () => {
                    if (confirm(`確定要刪除站點 "${siteName}" 嗎？\n此操作將永久刪除該站點的所有光纖資料！`)) {
                        try {
                            btnDeleteStation.disabled = true;
                            btnDeleteStation.textContent = "刪除中...";
                            await deleteStation(siteName);
                            alert(`已刪除站點 ${siteName}`);
                            closeModal(siteModal);
                            // Refresh all views
                            await loadData(); // Reload to be safe
                            renderDashboard();
                            renderMap();
                            renderDataTable();
                        } catch (e) {
                            console.error(e);
                            alert('刪除失敗: ' + e.message);
                            btnDeleteStation.disabled = false;
                            btnDeleteStation.textContent = "🗑️ 刪除站點";
                        }
                    }
                };
            }
        }, 0);
    }

    // Render Accordion
    const accordionContainer = document.getElementById('site-accordion-container');
    if (accordionContainer) {
        accordionContainer.innerHTML = '';
        
        // Group data by fiber_name
        // Group data by fiber_name (Local Data)
        const groups = {};
        data.forEach(row => {
            const key = row.fiber_name || '未分類';
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
        });
        
        // Merge keys from Local Data and Synced Stats to ensure all fibers are shown
        const keys = new Set();
        data.forEach(row => keys.add(row.fiber_name || '未分類'));
        if (siteStats.groups) {
            Object.keys(siteStats.groups).forEach(k => keys.add(k));
        }

        const sortedKeys = Array.from(keys).sort((a, b) => {
            const aIsNum = /^\d/.test(a);
            const bIsNum = /^\d/.test(b);

            // Group 1: Numbers
            // Group 2: Non-Numbers
            if (aIsNum && !bIsNum) return -1;
            if (!aIsNum && bIsNum) return 1;

            if (aIsNum && bIsNum) {
                // Numeric Sort Descending
                const numA = parseInt(a);
                const numB = parseInt(b);
                if (numA !== numB) return numB - numA;
                return b.localeCompare(a); // Tie-breaker
            }

            // String Sort Descending (Handles letters etc.)
            return b.localeCompare(a);
        });
        
        if (sortedKeys.length === 0) {
            accordionContainer.innerHTML = '<div style="text-align:center; padding: 2rem;">無資料</div>';
        } else {
            // Define local usage check helper
            const isRowUsed = (row) => {
                return (row.usage && String(row.usage).trim().length > 0) || 
                       (row.destination && String(row.destination).trim().length > 0) || 
                       (row.net_end && String(row.net_end).trim().length > 0) || 
                       (row.department && String(row.department).trim().length > 0);
            };

            sortedKeys.forEach(key => {
                const sortByCore = (rows) => {
                    return (rows || []).slice().sort((a, b) => {
                        const aNum = parseInt(a.core_count);
                        const bNum = parseInt(b.core_count);
                        const aNan = isNaN(aNum);
                        const bNan = isNaN(bNum);
                        if (!aNan && !bNan) return aNum - bNum;
                        if (aNan && !bNan) return 1;
                        if (!aNan && bNan) return -1;
                        const aPort = String(a.port || '');
                        const bPort = String(b.port || '');
                        return aPort.localeCompare(bPort, undefined, { numeric: true, sensitivity: 'base' });
                    });
                };
                const groupRows = sortByCore(groups[key] || []);

                // Determine Display Rows EARLY to calculate specific used cores
                let displayRows = groupRows;
                if (ownerMainSite && ownerMainSite !== siteName) {
                    const mainRows = getSiteData(ownerMainSite).filter(r => (r.fiber_name || '未分類') === key);
                    if (mainRows.length > 0) {
                        displayRows = sortByCore(mainRows);
                    }
                }
                displayRows = sortByCore(displayRows);

                // Calculate Used Cores String (Ranges)
                const usedRows = displayRows.filter(isRowUsed);
                const usedCores = usedRows
                    .map(r => parseInt(r.core_count))
                    .filter(n => !isNaN(n))
                    .sort((a, b) => a - b);
                
                let usedCoresText = '';
                if (usedCores.length > 0) {
                    const ranges = [];
                    let start = usedCores[0];
                    let prev = usedCores[0];
                    
                    for (let i = 1; i < usedCores.length; i++) {
                        if (usedCores[i] !== prev + 1) {
                            ranges.push(start === prev ? String(start) : `${start}-${prev}`);
                            start = usedCores[i];
                        }
                        prev = usedCores[i];
                    }
                    ranges.push(start === prev ? String(start) : `${start}-${prev}`);
                    usedCoresText = `(${ranges.join(', ')})`;
                }

                // Calculate stats for this group
                // Prefer Synced Stats from Main Station if available (Authoritative)
                let total, used, free;
                const syncedGroup = siteStats.groups ? siteStats.groups[key] : null;

                if (syncedGroup) {
                    // Use synced stats logic (Authoritative)
                    // Updated to use pre-calculated values from getStats() which handle unique cores and prefix parsing
                    if (syncedGroup.total !== undefined) {
                        total = syncedGroup.total;
                        used = syncedGroup.used;
                        free = syncedGroup.free;
                    } else {
                        // Fallback for safety
                        total = Math.max(syncedGroup.rowCount, syncedGroup.explicitCapacity);
                        used = syncedGroup.usedCount;
                        free = Math.max(0, total - used);
                    }
                } else {
                    // Fallback to local calculation for purely local fibers
                    total = groupRows.length;
                    used = groupRows.filter(isRowUsed).length;
                    free = total - used;
                }
                
                // Create Accordion Item
                const item = document.createElement('div');
                item.className = 'accordion-item';
                item.style.marginBottom = '0.5rem';
                item.style.border = '1px solid #4b5563';
                item.style.borderRadius = '4px';
                
                // Header
                const header = document.createElement('div');
                header.className = 'accordion-header';
                header.style.padding = '1rem';
                header.style.background = 'var(--bg-secondary)';
                header.style.cursor = 'pointer';
                header.style.display = 'flex';
                header.style.justifyContent = 'space-between';
                header.style.alignItems = 'center';
                
                header.innerHTML = `
                    <strong>${key}</strong>
                    <div style="font-size: 0.9em;">
                        <span style="color: #ef4444; margin-right: 12px; font-weight: bold;">已用: ${used} ${usedCoresText}</span>
                        <span style="color: #10b981; font-weight: bold;">可用: ${free}</span>
                    </div>
                `;
                
                // Content (Hidden by default)
                const content = document.createElement('div');
                content.className = 'accordion-content hidden';
                content.style.padding = '0.5rem';
                
                // Indentation Container
                const tableWrapper = document.createElement('div');
                tableWrapper.className = 'site-detail-table-wrapper'; // Add class for styling
                tableWrapper.style.borderLeft = '5px solid var(--primary-color)'; // Thicker border
                tableWrapper.style.paddingLeft = '2rem'; // More indentation
                tableWrapper.style.marginLeft = '1rem';
                tableWrapper.style.background = 'rgba(255,255,255,0.03)';
                tableWrapper.style.borderRadius = '0 6px 6px 0';
                tableWrapper.style.marginTop = '0.5rem';
                tableWrapper.style.marginBottom = '0.5rem';
                
                // Mini Table inside
                const table = document.createElement('table');
                table.className = 'site-detail-table'; // Add class for styling
                table.style.width = '100%';
                table.style.borderCollapse = 'collapse';
                
                // Full Headers (as requested: "完整顯示")
                table.innerHTML = `
                    <thead>
                        <tr style="background: rgba(255,255,255,0.05);">
                            <th style="padding:8px; text-align:left;">線路目的</th>
                            <th style="padding:8px; text-align:left;">芯數</th>
                            <th style="padding:8px; text-align:left;">線路來源</th>
                            <th style="padding:8px; text-align:left;">跳接線路</th>
                            <th style="padding:8px; text-align:left;">Port</th>
                            <th style="padding:8px; text-align:left;">網路起點</th>
                            <th style="padding:8px; text-align:left;">網路終點</th>
                            <th style="padding:8px; text-align:left;">用途</th>
                            <th style="padding:8px; text-align:left;">使用單位</th>
                            <th style="padding:8px; text-align:left;">聯絡人</th>
                            <th style="padding:8px; text-align:left;">連絡電話</th>
                            <th style="padding:8px; text-align:left;">備註</th>
                            <th style="padding:8px; text-align:left;">操作</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;
                
                const tbody = table.querySelector('tbody');
                
                // Render Rows using existing helper logic (slightly adapted)
                // displayRows is already calculated above
                
                displayRows.forEach(row => {
                     const tr = document.createElement('tr');
                     tr.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                     
                     // Helper
                     const createEditableCell = (field, value, id) => {
                        if (isAdminLoggedIn) {
                            return `<td class="editable-cell" data-id="${id}" data-field="${field}" title="點擊編輯" style="padding:8px;">${value || ''}</td>`;
                        } else {
                            return `<td style="padding:8px;">${value || ''}</td>`;
                        }
                     };
                     
                     tr.innerHTML = `
                        ${createEditableCell('destination', row.destination, row.id)}
                        ${createEditableCell('core_count', row.core_count, row.id)}
                        ${createEditableCell('source', row.source, row.id)}
                        ${createEditableCell('connection_line', row.connection_line, row.id)}
                        ${createEditableCell('port', row.port, row.id)}
                        ${createEditableCell('net_start', row.net_start, row.id)}
                        ${createEditableCell('net_end', row.net_end, row.id)}
                        ${createEditableCell('usage', row.usage, row.id)}
                        ${createEditableCell('department', row.department, row.id)}
                        ${createEditableCell('contact', row.contact, row.id)}
                        ${createEditableCell('phone', row.phone, row.id)}
                        ${createEditableCell('notes', row.notes, row.id)}
                        <td style="padding:8px;"></td>
                     `;
                     tbody.appendChild(tr);
                });
                
                // Re-attach listeners for inline editing
                attachInlineEditing(tbody);
                
                tableWrapper.appendChild(table);
                content.appendChild(tableWrapper);
                item.appendChild(header);
                item.appendChild(content);
                accordionContainer.appendChild(item);
                
                // Toggle Logic
                header.addEventListener('click', () => {
                    content.classList.toggle('hidden');
                    if (!content.classList.contains('hidden')) {
                        content.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });
            });
        }
    }

    if (siteModal) openModal(siteModal);
}

// Extract Inline Editing Logic to reuse
function attachInlineEditing(container) {
    container.querySelectorAll('.editable-cell').forEach(cell => {
        cell.addEventListener('click', function() {
            if (this.querySelector('input')) return; // Already editing

            const originalValue = this.innerText;
            const field = this.getAttribute('data-field');
            const id = this.getAttribute('data-id');
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = originalValue;
            input.className = 'editable-input';
            
            // Save on blur or enter
            const save = async () => {
                const newValue = input.value.trim();
                if (newValue !== originalValue) {
                    try {
                        this.innerHTML = '更新中...';
                        await updateRecord(id, { [field]: newValue });
                        this.innerText = newValue;
                        // Refresh logic if needed
                    } catch (e) {
                        alert('更新失敗: ' + e.message);
                        this.innerText = originalValue;
                    }
                } else {
                    this.innerText = originalValue;
                }
            };

            input.addEventListener('blur', save);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    input.blur();
                }
            });

            this.innerHTML = '';
            this.appendChild(input);
            input.focus();
        });
    });
}

// Render Table
function renderDataTable() {
    const data = getData();
    const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE);
    
    // Ensure currentPage is valid
    if (currentPage > totalPages) currentPage = totalPages || 1;
    if (currentPage < 1) currentPage = 1;
    
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageData = data.slice(start, end);
    
    if (dataTableBody) renderTableRows(dataTableBody, pageData);
    
    renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
    const container = document.getElementById('pagination-container') || createPaginationContainer();
    container.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn';
    prevBtn.textContent = '上一頁';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => changePage(-1);
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn';
    nextBtn.textContent = '下一頁';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => changePage(1);
    
    const info = document.createElement('span');
    info.className = 'pagination-info';
    info.textContent = `第 ${currentPage} / ${totalPages} 頁 (共 ${getData().length} 筆)`;
    
    container.appendChild(prevBtn);
    container.appendChild(info);
    container.appendChild(nextBtn);
}

function createPaginationContainer() {
    const tableContainer = document.querySelector('.table-container');
    const div = document.createElement('div');
    div.id = 'pagination-container';
    div.className = 'pagination-controls';
    if (tableContainer) {
        tableContainer.parentNode.insertBefore(div, tableContainer.nextSibling);
    }
    return div;
}

function changePage(delta) {
    currentPage += delta;
    renderDataTable();
}

function renderTableRows(tbody, data) {
    if (!tbody) return;
    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15" style="text-align:center">無資料</td></tr>';
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        
        // Helper to create editable cell
        const createEditableCell = (field, value, id) => {
            if (isAdminLoggedIn) {
                return `<td class="editable-cell" data-id="${id}" data-field="${field}" title="點擊編輯">${value || ''}</td>`;
            } else {
                return `<td style="padding: 8px;">${value || ''}</td>`;
            }
        };

        // Make fiber name clickable
        const fiberCell = row.fiber_name ? `<a href="#" class="fiber-link" data-fiber="${row.fiber_name}">${row.fiber_name}</a>` : '-';
        
        tr.innerHTML = `
            <td>${fiberCell}</td>
            ${createEditableCell('destination', row.destination, row.id)}
            ${createEditableCell('core_count', row.core_count, row.id)}
            ${createEditableCell('source', row.source, row.id)}
            ${createEditableCell('connection_line', row.connection_line, row.id)}
            ${createEditableCell('port', row.port, row.id)}
            ${createEditableCell('net_start', row.net_start, row.id)}
            ${createEditableCell('net_end', row.net_end, row.id)}
            ${createEditableCell('usage', row.usage, row.id)}
            ${createEditableCell('department', row.department, row.id)}
            ${createEditableCell('contact', row.contact, row.id)}
            ${createEditableCell('phone', row.phone, row.id)}
            ${createEditableCell('notes', row.notes, row.id)}
            <td>${row.station_name || ''}</td>
            <td style="text-align: center;">
                ${isAdminLoggedIn ? `<button class="action-btn delete-btn-small" data-id="${row.id}" data-table="${row._table}" style="padding: 4px 8px; font-size: 0.85em; background-color: #ff5252; color: white; border: none; border-radius: 4px; cursor: pointer;">刪除</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Add event listeners for fiber links
    tbody.querySelectorAll('.fiber-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const fiberName = e.target.getAttribute('data-fiber');
            openPathDiagram(fiberName);
        });
    });

    // Add event listeners for delete buttons
    tbody.querySelectorAll('.delete-btn-small').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent row click if any
            const id = e.target.getAttribute('data-id');
            const table = e.target.getAttribute('data-table');
            
            if(confirm('確定要刪除這筆資料嗎？\n此操作無法復原！')) {
                const originalText = e.target.textContent;
                try {
                    e.target.textContent = '...';
                    e.target.disabled = true;
                    
                    await deleteRecord(id, table);
                    
                    // deleteRecord updates local data
                    
                    // User Request: Maintain search view if we are searching
                    if (globalSearchInput && globalSearchInput.value.trim() && searchBtn) {
                         searchBtn.click();
                    } else {
                         renderDataTable();
                    }
                    
                    // Optional: show toast/alert
                    // alert('刪除成功'); 
                } catch(err) {
                    console.error(err);
                    alert('刪除失敗: ' + err.message);
                    e.target.textContent = originalText;
                    e.target.disabled = false;
                }
            }
        });
    });

    // Add event listeners for inline editing
    attachInlineEditing(tbody);
}

// Path Diagram
function openPathDiagram(fiberName) {
    const records = getFiberPath(fiberName);
    const container = document.getElementById('path-container');
    if (!container) return;

    if (document.getElementById('modal-path-title')) {
        document.getElementById('modal-path-title').textContent = `光纖路徑: ${fiberName}`;
    }
    
    container.innerHTML = '';
    
    if (records.length === 0) {
        container.innerHTML = '無路徑資料';
    } else {
        const pathDiv = document.createElement('div');
        pathDiv.style.display = 'flex';
        pathDiv.style.alignItems = 'center';
        pathDiv.style.gap = '20px';
        pathDiv.style.flexWrap = 'wrap';
        pathDiv.style.padding = '20px';

        records.forEach((rec, index) => {
            const node = document.createElement('div');
            node.className = 'path-node';
            node.innerHTML = `
                <strong>${rec.station_name}</strong><br>
                <small>Port: ${rec.port || '-'}</small><br>
                <small>To: ${rec.destination || '-'}</small>
            `;
            // Removed inline styles that conflict with dark mode
            // Styling handled by CSS .path-node

            pathDiv.appendChild(node);

            if (index < records.length - 1) {
                const arrow = document.createElement('div');
                arrow.innerHTML = '➜';
                arrow.style.fontSize = '24px';
                arrow.style.color = '#555';
                pathDiv.appendChild(arrow);
            }
        });
        
        container.appendChild(pathDiv);
    }
    
    if (pathModal) openModal(pathModal);
}

// Manual Add Form
if (addForm) {
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!isAdminLoggedIn) {
            alert('請先登入管理員帳號以新增資料');
            return;
        }

        const formData = new FormData(addForm);
        const record = Object.fromEntries(formData.entries());
        
        try {
            await addRecord(record);
            alert('新增成功！');
            addForm.reset();
            await loadData(); // Refresh
            renderDataTable(); // Refresh view
        } catch (err) {
            alert('新增失敗: ' + err.message);
        }
    });
}

// Dashboard Stats
function renderDashboard() {
    let stats = getStats();
    const container = document.getElementById('stats-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (stats.length === 0) {
        container.innerHTML = '暫無統計資料';
        return;
    }

    // Sort by Total Capacity (Descending) to show Top 10 first
    stats.sort((a, b) => b.total - a.total);

    const top10Stats = stats.slice(0, 10);
    const fragment = document.createDocumentFragment();

    // Colors for Top 10
    const topColors = [
        '#FFD700', // Gold
        '#C0C0C0', // Silver
        '#CD7F32', // Bronze
        '#FF5252', // Red
        '#448AFF', // Blue
        '#69F0AE', // Green
        '#E040FB', // Purple
        '#FFAB40', // Orange
        '#00E5FF', // Cyan
        '#FF4081'  // Pink
    ];

    top10Stats.forEach((site, index) => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        const usageRate = site.total > 0 ? Math.round((site.used / site.total) * 100) : 0;
        
        let rankHtml = '';
        let titleStyle = '';
        let progressColor = 'var(--primary-color)';

        if (index < 10) {
            const color = topColors[index];
            card.style.borderTop = `4px solid ${color}`;
            // Add a subtle background tint
            card.style.background = `linear-gradient(to bottom, var(--bg-secondary) 0%, var(--bg-secondary) 90%, ${color}22 100%)`;
            
            titleStyle = `color: ${color};`;
            progressColor = color;
            rankHtml = `<span style="background-color:${color}; color:#000; padding:2px 6px; border-radius:4px; font-size:0.8em; font-weight:bold; margin-right:8px;">TOP ${index+1}</span>`;
        }

        card.innerHTML = `
            <div style="display:flex; align-items:center; margin-bottom:10px;">
                ${rankHtml}
                <h3 style="margin:0; ${titleStyle}">${site.name}</h3>
            </div>
            <div class="stat-row">
                    <span>總芯數:</span>
                    <strong>${site.total}</strong>
                </div>
            <div class="stat-row">
                <span>已使用:</span>
                <strong class="text-danger">${site.used}</strong>
            </div>
            <div class="stat-row">
                <span>使用率:</span>
                <div class="progress-bar">
                    <div class="progress" style="width: ${usageRate}%; background-color: ${progressColor};"></div>
                </div>
                <span>${usageRate}%</span>
            </div>
        `;
        
        // Long press to delete
        let pressTimer;
        let isLongPress = false;

        const startPress = () => {
            isLongPress = false;
            pressTimer = setTimeout(async () => {
                isLongPress = true;
                
                if (!isAdminLoggedIn) {
                    alert('請先登入管理員帳號以刪除站點');
                    return;
                }

                if (confirm(`確定要刪除站點 "${site.name}" 嗎？\n此操作將永久刪除該站點的所有光纖資料！`)) {
                    try {
                        await deleteStation(site.name);
                        alert(`已刪除站點 ${site.name}`);
                        // Refresh all views
                        const updatedData = await loadData();
                        renderDashboard();
                        renderMap();
                        renderDataTable();
                    } catch (e) {
                        alert('刪除失敗: ' + e.message);
                    }
                }
            }, 800); // 800ms for long press
        };

        const cancelPress = () => {
            clearTimeout(pressTimer);
        };

        card.addEventListener('mousedown', startPress);
        card.addEventListener('touchstart', startPress, { passive: true });
        
        card.addEventListener('mouseup', cancelPress);
        card.addEventListener('mouseleave', cancelPress);
        card.addEventListener('touchend', cancelPress);

        card.addEventListener('click', (e) => {
            if (isLongPress) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            openSiteDetails(site.name);
        });

        fragment.appendChild(card);
    });
    container.appendChild(fragment);
}

function populateSiteSelector() {
    const stats = getStats();
    if (!siteSelector) return;
    siteSelector.innerHTML = '<option value="">選擇站點...</option>';
    stats.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = s.name;
        siteSelector.appendChild(opt);
    });
    
    siteSelector.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
             const data = getSiteData(val);
             renderTableRows(dataTableBody, data);
        } else {
             renderDataTable();
        }
    });
}

// IO Panel Handlers
const processUploadBtn = document.getElementById('process-upload-btn');
const exportBtn = document.getElementById('export-btn');
const excelUploadInput = document.getElementById('excel-upload');

if (processUploadBtn && excelUploadInput) {
    processUploadBtn.addEventListener('click', async () => {
        if (!isAdminLoggedIn) {
            alert('請先登入管理員帳號以使用匯入功能');
            return;
        }

        const files = excelUploadInput.files;
        if (!files || files.length === 0) {
            alert('請先選擇至少一個 Excel 檔案');
            return;
        }
        
        try {
            processUploadBtn.disabled = true;
            processUploadBtn.textContent = '解析中...';
            
            let allParsedSheets = [];
            
            // Process all selected files
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                processUploadBtn.textContent = `解析中 (${i+1}/${files.length}): ${file.name}...`;
                try {
                    const sheets = await parseExcel(file);
                    // Append file name to sheet name to avoid confusion if same sheet names exist
                    sheets.forEach(sheet => {
                        sheet.displayName = `[${file.name}] ${sheet.name}`;
                        
                        // Update station_name in rows to include filename
                        // This ensures that if the sheet name is generic (e.g. "Sheet1") but filename is "MS2.xlsx",
                        // we can still correctly route it to the MS2 table.
                        const cleanFileName = file.name.replace(/\.[^/.]+$/, "");
                        // Construct a composite name. 
                        // If sheet name is already specific, this just adds context.
                        // If sheet name is generic, filename takes over.
                        const newStationName = `${cleanFileName} ${sheet.name}`;
                        
                        sheet.rows.forEach(row => {
                            row.station_name = newStationName;
                        });
                    });
                    allParsedSheets.push(...sheets);
                } catch (err) {
                    console.error(`Error parsing file ${file.name}:`, err);
                    alert(`解析檔案 ${file.name} 失敗: ${err.message}`);
                }
            }
            
            console.log("All parsed sheets:", allParsedSheets);
            
            if (allParsedSheets.length === 0) {
                alert("找不到有效的資料");
                processUploadBtn.disabled = false;
                processUploadBtn.textContent = '解析並上傳';
                return;
            }

            // Create Modal for Selection
            const modalId = 'upload-select-modal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';
            
            const content = document.createElement('div');
            content.className = 'modal-content sm';
            content.innerHTML = `
                <span class="close-modal" onclick="this.closest('.modal').remove()">&times;</span>
                <h3>選擇要上傳的站點 (分頁)</h3>
                <div id="sheet-list" style="max-height: 300px; overflow-y: auto; margin: 1rem 0; border: 1px solid #4b5563; padding: 0.5rem;">
                    ${allParsedSheets.map((sheet, idx) => `
                        <div style="padding: 0.5rem; border-bottom: 1px solid #4b5563;">
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" checked value="${idx}" style="margin-right: 10px; width: auto;">
                                ${sheet.displayName || sheet.name} (${sheet.rows.length} 筆)
                            </label>
                        </div>
                    `).join('')}
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 1rem;">
                    <button class="btn-sm" onclick="document.getElementById('${modalId}').remove()">取消</button>
                    <button class="btn-primary" id="confirm-upload-btn">開始上傳</button>
                </div>
            `;
            
            modal.appendChild(content);
            document.body.appendChild(modal);

            // Handle Confirmation
            document.getElementById('confirm-upload-btn').onclick = async () => {
                const checkboxes = content.querySelectorAll('input[type="checkbox"]:checked');
                const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.value));
                
                if (selectedIndices.length === 0) {
                    alert("請至少選擇一個站點");
                    return;
                }

                modal.remove();
                processUploadBtn.textContent = '上傳中...';

                // Flatten selected data
                const flatRows = [];
                selectedIndices.forEach(idx => {
                    flatRows.push(...allParsedSheets[idx].rows);
                });

                try {
                    await syncData(flatRows, (processed, total) => {
                         processUploadBtn.textContent = `上傳中 (${processed}/${total})...`;
                    });
                    
                    alert(`上傳完成！共處理 ${flatRows.length} 筆資料。`);
                    
                    const modal = document.getElementById('upload-select-modal');
                    if (modal) modal.remove();
                    
                    await loadData();
                    renderDashboard();
                    renderMap();
                    renderDataTable();
                } catch (e) {
                    console.error("Sync error:", e);
                    alert('上傳失敗: ' + e.message);
                } finally {
                    processUploadBtn.disabled = false;
                    processUploadBtn.textContent = '解析並上傳';
                }
            };

        } catch (e) {
            console.error("Upload error:", e);
            alert('處理失敗: ' + e.message);
            processUploadBtn.disabled = false;
            processUploadBtn.textContent = '解析並上傳';
        }
    });
}

if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        try {
            const data = getData();
            if (data.length === 0) {
                alert('無資料可匯出');
                return;
            }
            exportToExcel(data);
        } catch (e) {
            console.error("Export error:", e);
            alert('匯出失敗: ' + e.message);
        }
    });
}
