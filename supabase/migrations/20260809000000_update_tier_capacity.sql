-- L'organisateur peut modifier le nombre de places (capacité) d'une catégorie
-- de billets à tout moment, même après le début des ventes. La nouvelle
-- capacité ne peut pas descendre sous le nombre de billets déjà vendus pour
-- cette catégorie.

create or replace function update_tier_capacity(p_event_code text, p_tier_id text, p_new_capacity int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
  v_tiers jsonb;
  v_new_tiers jsonb;
  v_sold int;
  v_found boolean;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  if p_new_capacity is null or p_new_capacity <= 0 then
    raise exception 'Capacité invalide';
  end if;

  select creator_id, tiers into v_creator, v_tiers from events where code = p_event_code for update;
  if v_creator is null then
    raise exception 'Événement introuvable';
  end if;
  if v_creator <> auth.uid() then
    raise exception 'Non autorisé';
  end if;

  select exists(select 1 from jsonb_array_elements(v_tiers) t where t->>'id' = p_tier_id) into v_found;
  if not v_found then
    raise exception 'Catégorie de billet introuvable';
  end if;

  select coalesce(sum(qty), 0) into v_sold
  from buyers where event_code = p_event_code and tier_id = p_tier_id and not cancelled;

  if p_new_capacity < v_sold then
    raise exception 'La capacité ne peut pas être inférieure au nombre de billets déjà vendus (% vendu(s))', v_sold;
  end if;

  select jsonb_agg(
    case when t->>'id' = p_tier_id then jsonb_set(t, '{capacity}', to_jsonb(p_new_capacity)) else t end
  )
  into v_new_tiers
  from jsonb_array_elements(v_tiers) t;

  update events set tiers = v_new_tiers where code = p_event_code;

  return v_new_tiers;
end;
$$;
