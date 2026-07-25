-- Commission variable selon le prix du billet, au lieu d'un taux fixe de 5% :
--   0 à 5000 FCFA  → 10%
--   5001 FCFA et + → 20%

create or replace function request_withdrawal(p_event_code text, p_amount numeric, p_phone text, p_reason text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
  v_momo text;
  v_net numeric;
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

  select coalesce(sum(
    qty * unit_price * (1 - (case when unit_price <= 5000 then 0.10 else 0.20 end))
  ), 0) into v_net
  from buyers where event_code = p_event_code and not cancelled;

  select coalesce(sum(amount), 0) into v_withdrawn
  from withdrawals where event_code = p_event_code;

  v_available := v_net - v_withdrawn;

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
