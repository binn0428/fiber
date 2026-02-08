
console.log("Main script starting...");

import { initSupabase, checkConnection, getSupabase } from './supabase.js';
import { loadData, addRecord, updateRecord, getData, getStats, getSiteData, searchLine, getFiberPath, syncData, deleteStation } from './dataService.js';
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
    const stats = getStats();
    if (!mapContainer) return;
    mapContainer.innerHTML = ''; // Clear
    
    if (stats.length === 0) {
        mapContainer.innerHTML = '<div class="map-placeholder">暫無資料</div>';
        return;
    }

    // 1. Build Graph
    const nodes = {}; 
    // Init nodes
    stats.forEach(s => {
        nodes[s.name] = { name: s.name, level: 0, inputs: 0, outputs: 0 };
    });

    const links = [];
    const createdLinks = new Set();

    data.forEach(row => {
        if (row.station_name && row.destination) {
            const source = row.station_name;
            const target = row.destination;
            
            // Fuzzy match target to a known site
            let targetNodeName = null;
            if (nodes[target]) {
                targetNodeName = target;
            } else {
                 const found = stats.find(s => target.includes(s.name));
                 if (found) targetNodeName = found.name;
            }

            if (targetNodeName && source !== targetNodeName) {
                const linkKey = `${source}->${targetNodeName}`;
                if (!createdLinks.has(linkKey)) {
                    createdLinks.add(linkKey);
                    links.push({ source, target: targetNodeName });
                    if (nodes[source]) nodes[source].outputs++;
                    if (nodes[targetNodeName]) nodes[targetNodeName].inputs++;
                }
            }
        }
    });

    // 2. Calculate Levels (BFS)
    // Find roots (0 inputs)
    let queue = Object.values(nodes).filter(n => n.inputs === 0);
    // Fallback if circular or no clear root (e.g., ring topology)
    if (queue.length === 0 && stats.length > 0) {
        // Prefer UDC or first available
        const root = nodes['UDC'] || Object.values(nodes)[0];
        if (root) queue.push(root);
    }

    const visited = new Set();
    queue.forEach(n => {
        n.level = 0;
        visited.add(n.name);
    });

    // Add remaining nodes to queue if disconnected
    let maxIterations = stats.length * 2;
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

    // Handle any unvisited nodes (islands)
    Object.values(nodes).forEach(n => {
        if (!visited.has(n.name)) n.level = 0;
    });

    // 3. Layout (Group by Level)
    const levels = {};
    let maxLevel = 0;
    Object.values(nodes).forEach(n => {
        if (!levels[n.level]) levels[n.level] = [];
        levels[n.level].push(n);
        if (n.level > maxLevel) maxLevel = n.level;
    });

    // SVG Container
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "connections");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    
    // Arrow Marker
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="55" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#3b82f6" />
        </marker>
    `;
    svg.appendChild(defs);
    mapContainer.appendChild(svg);

    // 4. Render
    // Calculate coordinates (Percentages)
    const levelCount = maxLevel + 1;
    
    // Backbone Sequence (User Request)
    const backboneSequence = ['ROOM', 'UDC', '1PH', '2PH', 'DKB', 'MS2', 'MS3', 'MS4', '2O2'];
    const radius = 35; // %
    const centerX = 50; // %
    const centerY = 50; // %
    const angleStep = (2 * Math.PI) / backboneSequence.length;

    // Identify and Position Backbone Nodes
    backboneSequence.forEach((key, idx) => {
        // Find matching node (loose match)
        const nodeName = Object.keys(nodes).find(n => {
            const normN = n.toUpperCase().replace('#', '');
            const normK = key.toUpperCase().replace('#', '');
            return normN.includes(normK) || normK.includes(normN);
        });

        if (nodeName && nodes[nodeName]) {
            const node = nodes[nodeName];
            // Start from -90deg (Top) and go clockwise
            const angle = idx * angleStep - (Math.PI / 2);
            node.xPct = centerX + radius * Math.cos(angle);
            node.yPct = centerY + radius * Math.sin(angle);
            node.isBackbone = true;
            // Override level to avoid layout overwrite
            node.level = -1; 
        }
    });

    Object.keys(levels).forEach(lvlStr => {
        const lvl = parseInt(lvlStr);
        const levelNodes = levels[lvl];
        
        // Filter out nodes already positioned (Backbone)
        const nodesToPosition = levelNodes.filter(n => !n.isBackbone);
        
        nodesToPosition.forEach((node, idx) => {
            // X: Distribute evenly based on level
            // Y: Distribute evenly within level
            const xPct = ((lvl + 0.5) / levelCount) * 100; 
            const yPct = ((idx + 1) / (nodesToPosition.length + 1)) * 100;
            
            node.xPct = xPct;
            node.yPct = yPct;
        });
    });

    // Override with memory positions
    Object.values(nodes).forEach(node => {
        if (nodePositions[node.name]) {
            node.xPct = nodePositions[node.name].x;
            node.yPct = nodePositions[node.name].y;
        }
    });

    // Create Elements (All nodes)
    Object.values(nodes).forEach(node => {
        // Create Node Element
        const el = document.createElement('div');
        el.className = 'site-node';
        el.innerHTML = `
            <div>${node.name}</div>
            ${node.isBackbone ? '' : `<div style="font-size: 0.7em; opacity: 0.8">L${node.level}</div>`}
        `;
        el.style.left = `${node.xPct}%`;
        el.style.top = `${node.yPct}%`;
        el.setAttribute('data-site', node.name);
        
        // Make Draggable (User Request)
        makeDraggable(el, node);

        // Click to open details
        el.addEventListener('click', (e) => {
            if (el.getAttribute('data-dragging') === 'true') return;
            openSiteDetails(node.name);
        });
        
        mapContainer.appendChild(el);
    });

    // Draw Lines
    
    // 1. Explicit Backbone Connections
    const backboneLinks = [];
    for (let i = 0; i < backboneSequence.length; i++) {
        const currentKey = backboneSequence[i];
        const nextKey = backboneSequence[(i + 1) % backboneSequence.length]; // Loop back to start
        
        const sourceName = Object.keys(nodes).find(n => n.toUpperCase().replace('#','').includes(currentKey.replace('#','')));
        const targetName = Object.keys(nodes).find(n => n.toUpperCase().replace('#','').includes(nextKey.replace('#','')));
        
        if (sourceName && targetName && nodes[sourceName] && nodes[targetName]) {
             backboneLinks.push({ 
                 source: sourceName, 
                 target: targetName, 
                 type: 'backbone' 
             });
        }
    }

    // 2. Data-driven links (exclude if already in backbone)
    links.forEach(l => {
        // Check if this link is already covered by backbone (bidirectional check?)
        // Or just draw everything. Backbone lines might be styled differently.
        // Let's draw everything but prioritize backbone style if matching.
        const isBackbone = backboneLinks.some(bl => 
            (bl.source === l.source && bl.target === l.target) || 
            (bl.source === l.target && bl.target === l.source)
        );
        
        if (!isBackbone) {
            drawLink(nodes[l.source], nodes[l.target], svg, 'normal');
        }
    });

    // Draw Backbone Links (on top or distinct)
    backboneLinks.forEach(l => {
        drawLink(nodes[l.source], nodes[l.target], svg, 'backbone');
    });

    // Helper to draw link
    function drawLink(source, target, svgContainer, type) {
        if (!source || !target || source.xPct === undefined || target.xPct === undefined) return;
        
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", `${source.xPct}%`);
        line.setAttribute("y1", `${source.yPct}%`);
        line.setAttribute("x2", `${target.xPct}%`);
        line.setAttribute("y2", `${target.yPct}%`);
        
        if (type === 'backbone') {
            line.setAttribute("stroke", "#ef4444"); // Red for backbone
            line.setAttribute("stroke-width", "3");
        } else {
            line.setAttribute("stroke", "#3b82f6");
            line.setAttribute("stroke-width", "2");
        }
        
        line.setAttribute("marker-end", "url(#arrow)");
        
        // Add identifiers
        line.setAttribute("data-source", source.name);
        line.setAttribute("data-target", target.name);

        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `${source.name} -> ${target.name}`;
        line.appendChild(title);

        svgContainer.appendChild(line);
    }

    // Restore Transform from Global State (Memory)
    if (mapContainer && mapState) {
        mapContainer.style.transform = `translate(${mapState.tx}px, ${mapState.ty}px) scale(${mapState.scale})`;
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
        const newLeft = Math.max(0, Math.min(100, initialLeft + deltaX));
        const newTop = Math.max(0, Math.min(100, initialTop + deltaY));
        
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
    const onEnd = () => {
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
    const stats = getStats().find(s => s.name === siteName) || { total: 0, used: 0, free: 0 };
    
    const usageRate = stats.total > 0 ? Math.round((stats.used / stats.total) * 100) : 0;

    if (modalSiteStats) {
        modalSiteStats.innerHTML = `
            <div style="display: flex; gap: 1rem; margin-bottom: 1rem; align-items: center;">
                <div class="stat-box">總數: <b>${stats.total}</b></div>
                <div class="stat-box used">已用: <b>${stats.used}</b></div>
                <div class="stat-box free">剩餘: <b>${stats.free}</b></div>
                <div class="stat-box">使用率: <b>${usageRate}%</b></div>
            </div>
        `;
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
        
        // Sort keys? Maybe alphabetical or original order?
        // Let's use the order they appear (which is already sorted by sequence from getSiteData)
        // To preserve "original order", we iterate the sorted data and build keys
        const sortedKeys = [];
        const seenKeys = new Set();
        data.forEach(row => {
            const key = row.fiber_name || '未分類';
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                sortedKeys.push(key);
            }
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
                        return `<td class="editable-cell" data-id="${id}" data-field="${field}" title="點擊編輯" style="padding:8px;">${value || ''}</td>`;
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
            return `<td class="editable-cell" data-id="${id}" data-field="${field}" title="點擊編輯">${value || ''}</td>`;
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
