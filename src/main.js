
import { initSupabase, checkConnection } from './supabase.js';
import { loadData, syncData, updatePort, getData, getStats, getSiteData, searchLine, subscribe } from './dataService.js';
import { parseExcel, exportToExcel } from './excelService.js';

// DOM Elements
const navBtns = document.querySelectorAll('.nav-btn');
const viewSections = document.querySelectorAll('.view-section');
const globalSearchInput = document.getElementById('global-search');
const searchBtn = document.getElementById('search-btn');
const siteNodes = document.querySelectorAll('.site-node');
const siteModal = document.getElementById('site-modal');
const editModal = document.getElementById('edit-modal');
const closeModals = document.querySelectorAll('.close-modal');
const modalSiteTitle = document.getElementById('modal-site-title');
const modalSiteStats = document.getElementById('modal-site-stats');
const modalTableBody = document.querySelector('#modal-table tbody');
const dataTableBody = document.querySelector('#data-table tbody');
const siteSelector = document.getElementById('site-selector');
const editForm = document.getElementById('edit-form');
const processUploadBtn = document.getElementById('process-upload-btn');
const excelUpload = document.getElementById('excel-upload');
const exportBtn = document.getElementById('export-btn');
const saveConfigBtn = document.getElementById('save-config-btn');
const supabaseUrlInput = document.getElementById('supabase-url');
const supabaseKeyInput = document.getElementById('supabase-key');

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

// Map Interaction
siteNodes.forEach(node => {
    node.addEventListener('click', () => {
        const siteName = node.getAttribute('data-site');
        openSiteDetails(siteName);
    });
});

function openSiteDetails(siteName) {
    modalSiteTitle.textContent = `站點詳情: ${siteName}`;
    const data = getSiteData(siteName);
    const stats = getStats().find(s => s.name === siteName) || { total: 0, used: 0, free: 0 };
    
    modalSiteStats.innerHTML = `
        <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
            <span>總數: <b>${stats.total}</b></span>
            <span style="color: var(--danger-color)">已用: <b>${stats.used}</b></span>
            <span style="color: var(--success-color)">剩餘: <b>${stats.free}</b></span>
        </div>
    `;

    renderTableRows(modalTableBody, data, true);
    openModal(siteModal);
}

// Data Rendering
function renderTableRows(tbody, data, simplified = false) {
    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">無資料</td></tr>';
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        const isUsed = row.usage && row.usage.trim();
        const statusClass = isUsed ? 'status-used' : 'status-free';
        const statusText = isUsed ? '已使用' : '閒置';
        
        // Handle undefined safely
        const line = row.line_name || '-';
        const port = row.port_number || '-';
        const usage = row.usage || '';
        const remarks = row.remarks || '';

        let html = '';
        if (!simplified) {
            html += `<td>${line}</td>`;
        }
        
        html += `
            <td>${port}</td>
            <td>${usage}</td>
            <td>${remarks}</td>
            <td class="${statusClass}">${statusText}</td>
            <td>
                <button class="edit-btn" data-id="${row.id}">編輯</button>
            </td>
        `;
        tr.innerHTML = html;
        tbody.appendChild(tr);
    });

    // Add Edit Listeners
    tbody.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent row click if any
            const id = btn.getAttribute('data-id');
            const rowData = getData().find(d => d.id == id); // Use == for loose match (string/number)
            if (rowData) openEditModal(rowData);
        });
    });
}

function openEditModal(data) {
    document.getElementById('edit-id').value = data.id;
    document.getElementById('edit-usage').value = data.usage || '';
    document.getElementById('edit-remarks').value = data.remarks || '';
    openModal(editModal);
}

// Edit Form Submit
editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const usage = document.getElementById('edit-usage').value;
    const remarks = document.getElementById('edit-remarks').value;
    
    try {
        await updatePort(id, { usage, remarks });
        closeModal(editModal);
        // Refresh current view
        renderDashboard(); // Update stats
        // If site modal is open, refresh it
        if (!siteModal.classList.contains('hidden')) {
             // We need to know which site was open. 
             // Ideally we re-call openSiteDetails with current site name.
             // For simplicity, we just rely on data binding if we had a reactive framework.
             // Here we manually refresh the table in the modal if it's visible.
             const siteName = modalSiteTitle.textContent.replace('站點詳情: ', '');
             openSiteDetails(siteName);
        }
        renderDataTable();
    } catch (err) {
        alert('更新失敗: ' + err.message);
    }
});

// Dashboard Rendering
function renderDashboard() {
    const stats = getStats();
    const container = document.getElementById('stats-container');
    container.innerHTML = '';
    
    if (stats.length === 0) {
        container.innerHTML = '<div class="stat-card">尚無資料，請先匯入 Excel</div>';
        return;
    }

    // Global Stats
    const globalTotal = stats.reduce((acc, s) => acc + s.total, 0);
    const globalUsed = stats.reduce((acc, s) => acc + s.used, 0);
    const globalFree = stats.reduce((acc, s) => acc + s.free, 0);

    const globalCard = document.createElement('div');
    globalCard.className = 'stat-card';
    globalCard.style.borderLeft = '4px solid var(--primary-color)';
    globalCard.innerHTML = `
        <h3>全網統計</h3>
        <div class="value">${globalTotal}</div>
        <div>已用: ${globalUsed} | 剩餘: ${globalFree}</div>
    `;
    container.appendChild(globalCard);

    stats.forEach(s => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `
            <h3>${s.name}</h3>
            <div class="value">${s.total}</div>
            <div>
                <span style="color: var(--danger-color)">${s.used}</span> / 
                <span style="color: var(--success-color)">${s.free}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

// Data Management View
function renderDataTable() {
    const data = getData();
    // Populate selector
    const sites = [...new Set(data.map(d => d.site_name))];
    const currentVal = siteSelector.value;
    siteSelector.innerHTML = '<option value="">全部站點</option>';
    sites.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        siteSelector.appendChild(opt);
    });
    siteSelector.value = currentVal;

    const filtered = currentVal ? data.filter(d => d.site_name === currentVal) : data;
    renderTableRows(dataTableBody, filtered);
}

siteSelector.addEventListener('change', renderDataTable);

// Search
searchBtn.addEventListener('click', performSearch);
globalSearchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') performSearch();
});

function performSearch() {
    const query = globalSearchInput.value.trim();
    if (!query) return;
    
    // Switch to Data Management tab to show results
    navBtns[2].click(); // Index 2 is Data Management
    
    const results = searchLine(query);
    // Force "All Sites"
    siteSelector.value = "";
    renderTableRows(dataTableBody, results);
    
    // Highlight or show message
    const h2 = document.querySelector('#data-mgmt h2');
    h2.textContent = `搜尋結果: "${query}" (${results.length} 筆)`;
}

// IO & Config
saveConfigBtn.addEventListener('click', async () => {
    const url = supabaseUrlInput.value.trim();
    const key = supabaseKeyInput.value.trim();
    if (initSupabase(url, key)) {
        const connected = await checkConnection();
        if (connected) {
            alert('連線成功！正在載入資料...');
            await loadData();
            renderDashboard();
        } else {
            alert('連線失敗，請檢查 URL 和 Key，或確認 Table "ports" 是否存在。');
        }
    } else {
        alert('請輸入完整的 URL 和 Key');
    }
});

// Load config on start
const savedUrl = localStorage.getItem('supabase_url');
const savedKey = localStorage.getItem('supabase_key');
if (savedUrl) supabaseUrlInput.value = savedUrl;
if (savedKey) supabaseKeyInput.value = savedKey;

if (savedUrl && savedKey) {
    initSupabase(savedUrl, savedKey);
    loadData().then(() => {
        renderDashboard();
        renderDataTable();
    }).catch(e => console.error(e));
}

// Excel Import
processUploadBtn.addEventListener('click', async () => {
    const file = excelUpload.files[0];
    if (!file) {
        alert('請選擇檔案');
        return;
    }
    
    try {
        processUploadBtn.textContent = '處理中...';
        processUploadBtn.disabled = true;
        
        const data = await parseExcel(file);
        if (data.length === 0) {
            alert('解析失敗或檔案為空');
            return;
        }
        
        if (confirm(`解析成功，共 ${data.length} 筆資料。確定要匯入並覆寫現有資料嗎？`)) {
            await syncData(data);
            alert('匯入成功！');
            renderDashboard();
            renderDataTable();
        }
    } catch (e) {
        console.error(e);
        alert('發生錯誤: ' + e.message);
    } finally {
        processUploadBtn.textContent = '解析並上傳';
        processUploadBtn.disabled = false;
    }
});

// Excel Export
exportBtn.addEventListener('click', () => {
    const data = getData();
    if (data.length === 0) {
        alert('無資料可匯出');
        return;
    }
    exportToExcel(data);
});

// Subscription to updates
subscribe((newData) => {
    // Optional: Auto refresh views if they are active
    if (document.getElementById('dashboard').classList.contains('active')) renderDashboard();
    if (document.getElementById('data-mgmt').classList.contains('active')) renderDataTable();
});
