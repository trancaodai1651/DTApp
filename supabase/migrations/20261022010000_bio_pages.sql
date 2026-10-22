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
