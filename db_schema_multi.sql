-- Multi-table schema for Fiber Management System

-- 1. udc
create table if not exists udc (
  id uuid default gen_random_uuid() primary key,
  station_name text not null,
  fiber_name text,
  destination text,
  core_count text,
  source text,
  connection_line text,
  port text,
  net_start text,
  net_end text,
  usage text,
  department text,
  contact text,
  phone text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_udc_station on udc(station_name);
create index if not exists idx_udc_fiber on udc(fiber_name);

-- 2. station_1ph (#1ph)
create table if not exists station_1ph (
  id uuid default gen_random_uuid() primary key,
  station_name text not null,
  fiber_name text,
  destination text,
  core_count text,
  source text,
  connection_line text,
  port text,
  net_start text,
  net_end text,
  usage text,
  department text,
  contact text,
  phone text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_station_1ph_station on station_1ph(station_name);
create index if not exists idx_station_1ph_fiber on station_1ph(fiber_name);

-- 3. station_2ph (#2ph)
create table if not exists station_2ph (
  id uuid default gen_random_uuid() primary key,
  station_name text not null,
  fiber_name text,
  destination text,
  core_count text,
  source text,
  connection_line text,
  port text,
  net_start text,
  net_end text,
  usage text,
  department text,
  contact text,
  phone text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_station_2ph_station on station_2ph(station_name);
create index if not exists idx_station_2ph_fiber on station_2ph(fiber_name);

-- 4. dkb
create table if not exists dkb (
  id uuid default gen_random_uuid() primary key,
  station_name text not null,
  fiber_name text,
  destination text,
  core_count text,
  source text,
  connection_line text,
  port text,
  net_start text,
  net_end text,
  usage text,
  department text,
  contact text,
  phone text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_dkb_station on dkb(station_name);
create index if not exists idx_dkb_fiber on dkb(fiber_name);

-- 5. station_5kb (5kb)
create table if not exists station_5kb (
  id uuid default gen_random_uuid() primary key,
  station_name text not null,
  fiber_name text,
  destination text,
  core_count text,
  source text,
  connection_line text,
  port text,
  net_start text,
  net_end text,
  usage text,
  department text,
  contact text,
  phone text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_station_5kb_station on station_5kb(station_name);
create index if not exists idx_station_5kb_fiber on station_5kb(fiber_name);

-- 6. ms2
create table if not exists ms2 (
  id uuid default gen_random_uuid() primary key,
  station_name text not null,
  fiber_name text,
  destination text,
  core_count text,
  source text,
  connection_line text,
  port text,
  net_start text,
  net_end text,
  usage text,
  department text,
  contact text,
  phone text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_ms2_station on ms2(station_name);
create index if not exists idx_ms2_fiber on ms2(fiber_name);

-- 7. ms3
create table if not exists ms3 (
  id uuid default gen_random_uuid() primary key,
  station_name text not null,
  fiber_name text,
  destination text,
  core_count text,
  source text,
  connection_line text,
  port text,
  net_start text,
  net_end text,
  usage text,
  department text,
  contact text,
  phone text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_ms3_station on ms3(station_name);
create index if not exists idx_ms3_fiber on ms3(fiber_name);

-- 8. ms4
create table if not exists ms4 (
  id uuid default gen_random_uuid() primary key,
  station_name text not null,
  fiber_name text,
  destination text,
  core_count text,
  source text,
  connection_line text,
  port text,
  net_start text,
  net_end text,
  usage text,
  department text,
  contact text,
  phone text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_ms4_station on ms4(station_name);
create index if not exists idx_ms4_fiber on ms4(fiber_name);

-- 9. o2
create table if not exists o2 (
  id uuid default gen_random_uuid() primary key,
  station_name text not null,
  fiber_name text,
  destination text,
  core_count text,
  source text,
  connection_line text,
  port text,
  net_start text,
  net_end text,
  usage text,
  department text,
  contact text,
  phone text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_o2_station on o2(station_name);
create index if not exists idx_o2_fiber on o2(fiber_name);

-- 10. room
create table if not exists room (
  id uuid default gen_random_uuid() primary key,
  station_name text not null,
  fiber_name text,
  destination text,
  core_count text,
  source text,
  connection_line text,
  port text,
  net_start text,
  net_end text,
  usage text,
  department text,
  contact text,
  phone text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_room_station on room(station_name);
create index if not exists idx_room_fiber on room(fiber_name);
