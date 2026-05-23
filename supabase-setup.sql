-- TFL Cloud Kitchen Supabase setup
-- Run this once in Supabase Dashboard > SQL Editor.

create table if not exists tfl_metadata (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists tfl_orders (
  order_id text primary key,
  order_data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table tfl_metadata enable row level security;
alter table tfl_orders enable row level security;

create policy "Allow app metadata read"
on tfl_metadata for select
to anon
using (true);

create policy "Allow app metadata write"
on tfl_metadata for insert
to anon
with check (true);

create policy "Allow app metadata update"
on tfl_metadata for update
to anon
using (true)
with check (true);

create policy "Allow order read"
on tfl_orders for select
to anon
using (true);

create policy "Allow order insert"
on tfl_orders for insert
to anon
with check (true);

create policy "Allow order update"
on tfl_orders for update
to anon
using (true)
with check (true);

create policy "Allow order delete"
on tfl_orders for delete
to anon
using (true);

alter table tfl_metadata replica identity full;
alter table tfl_orders replica identity full;

alter publication supabase_realtime add table tfl_metadata;
alter publication supabase_realtime add table tfl_orders;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "Public product image read"
on storage.objects for select
to anon
using (bucket_id = 'product-images');

create policy "Admin product image upload"
on storage.objects for insert
to anon
with check (bucket_id = 'product-images');

create policy "Admin product image update"
on storage.objects for update
to anon
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');
