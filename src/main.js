
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
        
        // Render results
        renderTableRows(dataTableBody, results);
        
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
}

// Draggable Logic
function makeDraggable(el, nodeData) {
    let isDragging = false;
    let startX, startY;
    let initialLeft, initialTop; // Store initial % positions
    
    const onMouseDown = (e) => {
        // Only left click
        if (e.button !== 0) return;
        isDragging = true;
        el.setAttribute('data-dragging', 'false'); // Reset
        
        // Capture initial state
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = parseFloat(el.style.left);
        initialTop = parseFloat(el.style.top);
        
        el.style.zIndex = 100;
        el.style.cursor = 'grabbing';
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault(); // Prevent text selection
    };
    
    const onMouseMove = (e) => {
        if (!isDragging) return;
        el.setAttribute('data-dragging', 'true');
        
        const containerRect = mapContainer.getBoundingClientRect();
        
        // Calculate Delta in Percentage relative to container size
        const deltaX = ((e.clientX - startX) / containerRect.width) * 100;
        const deltaY = ((e.clientY - startY) / containerRect.height) * 100;
        
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
    };
    
    const onMouseUp = () => {
        isDragging = false;
        el.style.zIndex = '';
        el.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        // Small timeout to clear dragging flag so click event doesn't fire immediately
        setTimeout(() => {
            el.setAttribute('data-dragging', 'false');
        }, 100);
    };
    
    el.addEventListener('mousedown', onMouseDown);
    // Touch support for mobile
    el.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0
        });
        el.dispatchEvent(mouseEvent);
    }, { passive: false });
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
                const groupRows = groups[key];
                
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
                    <span style="font-size: 0.9em; opacity: 0.8">(${groupRows.length} 筆)</span>
                `;
                
                // Content (Hidden by default)
                const content = document.createElement('div');
                content.className = 'accordion-content hidden';
                content.style.padding = '0.5rem';
                
                // Mini Table inside
                const table = document.createElement('table');
                table.style.width = '100%';
                table.style.borderCollapse = 'collapse';
                
                // Full Headers (as requested: "完整顯示")
                table.innerHTML = `
                    <thead>
                        <tr style="background: rgba(255,255,255,0.05);">
                            <th style="padding:8px; text-align:left;">Port</th>
                            <th style="padding:8px; text-align:left;">芯數</th>
                            <th style="padding:8px; text-align:left;">目的</th>
                            <th style="padding:8px; text-align:left;">來源</th>
                            <th style="padding:8px; text-align:left;">用途</th>
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
                        ${createEditableCell('port', row.port, row.id)}
                        ${createEditableCell('core_count', row.core_count, row.id)}
                        ${createEditableCell('destination', row.destination, row.id)}
                        ${createEditableCell('source', row.source, row.id)}
                        ${createEditableCell('usage', row.usage, row.id)}
                        ${createEditableCell('notes', row.notes, row.id)}
                        <td style="padding:8px;"></td>
                     `;
                     tbody.appendChild(tr);
                });
                
                // Re-attach listeners for inline editing
                attachInlineEditing(tbody);
                
                content.appendChild(table);
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
    if (dataTableBody) renderTableRows(dataTableBody, data);
}

function renderTableRows(tbody, data) {
    if (!tbody) return;
    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">無資料</td></tr>';
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
            <td>${row.station_name || ''}</td>
            <td>${fiberCell}</td>
            ${createEditableCell('destination', row.destination, row.id)}
            ${createEditableCell('core_count', row.core_count, row.id)}
            ${createEditableCell('source', row.source, row.id)}
            ${createEditableCell('port', row.port, row.id)}
            ${createEditableCell('usage', row.usage, row.id)}
            ${createEditableCell('notes', row.notes, row.id)}
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
            node.style.border = '2px solid #3498db';
            node.style.padding = '10px';
            node.style.borderRadius = '8px';
            node.style.background = '#f8f9fa';

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
                        // Dashboard re-renders automatically via notify() -> renderDashboard() if listener set up, 
                        // but main.js manually calls renderDashboard on load. 
                        // dataService.js notify() calls listeners. We haven't subscribed main.js's renderDashboard to dataService yet.
                        // So we should manually refresh or set up subscription.
                        // For now, let's just re-render here or rely on the reload that usually happens.
                        // But wait, dataService updates local state.
                        renderDashboard();
                        renderMap();
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

        container.appendChild(card);
    });
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
        const file = excelUploadInput.files[0];
        if (!file) {
            alert('請先選擇 Excel 檔案');
            return;
        }
        
        try {
            processUploadBtn.disabled = true;
            processUploadBtn.textContent = '解析中...';
            
            // parsedData is now [{name: 'Sheet1', rows: [...]}, ...]
            const parsedSheets = await parseExcel(file);
            console.log("Parsed sheets:", parsedSheets);
            
            if (parsedSheets.length === 0) {
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
                    ${parsedSheets.map((sheet, idx) => `
                        <div style="padding: 0.5rem; border-bottom: 1px solid #4b5563;">
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" checked value="${idx}" style="margin-right: 10px; width: auto;">
                                ${sheet.name} (${sheet.rows.length} 筆)
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
                    flatRows.push(...parsedSheets[idx].rows);
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
