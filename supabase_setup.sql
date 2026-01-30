-- Enable RLS
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;

-- Users Table
create table users (
  id uuid default uuid_generate_v4() primary key,
  username text unique not null,
  password text not null, -- stored as plain text or hash (demo uses simple check)
  role text default 'user', -- 'admin' or 'user'
  group_id int, -- 1, 2, 3, etc.
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Insert Default Users (Passwords are SHA-256 Hashes)
insert into users (username, password, group_id, role) values
('1', '20eb44287e61efda39a1f468d9508467ee28975c1983f5cb5ac28b6d0d0ab980', 1, 'user'),
('2', 'f1305ad5669c46124644ab39edc21bcae318ca28ce606039cb437a4bad05d071', 2, 'user'),
('3', '0efd48109aa239d33625c86605e07ee7d1370b2154a6d1440ed938835792582b', 3, 'user'),
('179747', '2e62970c2b94d405e4858f70ac601a53370273fcdf5d0aa04bd70c48c7e40ba9', 99, 'admin');

-- Images Table
create table images (
  id uuid default uuid_generate_v4() primary key,
  file_path text not null, -- path in storage or URL
  filename text not null,
  group_id int,
  uploaded_by uuid references users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Phone Data Table (Based on Excel columns)
create table phones (
  id uuid default uuid_generate_v4() primary key,
  extension text, -- 分機號碼
  unit text, -- 使用單位
  line_group_id text, -- 線組編號
  g450_port text, -- G450 Port
  type text, -- 分機種類
  sub_count text, -- 副機數量
  did_number text, -- DID號碼
  location text, -- 裝機位置
  move_record text, -- 拆遷紀錄
  note text, -- 備註
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  updated_by uuid references users(id)
);

-- Dispatch Data Table (Based on Excel columns)
create table dispatch_phones (
  id uuid default uuid_generate_v4() primary key,
  extension text, -- 分機號碼
  c_terminal text, -- C端子位置
  lens text, -- LENS
  line_group_room text, -- 線組編號(機房)
  line_group_site text, -- 線組編號(現場)
  unit text, -- 使用單位
  location text, -- 裝機位置
  sub_count text, -- 副機數量
  contact_tel text, -- 連絡電話
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  updated_by uuid references users(id)
);

-- Enable Row Level Security (RLS)
alter table users enable row level security;
alter table images enable row level security;
alter table phones enable row level security;
alter table dispatch_phones enable row level security;

-- Policies
-- Users: Read own data
create policy "Users can view own data" on users for select using (true); -- Simplified for login check

-- Images: View all, Upload own group
create policy "Anyone can view images" on images for select using (true);
create policy "Users can insert images for their group" on images for insert with check (
  group_id = (select group_id from users where username = current_setting('request.jwt.claim.sub', true)) 
  or 
  exists (select 1 from users where username = current_setting('request.jwt.claim.sub', true) and role = 'admin')
);
-- Note: Since we might use custom auth or anon key with client-side logic for this simple app, we'll open up policies for now and rely on app logic + simple RLS.
-- For this specific request where users are hardcoded and we might not use full Supabase Auth (GoTrue), we will make tables public for read/write for the anon role but restrict via client app logic (as requested "web data encrypted"). 
-- However, best practice is true Auth. I will assume we use the 'users' table for a custom login and then use the anon key for operations.

create policy "Public Read Access" on images for select using (true);
create policy "Public Insert Access" on images for insert with check (true);
create policy "Public Update Access" on images for update using (true);

create policy "Public Read Phones" on phones for select using (true);
create policy "Public Write Phones" on phones for insert with check (true);
create policy "Public Update Phones" on phones for update using (true);

create policy "Public Read Dispatch" on dispatch_phones for select using (true);
create policy "Public Write Dispatch" on dispatch_phones for insert with check (true);
create policy "Public Update Dispatch" on dispatch_phones for update using (true);

-- Storage Bucket Setup (You need to create 'images' bucket in Supabase Dashboard)
-- insert into storage.buckets (id, name) values ('images', 'images');
-- create policy "Public Access" on storage.objects for select using ( bucket_id = 'images' );
-- create policy "Public Upload" on storage.objects for insert with check ( bucket_id = 'images' );
