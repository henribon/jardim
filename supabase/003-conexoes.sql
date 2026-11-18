alter table public.ideas
  add column if not exists links jsonb not null default '[]'::jsonb;
