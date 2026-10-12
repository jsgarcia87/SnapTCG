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

-- ───────── Histórico de precios (lectura pública; solo escribe el trabajo diario con la service key) ─────────
create table if not exists public.price_history (
  card_id  text    not null,
  game     text    not null check (game in ('pokemon', 'magic')),
  day      date    not null,
  eur      numeric,
  usd      numeric,
  eur_foil numeric,
  usd_foil numeric,
  source   text,
  primary key (card_id, day)
);

alter table public.price_history enable row level security;

drop policy if exists "price_history_public_read" on public.price_history;
create policy "price_history_public_read" on public.price_history
  for select using (true);
-- Sin políticas de escritura: solo la service key (que ignora RLS) puede insertar.

-- ───────── Valor de la colección en el tiempo ─────────
create table if not exists public.collection_value_history (
  owner uuid    not null references auth.users(id) on delete cascade,
  day   date    not null,
  eur   numeric not null default 0,
  usd   numeric not null default 0,
  cards integer not null default 0,
  primary key (owner, day)
);

alter table public.collection_value_history enable row level security;

drop policy if exists "value_history_public_read" on public.collection_value_history;
create policy "value_history_public_read" on public.collection_value_history
  for select using (true);
