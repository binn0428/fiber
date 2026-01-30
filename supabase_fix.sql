-- 1. Create Storage Bucket (Fix for 'Bucket not found')
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- 2. Storage Policies (Ensure public access)
create policy "Public Access" on storage.objects for select using ( bucket_id = 'images' );
create policy "Public Upload" on storage.objects for insert with check ( bucket_id = 'images' );
create policy "Public Update" on storage.objects for update using ( bucket_id = 'images' );

-- 3. Fix User Passwords (Force update to SHA-256 hashes)
update users set password = '20eb44287e61efda39a1f468d9508467ee28975c1983f5cb5ac28b6d0d0ab980' where username = '1';
update users set password = 'f1305ad5669c46124644ab39edc21bcae318ca28ce606039cb437a4bad05d071' where username = '2';
update users set password = '0efd48109aa239d33625c86605e07ee7d1370b2154a6d1440ed938835792582b' where username = '3';
update users set password = '2e62970c2b94d405e4858f70ac601a53370273fcdf5d0aa04bd70c48c7e40ba9' where username = '179747';

-- 4. Ensure Tables are Publicly Writable (for the migration script using anon key)
alter table phones enable row level security;
create policy "Public Insert Phones" on phones for insert with check (true);
create policy "Public Select Phones" on phones for select using (true);

alter table dispatch_phones enable row level security;
create policy "Public Insert Dispatch" on dispatch_phones for insert with check (true);
create policy "Public Select Dispatch" on dispatch_phones for select using (true);
