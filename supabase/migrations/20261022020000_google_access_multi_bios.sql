-- Google OAuth application access and per-user, multi-bio support.
-- Run after 20261022010000_bio_pages.sql.

create table if not exists public.app_users (
  email text primary key check (email = lower(email) and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  display_name text not null default '',
  role text not null default 'editor' check (role in ('admin', 'editor')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users enable row level security;
revoke all on table public.app_users from public, anon;
grant select, insert, update, delete on table public.app_users to authenticated;

insert into public.app_users (email, display_name, role, is_active)
values ('trancaodai1651@gmail.com', 'DT App Owner', 'admin', true)
on conflict (email) do update set display_name = excluded.display_name, role = 'admin', is_active = true, updated_at = now();

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select app_user.role
    from public.app_users as app_user
    where app_user.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and app_user.is_active = true
    limit 1
  ), '');
$$;

create or replace function public.is_active_app_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.current_app_role() in ('admin', 'editor'); $$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.current_app_role() = 'admin'; $$;

revoke all on function public.current_app_role() from public, anon;
revoke all on function public.is_active_app_user() from public, anon;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_active_app_user() to authenticated;
grant execute on function public.is_app_admin() to authenticated;

create or replace function public.protect_dt_app_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if lower(old.email) = 'trancaodai1651@gmail.com' then
      raise exception 'The DT App owner access record cannot be deleted.';
    end if;
    return old;
  end if;
  if lower(coalesce(old.email, new.email, '')) = 'trancaodai1651@gmail.com' then
    if lower(new.email) <> 'trancaodai1651@gmail.com' or new.role <> 'admin' or new.is_active is not true then
      raise exception 'The DT App owner access record must remain an active administrator.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_dt_app_owner on public.app_users;
create trigger protect_dt_app_owner
before update or delete on public.app_users
for each row execute function public.protect_dt_app_owner();

drop policy if exists "Users read their own app access" on public.app_users;
drop policy if exists "Admins manage app access" on public.app_users;
create policy "Users read their own app access" on public.app_users
  for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')) or public.is_app_admin());
create policy "Admins manage app access" on public.app_users
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- Existing installations had one bio per account. Give those records a stable
-- legacy slug, then allow an account to own any number of bios.
alter table public.bio_pages drop constraint if exists bio_pages_user_id_key;
alter table public.bio_pages add column if not exists slug text;
update public.bio_pages
set slug = 'bio-' || left(share_id::text, 8)
where slug is null or btrim(slug) = '';
alter table public.bio_pages alter column slug set not null;
alter table public.bio_pages drop constraint if exists bio_pages_slug_format;
alter table public.bio_pages add constraint bio_pages_slug_format
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 48);
create unique index if not exists bio_pages_slug_unique on public.bio_pages (slug);
create index if not exists bio_pages_user_updated_idx on public.bio_pages (user_id, updated_at desc);

drop policy if exists "Users manage their own bio page" on public.bio_pages;
drop policy if exists "Active users read their own bio pages" on public.bio_pages;
drop policy if exists "Active users create their own bio pages" on public.bio_pages;
drop policy if exists "Active users update their own bio pages" on public.bio_pages;
drop policy if exists "Active users delete their own bio pages" on public.bio_pages;
create policy "Active users read their own bio pages" on public.bio_pages
  for select to authenticated
  using (auth.uid() = user_id and public.is_active_app_user());
create policy "Active users create their own bio pages" on public.bio_pages
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_active_app_user());
create policy "Active users update their own bio pages" on public.bio_pages
  for update to authenticated
  using (auth.uid() = user_id and public.is_active_app_user())
  with check (auth.uid() = user_id and public.is_active_app_user());
create policy "Active users delete their own bio pages" on public.bio_pages
  for delete to authenticated
  using (auth.uid() = user_id and public.is_active_app_user());

drop policy if exists "Users manage their own poster projects" on public.poster_projects;
drop policy if exists "Active users read their own poster projects" on public.poster_projects;
drop policy if exists "Active users create their own poster projects" on public.poster_projects;
drop policy if exists "Active users update their own poster projects" on public.poster_projects;
drop policy if exists "Active users delete their own poster projects" on public.poster_projects;
create policy "Active users read their own poster projects" on public.poster_projects
  for select to authenticated using (auth.uid() = user_id and public.is_active_app_user());
create policy "Active users create their own poster projects" on public.poster_projects
  for insert to authenticated with check (auth.uid() = user_id and public.is_active_app_user());
create policy "Active users update their own poster projects" on public.poster_projects
  for update to authenticated
  using (auth.uid() = user_id and public.is_active_app_user())
  with check (auth.uid() = user_id and public.is_active_app_user());
create policy "Active users delete their own poster projects" on public.poster_projects
  for delete to authenticated using (auth.uid() = user_id and public.is_active_app_user());

drop policy if exists "Users read their poster assets" on storage.objects;
drop policy if exists "Users upload their poster assets" on storage.objects;
drop policy if exists "Users update their poster assets" on storage.objects;
drop policy if exists "Users delete their poster assets" on storage.objects;
create policy "Active users read their poster assets" on storage.objects
  for select to authenticated
  using (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_app_user());
create policy "Active users upload their poster assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_app_user());
create policy "Active users update their poster assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_app_user())
  with check (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_app_user());
create policy "Active users delete their poster assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_app_user());

create or replace function public.get_public_bio_by_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'name', page.name,
    'description', page.description,
    'channels', page.channels,
    'slug', page.slug
  )
  from public.bio_pages as page
  where page.slug = lower(btrim(p_slug)) and page.is_published = true
  limit 1;
$$;

revoke all on function public.get_public_bio_by_slug(text) from public, anon, authenticated;
grant execute on function public.get_public_bio_by_slug(text) to anon, authenticated;
