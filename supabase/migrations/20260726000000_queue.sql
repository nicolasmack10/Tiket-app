-- Salle d'attente virtuelle avant achat (pour les événements à forte demande).
-- L'organisateur active la file à la création ; les clients y patientent et
-- sont admis un par un, à un rythme régulé, avant d'accéder au paiement.

alter table events add column queue_enabled boolean not null default false;

create table queue (
  event_code text not null references events(code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at bigint not null,
  admitted_at bigint,
  primary key (event_code, user_id)
);
create index queue_event_code_idx on queue(event_code);
alter table queue enable row level security;

create policy "queue select own or organizer" on queue for select using (
  auth.uid() = user_id
  or exists (select 1 from events e where e.code = queue.event_code and e.creator_id = auth.uid())
  or is_admin()
);
create policy "queue insert own" on queue for insert with check (auth.uid() = user_id and not is_suspended());
create policy "queue delete own" on queue for delete using (auth.uid() = user_id);
create policy "queue admin delete" on queue for delete using (is_admin());

-- Position dans la file (nombre de personnes non-admises arrivées avant soi).
-- security definer : nécessaire pour compter les lignes des autres files
-- d'attente sans les exposer directement au client (RLS ne laisse voir que sa
-- propre ligne).
create or replace function queue_position(p_event_code text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from queue q
  where q.event_code = p_event_code
    and q.admitted_at is null
    and q.joined_at < coalesce((select joined_at from queue where event_code = p_event_code and user_id = auth.uid()), 0);
$$;

-- Tente de s'auto-admettre : uniquement si on est en tête de file ET que le
-- dernier admis remonte à plus de 4 secondes (rythme régulé de la file).
create or replace function try_admit_self(p_event_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  my_joined_at bigint;
  ahead_count int;
  last_admitted bigint;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select joined_at into my_joined_at from queue where event_code = p_event_code and user_id = auth.uid();
  if my_joined_at is null then
    return false;
  end if;

  select count(*) into ahead_count from queue
    where event_code = p_event_code and admitted_at is null and joined_at < my_joined_at;
  if ahead_count > 0 then
    return false;
  end if;

  select max(admitted_at) into last_admitted from queue where event_code = p_event_code and admitted_at is not null;
  if last_admitted is not null and (now_ms - last_admitted) < 4000 then
    return false;
  end if;

  update queue set admitted_at = now_ms where event_code = p_event_code and user_id = auth.uid();
  return true;
end;
$$;
