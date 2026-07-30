-- Audit de sécurité — corrige plusieurs failles trouvées dans le modèle de confiance :
--
-- 1) "buyers insert own" permettait à n'importe quel client authentifié d'insérer
--    directement des lignes dans buyers (en contournant record_purchase), avec un
--    prix, une quantité et des ID de billets entièrement arbitraires : possibilité
--    de billets gratuits valides, de survente illimitée, et de faux chiffre
--    d'affaires (donc de faux "fonds disponibles" au retrait). On supprime cette
--    policy : seule la fonction record_purchase (security definer) peut désormais
--    insérer, et on lui ajoute la validation qui manquait.
-- 2) "authenticated read events" laissait n'importe quel compte connecté lister
--    TOUS les événements de la plateforme (nom, ville, tarifs, et surtout le
--    numéro mobile money de l'organisateur), à l'opposé du modèle annoncé
--    ("pas de vitrine publique — ton lien, ton public"). On restreint la lecture
--    directe à ses propres événements/achats, et on ajoute une fonction dédiée
--    pour l'ouverture d'un événement via son code (le lien reste la seule clé).
-- 3) Rien n'empêchait un compte suspendu de s'auto-réactiver via une simple
--    requête UPDATE sur son propre profil (seul le changement de rôle était
--    verrouillé). On verrouille la colonne "suspended" de la même façon.

-- ---------- 1) Achat de billets : validation serveur du tarif + de la capacité ----------

drop policy "buyers insert own" on buyers;

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
  v_tiers jsonb;
  v_tier jsonb;
  v_sold int;
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
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantité invalide';
  end if;
  if array_length(p_ticket_ids, 1) is distinct from p_qty then
    raise exception 'Nombre de billets incohérent';
  end if;

  -- Verrouille la ligne événement le temps de la transaction : deux achats
  -- concurrents sur le même palier ne peuvent plus ensemble dépasser sa capacité.
  select tiers into v_tiers from events where code = p_event_code for update;
  if v_tiers is null then
    raise exception 'Événement introuvable';
  end if;

  select t into v_tier from jsonb_array_elements(v_tiers) t where t->>'id' = p_tier_id;
  if v_tier is null then
    raise exception 'Catégorie de billet introuvable';
  end if;

  -- Le prix et le nom viennent de l'événement lui-même, jamais du client :
  -- sans ça n'importe qui pouvait acheter à 0 FCFA ou gonfler le CA affiché.
  if p_unit_price is distinct from (v_tier->>'price')::numeric then
    raise exception 'Prix invalide pour cette catégorie de billet';
  end if;
  p_tier_name := v_tier->>'name';

  select coalesce(sum(qty), 0) into v_sold
  from buyers where event_code = p_event_code and tier_id = p_tier_id and not cancelled;

  if v_sold + p_qty > (v_tier->>'capacity')::int then
    raise exception 'Capacité dépassée pour cette catégorie de billet (% restant(s))', greatest((v_tier->>'capacity')::int - v_sold, 0);
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

-- ---------- 2) Lecture des événements : plus d'énumération globale ----------

drop policy "authenticated read events" on events;

create policy "read own or accessible events" on events for select using (
  auth.uid() = creator_id
  or exists (select 1 from event_access ea where ea.event_code = events.code and ea.user_id = auth.uid())
  or exists (select 1 from buyers b where b.event_code = events.code and b.user_id = auth.uid())
);

-- Ouverture d'un événement via son code de partage (avant même d'y avoir accédé,
-- donc avant qu'une ligne event_access n'existe) : le code lui-même fait office
-- de clé d'accès, comme annoncé ("ton lien, ton public").
create or replace function get_event_by_code(p_code text)
returns setof events
language sql
stable
security definer
set search_path = public
as $$
  select * from events where auth.uid() is not null and code = p_code;
$$;

-- ---------- 3) Un compte suspendu ne peut plus s'auto-réactiver ----------

create or replace function prevent_suspended_change()
returns trigger
language plpgsql
as $$
begin
  if new.suspended <> old.suspended and not is_admin() then
    raise exception 'Seul un administrateur peut modifier le statut de suspension.';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_suspended_change
before update on profiles
for each row execute function prevent_suspended_change();
