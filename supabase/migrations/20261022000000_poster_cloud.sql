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
create policy "Users manage their own poster projects" on public.poster_projects
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('poster-assets', 'poster-assets', false, 25165824, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read their poster assets" on storage.objects;
create policy "Users read their poster assets" on storage.objects
  for select to authenticated using (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users upload their poster assets" on storage.objects;
create policy "Users upload their poster assets" on storage.objects
  for insert to authenticated with check (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users update their poster assets" on storage.objects;
create policy "Users update their poster assets" on storage.objects
  for update to authenticated using (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete their poster assets" on storage.objects;
create policy "Users delete their poster assets" on storage.objects
  for delete to authenticated using (bucket_id = 'poster-assets' and (storage.foldername(name))[1] = auth.uid()::text);
