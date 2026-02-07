# 光纖管理系統設定指南

## 1. Supabase 資料庫設定

請依照以下步驟設定您的 Supabase 資料庫：

1.  登入 Supabase Dashboard。
2.  進入 SQL Editor。
3.  複製並執行 `db_schema.sql` 中的 SQL 指令。這將建立 `fiber_connections` 資料表及相關索引。

## 2. 匯入 Excel 資料

若要將現有的 Excel 檔案匯入 Supabase：

1.  確保已安裝 Node.js。
2.  開啟終端機，設定環境變數（請替換為您的實際 URL 和 Key）：
    *   **Windows (PowerShell)**:
        ```powershell
        $env:SUPABASE_URL="your_supabase_url"
        $env:SUPABASE_KEY="your_supabase_service_role_key"
        node scripts/import_data.js
        ```
    *   **Mac/Linux**:
        ```bash
        export SUPABASE_URL="your_supabase_url"
        export SUPABASE_KEY="your_supabase_service_role_key"
        node scripts/import_data.js
        ```
    注意：匯入資料建議使用 Service Role Key 以繞過 RLS (Row Level Security)，或確保您的 Key 有寫入權限。

## 3. 前端功能說明

*   **儀表板 (Dashboard)**: 顯示各站點的光纖 Port 總數、已使用數及使用率。點擊卡片可查看詳情。
*   **光纖架構圖 (Map)**: 動態生成站點節點與連線。
*   **資料管理**: 列表顯示所有資料。點擊「線路名稱」可查看該光纖的路徑圖。
*   **手動新增**: 在「手動新增 (Add)」頁面輸入資料即可新增至資料庫。
*   **設定**: 在「上傳/匯出 (IO)」頁面下方輸入 Supabase URL 和 Anon Key 以連接前端應用程式。
