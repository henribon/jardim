alter table public.ideas
  add column if not exists color text,
  add column if not exists icon text,
  add column if not exists offset_x double precision not null default 0,
  add column if not exists offset_y double precision not null default 0;
