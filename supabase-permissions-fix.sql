-- TFL Cloud Kitchen Supabase permissions fix
-- Run this in Supabase Dashboard > SQL Editor if the app says:
-- "permission denied for table tfl_metadata" or sync fails after setup.

grant usage on schema public to anon;
grant select, insert, update, delete on table public.tfl_metadata to anon;
grant select, insert, update, delete on table public.tfl_orders to anon;

alter table public.tfl_metadata enable row level security;
alter table public.tfl_orders enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tfl_metadata'
      and policyname = 'Allow app metadata read'
  ) then
    create policy "Allow app metadata read"
    on public.tfl_metadata for select
    to anon
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tfl_metadata'
      and policyname = 'Allow app metadata write'
  ) then
    create policy "Allow app metadata write"
    on public.tfl_metadata for insert
    to anon
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tfl_metadata'
      and policyname = 'Allow app metadata update'
  ) then
    create policy "Allow app metadata update"
    on public.tfl_metadata for update
    to anon
    using (true)
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tfl_orders'
      and policyname = 'Allow order read'
  ) then
    create policy "Allow order read"
    on public.tfl_orders for select
    to anon
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tfl_orders'
      and policyname = 'Allow order insert'
  ) then
    create policy "Allow order insert"
    on public.tfl_orders for insert
    to anon
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tfl_orders'
      and policyname = 'Allow order update'
  ) then
    create policy "Allow order update"
    on public.tfl_orders for update
    to anon
    using (true)
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tfl_orders'
      and policyname = 'Allow order delete'
  ) then
    create policy "Allow order delete"
    on public.tfl_orders for delete
    to anon
    using (true);
  end if;
end $$;

alter table public.tfl_metadata replica identity full;
alter table public.tfl_orders replica identity full;
