-- get_ticket_seal/verify_ticket doivent chercher un billet par son seul ID,
-- sans connaître son événement (c'est tout le principe d'un lien /v/{id} scanné
-- à l'entrée). Or les ID de billets n'étaient garantis uniques que par le hasard
-- (32^6 possibilités) et restaient choisis par le client : une collision, ou un
-- ID délibérément forgé pour copier un billet d'un autre événement, aurait pu
-- faire résoudre le mauvais événement/acheteur côté vérification. On génère
-- désormais les ID de billets côté serveur, avec vérification d'unicité
-- globale (toutes ventes confondues) avant insertion.

-- create or replace avec une signature différente crée une surcharge au lieu
-- de remplacer : sans ce drop, l'ancienne version (tier_name et ID de billets
-- fournis par le client) resterait appelable via l'API RPC.
drop function if exists record_purchase(text, text, text, int, text, text, text, numeric, text[], bigint);

create or replace function record_purchase(
  p_event_code text,
  p_name text,
  p_phone text,
  p_qty int,
  p_operator text,
  p_tier_id text,
  p_unit_price numeric,
  p_ts bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tiers jsonb;
  v_tier jsonb;
  v_tier_name text;
  v_event_name text;
  v_sold int;
  v_prefix text;
  v_new_id text;
  v_exists boolean;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  start_rank int;
  ids_json jsonb := '[]'::jsonb;
  i int;
  attempt int;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  if coalesce((select suspended from profiles where id = auth.uid()), false) then
    raise exception 'Compte suspendu';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantité invalide';
  end if;

  -- Verrouille la ligne événement le temps de la transaction : deux achats
  -- concurrents sur le même palier ne peuvent plus ensemble dépasser sa capacité.
  select tiers, name into v_tiers, v_event_name from events where code = p_event_code for update;
  if v_tiers is null then
    raise exception 'Événement introuvable';
  end if;

  select t into v_tier from jsonb_array_elements(v_tiers) t where t->>'id' = p_tier_id;
  if v_tier is null then
    raise exception 'Catégorie de billet introuvable';
  end if;

  -- Le prix vient de l'événement lui-même, jamais du client.
  if p_unit_price is distinct from (v_tier->>'price')::numeric then
    raise exception 'Prix invalide pour cette catégorie de billet';
  end if;
  v_tier_name := v_tier->>'name';

  select coalesce(sum(qty), 0) into v_sold
  from buyers where event_code = p_event_code and tier_id = p_tier_id and not cancelled;

  if v_sold + p_qty > (v_tier->>'capacity')::int then
    raise exception 'Capacité dépassée pour cette catégorie de billet (% restant(s))', greatest((v_tier->>'capacity')::int - v_sold, 0);
  end if;

  select coalesce(sum(qty), 0) + 1 into start_rank from buyers where event_code = p_event_code and not cancelled;

  -- Préfixe = 3 premières lettres du nom de l'événement (accents courants retirés).
  v_prefix := upper(left(
    regexp_replace(
      translate(v_event_name, 'ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇàâäéèêëîïôöùûüç', 'AAAEEEEIIOOUUUCaaaeeeeiioouuuc'),
      '[^A-Za-z]', '', 'g'
    ) || 'XXX',
    3
  ));

  for i in 1..p_qty loop
    attempt := 0;
    loop
      select v_prefix || '-' || string_agg(substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1), '')
      into v_new_id
      from generate_series(1, 6);

      select exists(select 1 from buyers b, jsonb_array_elements(b.ids) t where t->>'id' = v_new_id) into v_exists;
      attempt := attempt + 1;
      exit when not v_exists or attempt >= 20;
    end loop;
    if v_exists then
      raise exception 'Impossible de générer un identifiant de billet unique, réessaie.';
    end if;
    ids_json := ids_json || jsonb_build_object('id', v_new_id, 'rank', start_rank + i - 1);
  end loop;

  insert into buyers (event_code, user_id, name, phone, qty, operator, tier_id, tier_name, unit_price, ids, ts)
  values (p_event_code, auth.uid(), p_name, p_phone, p_qty, p_operator, p_tier_id, v_tier_name, p_unit_price, ids_json, p_ts);

  return ids_json;
end;
$$;
