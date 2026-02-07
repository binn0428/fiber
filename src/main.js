
import { initSupabase, checkConnection } from './supabase.js';
import { loadData, addRecord, getData, getStats, getSiteData, searchLine, getFiberPath } from './dataService.js';
// import { parseExcel, exportToExcel } from './excelService.js'; // Keep existing if needed

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
    // Check Supabase config
    const url = localStorage.getItem('https://otdjrzpmtrojlcisoxeb.supabasce.o');
    const key = localStorage.getItem('sb_publishable_fxD_HVblMWtRiYK53tWgzw_8Pg0PqgS');
    
    if (url && key) {
        initSupabase(url, key);
        supabaseUrlInput.value = url;
        // Don't show key
    }

    await loadData();
    renderDashboard();
    renderMap();
    renderDataTable();
    populateSiteSelector();
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
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
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

// Modals
function openModal(modal) {
    modal.classList.remove('hidden');
}

function closeModal(modal) {
    modal.classList.add('hidden');
}

closeModals.forEach(btn => {
    btn.addEventListener('click', (e) => {
        closeModal(e.target.closest('.modal'));
    });
});

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeModal(e.target);
    }
});

// Map Rendering
function renderMap() {
    const stats = getStats();
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
    // We need to know who connects to whom.
    // Iterate all data to find unique connections (Station -> Destination)
    const data = getData();
    const connections = new Set();
    
    data.forEach(row => {
        if (row.station_name && row.destination) {
            // Check if destination exists as a station
            const targetSite = stats.find(s => s.name === row.destination || row.destination.includes(s.name));
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
    modalSiteTitle.textContent = `站點詳情: ${siteName}`;
    const data = getSiteData(siteName);
    const stats = getStats().find(s => s.name === siteName) || { total: 0, used: 0, free: 0 };
    
    const usageRate = stats.total > 0 ? Math.round((stats.used / stats.total) * 100) : 0;

    modalSiteStats.innerHTML = `
        <div style="display: flex; gap: 1rem; margin-bottom: 1rem; align-items: center;">
            <div class="stat-box">總數: <b>${stats.total}</b></div>
            <div class="stat-box used">已用: <b>${stats.used}</b></div>
            <div class="stat-box free">剩餘: <b>${stats.free}</b></div>
            <div class="stat-box">使用率: <b>${usageRate}%</b></div>
        </div>
    `;

    renderTableRows(modalTableBody, data);
    openModal(siteModal);
}

// Render Table
function renderDataTable() {
    const data = getData();
    renderTableRows(dataTableBody, data);
}

function renderTableRows(tbody, data) {
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
    document.getElementById('modal-path-title').textContent = `光纖路徑: ${fiberName}`;
    
    container.innerHTML = '';
    
    if (records.length === 0) {
        container.innerHTML = '無路徑資料';
    } else {
        // Group by station to see where this fiber exists
        // Visualize as a chain or a list of nodes
        
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
    
    openModal(pathModal);
}

// Manual Add Form
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

// Dashboard Stats
function renderDashboard() {
    const stats = getStats();
    const container = document.getElementById('stats-container');
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
