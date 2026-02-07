import pandas as pd
import os
import glob

# Set directory relative to current working directory
data_dir = 'fiber_data'

# Get all xlsx files
files = glob.glob(os.path.join(data_dir, "*.xlsx"))

print(f"Searching in: {os.path.abspath(data_dir)}")
print(f"Found {len(files)} Excel files.")

for file_path in files:
    file_name = os.path.basename(file_path)
    print(f"\n--- Analyzing {file_name} ---")
    try:
        df = pd.read_excel(file_path, nrows=5) # Read first 5 rows
        print("Columns:", df.columns.tolist())
        # Convert first row to string to avoid encoding issues in output
        first_row = [str(x) for x in df.iloc[0].tolist()] if not df.empty else "Empty"
        print("First row data:", first_row)
    except Exception as e:
        print(f"Error reading {file_name}: {e}")
