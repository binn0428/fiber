
console.log("Main script starting...");

import { initSupabase, checkConnection, getSupabase } from './supabase.js';
import { loadData, addRecord, getData, getStats, getSiteData, searchLine, getFiberPath } from './dataService.js';
import { parseExcel, exportToExcel } from './excelService.js';

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
    const stats = getStats();
    if (!mapContainer) return;
    mapContainer.innerHTML = ''; // Clear
    
    if (stats.length === 0) {
        mapContainer.innerHTML = '<div class="map-placeholder">暫無資料</div>';
        return;
    }

    // Simple Layout: Arrange in a circle
    const centerX = 50;
    const centerY = 50;
    const radius = 35;
    const angleStep = (2 * Math.PI) / stats.length;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "connections");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    mapContainer.appendChild(svg);

    // Create Nodes
    stats.forEach((site, index) => {
        const angle = index * angleStep;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        
        const node = document.createElement('div');
        node.className = 'site-node';
        node.textContent = site.name;
        node.style.left = `${x}%`;
        node.style.top = `${y}%`;
        node.setAttribute('data-site', site.name);
        
        // Add stats tooltip or small text
        const info = document.createElement('small');
        info.innerHTML = `<br>(${site.used}/${site.total})`;
        node.appendChild(info);

        node.addEventListener('click', () => {
            openSiteDetails(site.name);
        });

        mapContainer.appendChild(node);
        
        // Save coordinates for lines (simplified)
        site.x = x;
        site.y = y;
    });

    // Draw Lines (Connections)
    const data = getData();
    const connections = new Set();
    
    data.forEach(row => {
        if (row.station_name && row.destination) {
            // Check if destination exists as a station
            const targetSite = stats.find(s => s.name === row.destination || (row.destination && row.destination.includes(s.name)));
            if (targetSite) {
                const sourceSite = stats.find(s => s.name === row.station_name);
                if (sourceSite) {
                    // Create a unique key for the link (sorted to avoid duplicates A-B vs B-A)
                    const key = [sourceSite.name, targetSite.name].sort().join('-');
                    if (!connections.has(key)) {
                        connections.add(key);
                        
                        // Draw line
                        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                        line.setAttribute("x1", `${sourceSite.x}%`);
                        line.setAttribute("y1", `${sourceSite.y}%`);
                        line.setAttribute("x2", `${targetSite.x}%`);
                        line.setAttribute("y2", `${targetSite.y}%`);
                        line.setAttribute("stroke", "#3498db");
                        line.setAttribute("stroke-width", "2");
                        line.setAttribute("stroke-opacity", "0.6");
                        svg.appendChild(line);
                    }
                }
            }
        }
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

    if (modalTableBody) renderTableRows(modalTableBody, data);
    if (siteModal) openModal(siteModal);
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
        
        // Make fiber name clickable
        const fiberCell = row.fiber_name ? `<a href="#" class="fiber-link" data-fiber="${row.fiber_name}">${row.fiber_name}</a>` : '-';
        
        tr.innerHTML = `
            <td>${row.station_name || ''}</td>
            <td>${fiberCell}</td>
            <td>${row.destination || ''}</td>
            <td>${row.core_count || ''}</td>
            <td>${row.source || ''}</td>
            <td>${row.port || ''}</td>
            <td>${row.usage || ''}</td>
            <td>${row.notes || ''}</td>
            <td>
                <button class="btn-sm edit-btn" data-id="${row.id}">編輯</button>
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
                <span>總 Port 數:</span>
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
        card.addEventListener('click', () => openSiteDetails(site.name));
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
            
            const parsedData = await parseExcel(file);
            console.log("Parsed data:", parsedData.length, "records");
            
            if (confirm(`解析成功，共 ${parsedData.length} 筆資料。是否開始上傳至 Supabase？(這可能需要一點時間)`)) {
                processUploadBtn.textContent = '上傳中...';
                let successCount = 0;
                let failCount = 0;
                
                for (const record of parsedData) {
                    try {
                        await addRecord(record);
                        successCount++;
                    } catch (e) {
                        console.error("Upload failed for record:", record, e);
                        failCount++;
                    }
                    // Update UI every 10 records or so
                    if ((successCount + failCount) % 10 === 0) {
                        processUploadBtn.textContent = `上傳中 (${successCount + failCount}/${parsedData.length})...`;
                    }
                }
                
                alert(`上傳完成！成功: ${successCount}, 失敗: ${failCount}`);
                await loadData();
                renderDashboard();
                renderMap();
                renderDataTable();
            }
        } catch (e) {
            console.error("Upload error:", e);
            alert('處理失敗: ' + e.message);
        } finally {
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
