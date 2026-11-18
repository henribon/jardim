create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid references public.ideas (id) on delete cascade,
  title text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  position double precision not null default 0,
  color text,
  icon text,
  offset_x double precision not null default 0,
  offset_y double precision not null default 0,
  links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ideas_user_parent_idx on public.ideas (user_id, parent_id);

alter table public.ideas enable row level security;

drop policy if exists "ideas_owner" on public.ideas;
create policy "ideas_owner" on public.ideas
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('ideas', 'ideas', false)
on conflict (id) do nothing;

drop policy if exists "ideas_files_read" on storage.objects;
create policy "ideas_files_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'ideas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ideas_files_write" on storage.objects;
create policy "ideas_files_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ideas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ideas_files_delete" on storage.objects;
create policy "ideas_files_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'ideas' and (storage.foldername(name))[1] = auth.uid()::text);
