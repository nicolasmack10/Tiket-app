-- TIKÉ — schéma Supabase
-- À exécuter dans Supabase Dashboard → SQL Editor

create table if not exists events (
  code text primary key,
  creator_id text not null,
  momo_number text,
  name text not null,
  date text not null,
  time text,
  venue text,
  city text,
  description text,
  tiers jsonb not null default '[]',
  used jsonb not null default '{}',
  ts bigint not null
);

create table if not exists buyers (
  id bigserial primary key,
  event_code text not null references events(code) on delete cascade,
  name text not null,
  phone text,
  qty int not null,
  operator text,
  tier_id text,
  tier_name text,
  unit_price numeric not null,
  ids jsonb not null,
  ts bigint not null
);

create index if not exists buyers_event_code_idx on buyers(event_code);

-- Mise à jour atomique du billet scanné (évite les pertes en cas de scans concurrents)
create or replace function mark_ticket_used(p_code text, p_ticket_id text, p_ts bigint)
returns void
language sql
as $$
  update events
  set used = used || jsonb_build_object(p_ticket_id, p_ts)
  where code = p_code;
$$;

-- RLS : app sans authentification serveur (le "compte organisateur" est déclaratif côté client),
-- on ouvre donc en lecture/écriture publique, cohérent avec le modèle de confiance actuel de l'app.
alter table events enable row level security;
alter table buyers enable row level security;

create policy "public read events" on events for select using (true);
create policy "public insert events" on events for insert with check (true);
create policy "public update events" on events for update using (true) with check (true);

create policy "public read buyers" on buyers for select using (true);
create policy "public insert buyers" on buyers for insert with check (true);
