-- Sécurise les retraits : jusqu'ici le montant était envoyé tel quel par le
-- client et inséré sans validation côté serveur — rien n'empêchait de
-- retirer plus que les fonds réellement disponibles. Le montant est
-- désormais recalculé et validé côté serveur, avec un verrou de ligne pour
-- empêcher deux retraits simultanés de consommer deux fois le même solde.

-- Plus aucune insertion directe possible : seule la fonction ci-dessous peut créer un retrait.
drop policy "withdrawals insert own event" on withdrawals;

create or replace function request_withdrawal(p_event_code text, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
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

  -- Verrouille la ligne événement le temps de la transaction : un second
  -- retrait simultané attendra que celui-ci soit terminé avant de recalculer
  -- le solde, ce qui empêche un double retrait du même solde.
  select creator_id into v_creator from events where code = p_event_code for update;
  if v_creator is null then
    raise exception 'Événement introuvable';
  end if;
  if v_creator <> auth.uid() then
    raise exception 'Non autorisé';
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

  insert into withdrawals (event_code, amount, ts)
  values (p_event_code, p_amount, (extract(epoch from now()) * 1000)::bigint);

  return p_amount;
end;
$$;
