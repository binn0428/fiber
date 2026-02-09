
console.log("Main script starting...");

import { initSupabase, checkConnection, getSupabase } from './supabase.js';
import { loadData, addRecord, updateRecord, getData, getStats, getSiteData, searchLine, getFiberPath, syncData, deleteStation, getAppSettings, setAppSettings } from './dataService.js';
import { parseExcel, exportToExcel } from './excelService.js';
import './mobile.js';

if (window.logToScreen) window.logToScreen("main.js loaded.");
console.log("main.js loaded");

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
        if (mainSiteSetting && mainSiteSetting.name) {
            currentMainSite = mainSiteSetting.name;
            console.log("Loaded Main Site preference:", currentMainSite);
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

// Global State
let isAdminLoggedIn = false;
let currentMainSite = null; // Stores the user-selected main site for layout
let isEditMode = false; // New Edit Mode State
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

// Node Positions Memory
let nodePositions = {};
try {
    const savedNodes = localStorage.getItem('fiber_node_positions');
    if (savedNodes) {
        nodePositions = JSON.parse(savedNodes);
    }
} catch (e) { console.error("Failed to load node positions", e); }

let currentPage = 1;
const ITEMS_PER_PAGE = 20;

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
            console.log("Nav clicked:", btn.getAttribute('data-target'));
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            viewSections.forEach(section => {
                section.classList.remove('active');
                if (section.id === targetId) section.classList.add('active');
            });
            if (targetId === 'dashboard') renderDashboard();
            if (targetId === 'map-view') renderMap();
            if (targetId === 'data-mgmt') renderDataTable();
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

        // Do NOT render results immediately (User Request)
        // renderTableRows(dataTableBody, results);
        dataTableBody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 2rem; color: var(--text-muted);">請選擇上方篩選條件以檢視結果</td></tr>';
        
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
const resetMapBtn = document.getElementById('reset-map-btn');
const addLinkBtn = document.getElementById('add-link-btn');

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

        // Re-render map to show/hide edit handles
        renderMap();
        
        if (isEditMode) {
            alert('進入編輯模式：\n1. 拖曳節點可移動位置\n2. 雙擊節點可重新命名\n3. 點擊連線可刪除\n4. 點擊「新增連線」按鈕可建立新連接');
        }
    });
}

if (addLinkBtn) {
    addLinkBtn.addEventListener('click', async () => {
        const source = prompt("請輸入起點站點名稱：");
        if (!source) return;
        
        const target = prompt("請輸入終點站點名稱：");
        if (!target) return;
        
        if (source === target) {
            alert("起點與終點不能相同！");
            return;
        }

        const fiberName = prompt("請輸入光纜名稱 (例如: 96C)：", "96C");
        const coreCount = prompt("請輸入芯數：", "96");
        
        try {
            // Create a new record representing this connection
            await addRecord({
                station_name: source,
                destination: target,
                fiber_name: fiberName,
                core_count: coreCount,
                usage: '預留',
                notes: '架構圖手動新增'
            });
            alert("連線建立成功！");
            renderMap(); // Will re-fetch data implicitly via listener? No, addRecord notifies.
        } catch (e) {
            console.error(e);
            alert("建立失敗：" + e.message);
        }
    });
}

if (refreshMapBtn) {
    refreshMapBtn.addEventListener('click', () => {
        renderMap();
    });
}

if (resetMapBtn) {
    resetMapBtn.addEventListener('click', () => {
        if (confirm('確定要重置所有站點位置嗎？\n這將會清除您手動拖曳的排版。')) {
            nodePositions = {};
            localStorage.removeItem('fiber_node_positions');
            renderMap();
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

    // 2. Calculate Levels (BFS)
    let queue = [];
    const visited = new Set();

    // Determine Root(s) - Respect User Preference
    if (currentMainSite && nodes[currentMainSite]) {
        queue.push(nodes[currentMainSite]);
    } else {
        queue = Object.values(nodes).filter(n => n.inputs === 0);
        if (queue.length === 0 && Object.keys(nodes).length > 0) {
            const root = nodes['UDC'] || Object.values(nodes)[0];
            if (root) queue.push(root);
        }
    }

    queue.forEach(n => {
        n.level = 0;
        visited.add(n.name);
    });

    let maxIterations = Object.keys(nodes).length * 2;
    while (queue.length > 0 && maxIterations > 0) {
        maxIterations--;
        const current = queue.shift();
        
        const currentLinks = links.filter(l => l.source === current.name);
        currentLinks.forEach(l => {
            const neighbor = nodes[l.target];
            if (neighbor && !visited.has(neighbor.name)) {
                neighbor.level = current.level + 1;
                visited.add(neighbor.name);
                queue.push(neighbor);
            }
        });
    }

    Object.values(nodes).forEach(n => {
        if (!visited.has(n.name)) n.level = 0;
    });

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

    const centerX = 50; 
    const centerY = 50; 

    if (currentMainSite && nodes[currentMainSite]) {
        // --- Custom Main Site Layout (Radial Tree) ---
        const root = nodes[currentMainSite];
        root.xPct = centerX;
        root.yPct = centerY;
        root.isBackbone = true;

        // Group by level
        const levels = {};
        let maxLvl = 0;
        Object.values(nodes).forEach(n => {
            if (n.name === currentMainSite) return;
            if (!levels[n.level]) levels[n.level] = [];
            levels[n.level].push(n);
            if (n.level > maxLvl) maxLvl = n.level;
        });

        Object.entries(levels).forEach(([lvl, group]) => {
            const levelIdx = parseInt(lvl);
            // Treat unvisited (island) nodes (lvl 0) as outer layer if they exist
            const effectiveLevel = (levelIdx === 0) ? maxLvl + 1 : levelIdx;
            
            const radius = 25 * effectiveLevel; 
            const step = (2 * Math.PI) / group.length;
            
            group.forEach((node, idx) => {
                const angle = idx * step;
                node.xPct = centerX + radius * Math.cos(angle);
                node.yPct = centerY + radius * Math.sin(angle);
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
        
        makeDraggable(el, node);

        let clickTimeout;
        el.addEventListener('click', (e) => {
            if (el.getAttribute('data-dragging') === 'true') return;
            
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
        
        line.setAttribute("stroke", "#3b82f6");
        line.setAttribute("stroke-width", "2"); 
        line.setAttribute("marker-end", "url(#arrow)");
        
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

        if (isEditMode) {
            hitLine.addEventListener('click', async (e) => {
                e.stopPropagation();
                await handleConnectionClick(source.name, target.name);
            });
            hitLine.addEventListener('mouseenter', () => line.setAttribute("stroke", "#ef4444"));
            hitLine.addEventListener('mouseleave', () => line.setAttribute("stroke", "#3b82f6"));
        }
        
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `${source.name} -> ${target.name}`;
        line.appendChild(title);
        hitLine.appendChild(title.cloneNode(true));

        svgContainer.appendChild(line);
        svgContainer.appendChild(hitLine);
    }

    if (mapContainer && mapState) {
        mapContainer.style.transform = `translate(${mapState.tx}px, ${mapState.ty}px) scale(${mapState.scale})`;
    }
}

// Edit Mode Helpers
async function handleConnectionClick(sourceName, targetName) {
    const data = getData();
    const records = data.filter(d => d.station_name === sourceName && d.destination === targetName);
    
    if (records.length === 0) return;

    let msg = `連線: ${sourceName} -> ${targetName}\n找到 ${records.length} 條光纜資料:\n`;
    records.forEach((r, idx) => {
        msg += `${idx + 1}. 名稱: ${r.fiber_name || '無'}, 芯數: ${r.core_count || '?'}\n`;
    });
    msg += `\n請輸入:\n- 數字 (1-${records.length}): 編輯該光纜\n- 'd': 刪除此連線所有資料\n- 取消: 關閉視窗`;

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
        localStorage.setItem('fiber_node_positions', JSON.stringify(nodePositions));

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
    
    // Calculate stats locally to include incoming connections
    let total = data.length;
    let used = 0;
    
    const isRowUsedCalc = (row) => {
        return (row.usage && String(row.usage).trim().length > 0) || 
               (row.destination && String(row.destination).trim().length > 0) || 
               (row.net_end && String(row.net_end).trim().length > 0) || 
               (row.department && String(row.department).trim().length > 0);
    };

    data.forEach(row => {
        if (isRowUsedCalc(row)) used++;
    });
    
    const free = total - used;
    const usageRate = total > 0 ? Math.round((used / total) * 100) : 0;
    const stats = { total, used, free };

    if (modalSiteStats) {
        modalSiteStats.innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 1rem;">
                <button id="btn-set-main" style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">設為中心</button>
                <button id="btn-connect-from" style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">從此連接...</button>
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
                    if (confirm(`確定要將 "${siteName}" 設為中心站點並重新佈局嗎？`)) {
                        try {
                            await setAppSettings('main_site', { name: siteName });
                            currentMainSite = siteName;
                            renderMap();
                            alert(`已將 "${siteName}" 設為中心站點`);
                        } catch (e) {
                            console.error(e);
                            alert('儲存設定失敗');
                        }
                    }
                };
            }
            
            const btnConnect = document.getElementById('btn-connect-from');
            if (btnConnect) {
                btnConnect.onclick = () => {
                    const modal = document.getElementById('site-modal');
                    if (modal) modal.style.display = "none";
                    
                    const addTab = document.querySelector('button[data-tab="manual-add"]');
                    if (addTab) addTab.click();
                    
                    setTimeout(() => {
                         const sourceInput = document.querySelector('input[name="source"]');
                         if (sourceInput) {
                             sourceInput.value = siteName;
                             sourceInput.focus();
                             sourceInput.dispatchEvent(new Event('input'));
                         }
                    }, 100);
                };
            }
        }, 0);
    }

    // Render Accordion
    const accordionContainer = document.getElementById('site-accordion-container');
    if (accordionContainer) {
        accordionContainer.innerHTML = '';
        
        // Group data by fiber_name
        const groups = {};
        data.forEach(row => {
            const key = row.fiber_name || '未分類';
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
        });
        
        // Sort keys based on user request:
        // 1. Numbers first (Descending)
        // 2. Non-numbers last (Descending)
        const keys = new Set();
        data.forEach(row => {
            keys.add(row.fiber_name || '未分類');
        });

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
        
        if (sortedKeys.length === 0 && data.length === 0) {
            accordionContainer.innerHTML = '<div style="text-align:center; padding: 2rem;">無資料</div>';
        } else {
            sortedKeys.forEach(key => {
                const groupRows = groups[key].sort((a, b) => {
                    const valA = String(a.core_count || '');
                    const valB = String(b.core_count || '');
                    // Use numeric sort to handle 1, 2, 10 correctly
                    return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
                });

                // Calculate stats for this group
                const isRowUsed = (row) => {
                    return (row.usage && String(row.usage).trim().length > 0) || 
                           (row.destination && String(row.destination).trim().length > 0) || 
                           (row.net_end && String(row.net_end).trim().length > 0) || 
                           (row.department && String(row.department).trim().length > 0);
                };
                
                const total = groupRows.length;
                const used = groupRows.filter(isRowUsed).length;
                const free = total - used;
                
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
                        <span style="color: #ef4444; margin-right: 12px; font-weight: bold;">已用: ${used}</span>
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
                groupRows.forEach(row => {
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
            <td>
                <!-- Removed Edit button as we have inline editing now, or keep as fallback -->
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
    const stats = getStats();
    const container = document.getElementById('stats-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (stats.length === 0) {
        container.innerHTML = '暫無統計資料';
        return;
    }

    const fragment = document.createDocumentFragment();
    stats.forEach(site => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        const usageRate = site.total > 0 ? Math.round((site.used / site.total) * 100) : 0;
        
        card.innerHTML = `
            <h3>${site.name}</h3>
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
                    <div class="progress" style="width: ${usageRate}%"></div>
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
