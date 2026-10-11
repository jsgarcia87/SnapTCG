-- SnapTCG / CardDex — esquema de Supabase (Postgres)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run

-- ───────── Colección (pública en lectura, solo el dueño escribe) ─────────
create table if not exists public.collection (
  owner      uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  card_id    text        not null,
  game       text        not null check (game in ('pokemon', 'magic')),
  qty        integer     not null check (qty > 0),
  card       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (owner, card_id)
);

alter table public.collection enable row level security;

drop policy if exists "collection_public_read" on public.collection;
create policy "collection_public_read" on public.collection
  for select using (true);

drop policy if exists "collection_owner_write" on public.collection;
create policy "collection_owner_write" on public.collection
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- ───────── Mazos (privados: solo el dueño los ve; sirven de copia de seguridad) ─────────
create table if not exists public.decks (
  owner      uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  deck_id    text        not null,
  nombre     text        not null,
  juego      text        not null check (juego in ('pokemon', 'magic')),
  formato    text        not null default 'standard',
  cards      jsonb       not null,
  total      integer     not null default 0,
  value      numeric     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner, deck_id)
);

alter table public.decks enable row level security;

drop policy if exists "decks_owner_all" on public.decks;
create policy "decks_owner_all" on public.decks
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());
