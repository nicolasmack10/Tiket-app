-- Rang du billet (N°...), annulation/remboursement (organisateur uniquement).

alter table buyers add column cancelled boolean not null default false;

-- Achat atomique avec attribution du rang (le Nème billet vendu pour l'événement).
-- security definer : nécessaire pour compter tous les billets déjà vendus sur
-- l'événement (un client ne voit normalement que ses propres commandes via RLS).
create or replace function record_purchase(
  p_event_code text,
  p_name text,
  p_phone text,
  p_qty int,
  p_operator text,
  p_tier_id text,
  p_tier_name text,
  p_unit_price numeric,
  p_ticket_ids text[],
  p_ts bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  start_rank int;
  ids_json jsonb := '[]'::jsonb;
  i int;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  if coalesce((select suspended from profiles where id = auth.uid()), false) then
    raise exception 'Compte suspendu';
  end if;
  if array_length(p_ticket_ids, 1) is distinct from p_qty then
    raise exception 'Nombre de billets incohérent';
  end if;

  select coalesce(sum(qty), 0) + 1 into start_rank from buyers where event_code = p_event_code and not cancelled;

  for i in 1..p_qty loop
    ids_json := ids_json || jsonb_build_object('id', p_ticket_ids[i], 'rank', start_rank + i - 1);
  end loop;

  insert into buyers (event_code, user_id, name, phone, qty, operator, tier_id, tier_name, unit_price, ids, ts)
  values (p_event_code, auth.uid(), p_name, p_phone, p_qty, p_operator, p_tier_id, p_tier_name, p_unit_price, ids_json, p_ts);

  return ids_json;
end;
$$;

-- L'organisateur peut modifier les commandes de ses propres événements (utilisé
-- pour marquer une commande annulée/remboursée).
create policy "organizer update own event buyers" on buyers for update using (
  exists (select 1 from events e where e.code = buyers.event_code and e.creator_id = auth.uid())
) with check (
  exists (select 1 from events e where e.code = buyers.event_code and e.creator_id = auth.uid())
);
create policy "admin update any buyer" on buyers for update using (is_admin()) with check (is_admin());

-- Demandes de remboursement : le client demande, seul l'organisateur (ou l'admin) décide.
create table refund_requests (
  id bigserial primary key,
  buyer_id bigint not null references buyers(id) on delete cascade,
  event_code text not null references events(code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at bigint not null,
  resolved_at bigint
);
create index refund_requests_event_code_idx on refund_requests(event_code);
alter table refund_requests enable row level security;

create policy "refund select own or organizer" on refund_requests for select using (
  auth.uid() = user_id
  or exists (select 1 from events e where e.code = refund_requests.event_code and e.creator_id = auth.uid())
  or is_admin()
);
create policy "refund insert own" on refund_requests for insert with check (auth.uid() = user_id and not is_suspended());
create policy "refund update by organizer" on refund_requests for update using (
  exists (select 1 from events e where e.code = refund_requests.event_code and e.creator_id = auth.uid())
) with check (
  exists (select 1 from events e where e.code = refund_requests.event_code and e.creator_id = auth.uid())
);
create policy "refund admin all" on refund_requests for all using (is_admin()) with check (is_admin());
