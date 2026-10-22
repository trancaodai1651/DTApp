-- Run this script in Supabase Dashboard > SQL Editor after creating the project.
create table if not exists public.poster_projects (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) <= 64),
  poster jsonb not null,
  thumbnail text not null default '',
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.poster_projects enable row level security;
revoke all on table public.poster_projects from anon;
grant select, insert, update, delete on table public.poster_projects to authenticated;
drop policy if exists "Users manage their own poster projects" on public.poster_projects;
create policy "Users manage their own poster projects" on public.poster_projects for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('poster-assets', 'poster-assets', false, 25165824, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Users read their poster assets" on storage.objects;
create policy "Users read their poster assets" on storage.objects for select to authenticated using (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users upload their poster assets" on storage.objects;
create policy "Users upload their poster assets" on storage.objects for insert to authenticated with check (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users update their poster assets" on storage.objects;
create policy "Users update their poster assets" on storage.objects for update to authenticated using (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete their poster assets" on storage.objects;
create policy "Users delete their poster assets" on storage.objects for delete to authenticated using (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text);

-- Bio page and ordered sales-channel data. This is safe to run more than once.
create table if not exists public.bio_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  share_id uuid not null unique default gen_random_uuid(),
  name text not null default 'Tạp Hoá DT' check (char_length(name) <= 60),
  description text not null default '' check (char_length(description) <= 240),
  channels jsonb not null default '[]'::jsonb
    check (jsonb_typeof(channels) = 'array' and jsonb_array_length(channels) <= 100),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bio_pages enable row level security;
revoke all on table public.bio_pages from anon;
grant select, insert, update, delete on table public.bio_pages to authenticated;

drop policy if exists "Users manage their own bio page" on public.bio_pages;
create policy "Users manage their own bio page" on public.bio_pages
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.get_public_bio(p_share_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'name', page.name,
    'description', page.description,
    'channels', page.channels
  )
  from public.bio_pages as page
  where page.share_id = p_share_id and page.is_published = true
  limit 1;
$$;

revoke all on function public.get_public_bio(uuid) from public, anon, authenticated;
grant execute on function public.get_public_bio(uuid) to anon, authenticated;
