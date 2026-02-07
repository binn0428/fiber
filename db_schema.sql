-- Create table for fiber connections
create table if not exists fiber_connections (
  id uuid default gen_random_uuid() primary key,
  station_name text not null, -- e.g., 'UDC', '#1PH'
  fiber_name text, -- 線路名稱
  destination text, -- 線路目的
  core_count text, -- 芯數
  source text, -- 線路來源
  connection_line text, -- 跳接線路 / 來源線路
  port text, -- Port
  net_start text, -- 網路起點
  net_end text, -- 網路終點
  usage text, -- 用途
  department text, -- 使用單位
  contact text, -- 聯絡人
  phone text, -- 連絡電話
  notes text, -- 備註
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index for faster lookup
create index if not exists idx_fiber_station on fiber_connections(station_name);
create index if not exists idx_fiber_name on fiber_connections(fiber_name);
