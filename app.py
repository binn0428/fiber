import streamlit as st
import pandas as pd
from PIL import Image, ImageDraw
import os
import io

# Page Configuration
st.set_page_config(page_title="Interactive Factory Fiber Management System", layout="wide")

# Constants
DATA_FILE = os.path.join("data", "fiber_data.xlsx")
IMAGE_FILE = os.path.join("images", "map.jpg")
STATUS_COLORS = {
    "Remaining": "green",
    "In Use": "red",
    "Abnormal": "black" # or orange
}

# --- Helper Functions ---

@st.cache_data
def load_data():
    """Loads all sheets from the Excel file."""
    try:
        xls = pd.ExcelFile(DATA_FILE)
        all_sheets = {}
        for sheet_name in xls.sheet_names:
            all_sheets[sheet_name] = pd.read_excel(xls, sheet_name=sheet_name)
            # Ensure text columns are strings to avoid errors
            text_cols = ['線路名稱', '線路目的', '線路來源', '跳接線路', '用途', '使用單位', '備註']
            for col in text_cols:
                if col in all_sheets[sheet_name].columns:
                    all_sheets[sheet_name][col] = all_sheets[sheet_name][col].astype(str).replace('nan', '')
        return all_sheets
    except Exception as e:
        st.error(f"Error loading data: {e}")
        return {}

def determine_status(row):
    """Determines the status of a port based on the rules."""
    # 1. Abnormal Check
    remarks = str(row.get('備註', ''))
    if '斷纖' in remarks or '故障' in remarks:
        return 'Abnormal'
    
    # 2. In Use Check
    usage = str(row.get('用途', '')).strip()
    unit = str(row.get('使用單位', '')).strip()
    if usage or unit:
        return 'In Use'
    
    # 3. Remaining
    return 'Remaining'

def save_data(all_data):
    """Saves the current session state data to an Excel file in memory for download."""
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        for sheet_name, df in all_data.items():
            df.to_excel(writer, sheet_name=sheet_name, index=False)
    return output.getvalue()

# --- Main App Logic ---

def main():
    st.title("🏭 Interactive Factory Fiber Management System")

    # Initialize Session State for Data
    if 'fiber_data' not in st.session_state:
        st.session_state.fiber_data = load_data()

    if not st.session_state.fiber_data:
        st.warning("No data found. Please check data/fiber_data.xlsx")
        return

    # Sidebar Navigation
    st.sidebar.title("Navigation")
    mode = st.sidebar.radio("Mode", ["Dashboard & Map", "Path Tracking", "Data Management"])

    # --- Mode 1: Dashboard & Map ---
    if mode == "Dashboard & Map":
        st.header("📊 Fiber Status Dashboard")
        
        # Calculate Global Stats
        total_ports = 0
        total_in_use = 0
        total_remaining = 0
        total_abnormal = 0

        # Filter out path summary sheets if necessary (assumed specific names)
        site_sheets = [s for s in st.session_state.fiber_data.keys() if "路徑" not in s]

        for sheet in site_sheets:
            df = st.session_state.fiber_data[sheet]
            if 'Port' not in df.columns: continue
            
            # Apply status logic
            df['Status'] = df.apply(determine_status, axis=1)
            
            total_ports += len(df)
            counts = df['Status'].value_counts()
            total_in_use += counts.get('In Use', 0)
            total_remaining += counts.get('Remaining', 0)
            total_abnormal += counts.get('Abnormal', 0)

        # Display Metrics
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Total Ports", total_ports)
        col2.metric("In Use", total_in_use, delta_color="inverse")
        col3.metric("Remaining", total_remaining, delta_color="normal")
        usage_rate = (total_in_use / total_ports * 100) if total_ports > 0 else 0
        col4.metric("Usage Rate", f"{usage_rate:.1f}%")
        
        if total_abnormal > 0:
            st.error(f"⚠️ {total_abnormal} Abnormal Ports Detected!")

        st.divider()

        # Map and Site Details
        st.subheader("🗺️ Site Map & Details")
        
        col_map, col_details = st.columns([1, 1])
        
        with col_map:
            try:
                image = Image.open(IMAGE_FILE)
                st.image(image, caption="Factory Fiber Map", use_container_width=True)
                st.info("Select a site from the sidebar/dropdown to view details.")
            except FileNotFoundError:
                st.error("Map image not found.")

        with col_details:
            selected_site = st.selectbox("Select Site to View Details", site_sheets)
            
            if selected_site:
                df_site = st.session_state.fiber_data[selected_site]
                
                # Recalculate status for display
                df_site['Status'] = df_site.apply(determine_status, axis=1)

                st.markdown(f"### {selected_site} Status")
                
                # Color coding for dataframe
                def color_status(val):
                    color = 'green' if val == 'Remaining' else 'red' if val == 'In Use' else 'orange'
                    return f'background-color: {color}; color: white'

                st.dataframe(
                    df_site.style.map(color_status, subset=['Status']),
                    use_container_width=True
                )

    # --- Mode 2: Path Tracking ---
    elif mode == "Path Tracking":
        st.header("🔍 Fiber Path Tracking")
        
        search_term = st.text_input("Enter Line Name (e.g., L1-01)", "")
        
        if search_term:
            st.markdown(f"### Search Results for: `{search_term}`")
            found = False
            
            # 1. Search in Summary Tables (Path Tables)
            path_sheets = [s for s in st.session_state.fiber_data.keys() if "路徑" in s]
            if path_sheets:
                st.subheader("Global Path Reference")
                for sheet in path_sheets:
                    df = st.session_state.fiber_data[sheet]
                    results = df[df.astype(str).apply(lambda x: x.str.contains(search_term, case=False)).any(axis=1)]
                    if not results.empty:
                        st.write(f"**Found in {sheet}:**")
                        st.dataframe(results)
                        found = True

            # 2. Search in Site Details
            st.subheader("Site-Specific Port Details")
            for sheet, df in st.session_state.fiber_data.items():
                if "路徑" in sheet: continue # Skip summary sheets
                
                # Check if search term is in Line Name
                if '線路名稱' in df.columns:
                    results = df[df['線路名稱'].astype(str).str.contains(search_term, case=False)]
                    if not results.empty:
                        st.write(f"**📍 Site: {sheet}**")
                        st.dataframe(results)
                        found = True
            
            if not found:
                st.info("No records found for this line name.")

    # --- Mode 3: Data Management (Add/Edit) ---
    elif mode == "Data Management":
        st.header("✏️ Data Management")
        
        tab1, tab2 = st.tabs(["Edit Existing Port", "Add New Site"])
        
        with tab1:
            site_to_edit = st.selectbox("Select Site", list(st.session_state.fiber_data.keys()))
            df_edit = st.session_state.fiber_data[site_to_edit]
            
            if 'Port' in df_edit.columns:
                port_to_edit = st.selectbox("Select Port", df_edit['Port'].unique())
                
                # Get current values
                current_row = df_edit[df_edit['Port'] == port_to_edit].iloc[0]
                
                with st.form("edit_port_form"):
                    st.write(f"Editing {site_to_edit} - Port {port_to_edit}")
                    new_usage = st.text_input("Usage (用途)", value=str(current_row.get('用途', '')))
                    new_unit = st.text_input("User Unit (使用單位)", value=str(current_row.get('使用單位', '')))
                    new_remarks = st.text_area("Remarks (備註)", value=str(current_row.get('備註', '')))
                    
                    submitted = st.form_submit_button("Update Port")
                    
                    if submitted:
                        # Update dataframe in session state
                        idx = df_edit[df_edit['Port'] == port_to_edit].index[0]
                        st.session_state.fiber_data[site_to_edit].at[idx, '用途'] = new_usage
                        st.session_state.fiber_data[site_to_edit].at[idx, '使用單位'] = new_unit
                        st.session_state.fiber_data[site_to_edit].at[idx, '備註'] = new_remarks
                        st.success("Updated successfully!")
                        st.rerun()
            else:
                st.warning("Selected sheet does not have a 'Port' column.")

        with tab2:
            new_site_name = st.text_input("New Site Name")
            if st.button("Create New Site"):
                if new_site_name and new_site_name not in st.session_state.fiber_data:
                    # Create empty dataframe with standard columns
                    columns = ['線路名稱', '線路目的', '芯數', '線路來源', '跳接線路', 'Port', '用途', '使用單位', '備註']
                    st.session_state.fiber_data[new_site_name] = pd.DataFrame(columns=columns)
                    st.success(f"Site '{new_site_name}' created!")
                    st.rerun()
                elif new_site_name in st.session_state.fiber_data:
                    st.error("Site name already exists.")
                else:
                    st.error("Please enter a valid name.")

        st.divider()
        st.subheader("💾 Save Changes")
        if st.button("Export Updated Excel"):
            excel_data = save_data(st.session_state.fiber_data)
            st.download_button(
                label="Download Excel File",
                data=excel_data,
                file_name="updated_fiber_data.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )

if __name__ == "__main__":
    main()
