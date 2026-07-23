-- TIKÉ — comptes organisateur/client, retraits, accès événements côté client

-- Profils applicatifs (un par utilisateur Supabase Auth)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('organizer', 'client')),
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "read own profile" on profiles for select using (auth.uid() = id);
create policy "insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Aucune donnée réelle en prod à ce stade : on repart propre pour re-typer creator_id en uuid.
truncate table buyers, events;

alter table events alter column creator_id type uuid using creator_id::uuid;
alter table events add constraint events_creator_fk foreign key (creator_id) references auth.users(id);

alter table buyers add column user_id uuid references auth.users(id);
alter table buyers alter column user_id set not null;

-- Retraits de fonds (un par clic de retrait organisateur)
create table withdrawals (
  id bigserial primary key,
  event_code text not null references events(code) on delete cascade,
  amount numeric not null,
  ts bigint not null
);
create index withdrawals_event_code_idx on withdrawals(event_code);
alter table withdrawals enable row level security;

-- Événements qu'un client a ouverts via un lien (pour les retrouver dans son compte)
create table event_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_code text not null references events(code) on delete cascade,
  ts bigint not null,
  primary key (user_id, event_code)
);
alter table event_access enable row level security;

-- On resserre les policies : tout nécessite désormais un compte connecté
drop policy "public read events" on events;
drop policy "public insert events" on events;
drop policy "public update events" on events;
drop policy "public read buyers" on buyers;
drop policy "public insert buyers" on buyers;

create policy "authenticated read events" on events for select using (auth.uid() is not null);
create policy "organizer insert own events" on events for insert with check (auth.uid() = creator_id);
create policy "organizer update own events" on events for update using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

create policy "buyers select own or organizer" on buyers for select using (
  auth.uid() = user_id
  or exists (select 1 from events e where e.code = buyers.event_code and e.creator_id = auth.uid())
);
create policy "buyers insert own" on buyers for insert with check (auth.uid() = user_id);

create policy "withdrawals select own event" on withdrawals for select using (
  exists (select 1 from events e where e.code = withdrawals.event_code and e.creator_id = auth.uid())
);
create policy "withdrawals insert own event" on withdrawals for insert with check (
  exists (select 1 from events e where e.code = withdrawals.event_code and e.creator_id = auth.uid())
);

create policy "event_access select own" on event_access for select using (auth.uid() = user_id);
create policy "event_access insert own" on event_access for insert with check (auth.uid() = user_id);
