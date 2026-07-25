-- Retrait : raison obligatoire, vérification que le numéro saisi correspond
-- à celui déclaré à la création de l'événement. L'historique des retraits
-- n'a toujours aucune policy DELETE pour l'organisateur (seul l'admin en a
-- une) : impossible pour lui de l'effacer.

alter table withdrawals add column reason text;
alter table withdrawals add column phone text;

drop function if exists request_withdrawal(text, numeric);

create or replace function request_withdrawal(p_event_code text, p_amount numeric, p_phone text, p_reason text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
  v_momo text;
  v_revenue numeric;
  v_withdrawn numeric;
  v_available numeric;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  if coalesce((select suspended from profiles where id = auth.uid()), false) then
    raise exception 'Compte suspendu';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Raison du retrait requise';
  end if;
  if p_phone is null or length(trim(regexp_replace(p_phone, '\D', '', 'g'))) = 0 then
    raise exception 'Numéro de téléphone requis';
  end if;

  select creator_id, momo_number into v_creator, v_momo from events where code = p_event_code for update;
  if v_creator is null then
    raise exception 'Événement introuvable';
  end if;
  if v_creator <> auth.uid() then
    raise exception 'Non autorisé';
  end if;
  if regexp_replace(p_phone, '\D', '', 'g') <> regexp_replace(coalesce(v_momo, ''), '\D', '', 'g') then
    raise exception 'Ce numéro ne correspond pas à celui renseigné à la création de l''événement';
  end if;

  select coalesce(sum(qty * unit_price), 0) into v_revenue
  from buyers where event_code = p_event_code and not cancelled;

  select coalesce(sum(amount), 0) into v_withdrawn
  from withdrawals where event_code = p_event_code;

  v_available := v_revenue * 0.95 - v_withdrawn;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Montant invalide';
  end if;
  if p_amount > v_available + 0.01 then
    raise exception 'Montant supérieur aux fonds disponibles (% FCFA)', round(v_available);
  end if;

  insert into withdrawals (event_code, amount, reason, phone, ts)
  values (p_event_code, p_amount, trim(p_reason), trim(p_phone), (extract(epoch from now()) * 1000)::bigint);

  return p_amount;
end;
$$;
