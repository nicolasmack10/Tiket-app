-- Scellé anti-fraude des billets : chaque QR encode désormais un lien de
-- vérification signé (HMAC-SHA256) plutôt que le simple identifiant du billet.
-- La clé vit dans Supabase Vault (jamais exposée au client, jamais dans une
-- migration versionnée). Le contrôle à l'entrée peut ainsi se faire en ouvrant
-- le lien depuis n'importe quel téléphone, sans être connecté au compte
-- organisateur.

create extension if not exists pgcrypto;

create or replace function ticket_hmac_secret()
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'ticket_hmac_secret' limit 1;
$$;

-- Postgres accorde EXECUTE à PUBLIC par défaut sur toute nouvelle fonction :
-- sans ce revoke, n'importe quel client pourrait appeler cette fonction via
-- l'API RPC et récupérer la clé HMAC en clair. Seules les fonctions ci-dessous
-- (elles-mêmes security definer, donc exécutées avec les droits du
-- propriétaire) peuvent encore l'appeler en interne.
revoke execute on function ticket_hmac_secret() from public, anon, authenticated;

-- Génère (à la volée, sans rien stocker) le lien signé + le sceau court pour
-- un billet donné. Réservé au titulaire du billet, à l'organisateur de
-- l'événement, ou à l'admin — comme la lecture de buyers.
create or replace function get_ticket_seal(p_ticket_id text)
returns table(qr_url text, seal_short text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_event_code text;
  v_tier_name text;
  v_buyer_user_id uuid;
  v_event_name text;
  v_creator_id uuid;
  v_msg text;
  v_sig text;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;

  select b.id, b.event_code, b.tier_name, b.user_id
    into v_order_id, v_event_code, v_tier_name, v_buyer_user_id
  from buyers b, jsonb_array_elements(b.ids) t
  where t->>'id' = p_ticket_id
  limit 1;

  if v_order_id is null then
    raise exception 'Billet introuvable';
  end if;

  select e.name, e.creator_id into v_event_name, v_creator_id from events e where e.code = v_event_code;

  if not (v_buyer_user_id = auth.uid() or v_creator_id = auth.uid() or is_admin()) then
    raise exception 'Non autorisé';
  end if;

  v_msg := p_ticket_id || '|' || v_order_id::text || '|' || v_event_name || '|' || v_tier_name;
  v_sig := encode(hmac(v_msg, ticket_hmac_secret(), 'sha256'), 'hex');

  return query select
    'https://tiketapp-phi.vercel.app/v/' || p_ticket_id || '?s=' || v_sig,
    left(v_sig, 12);
end;
$$;

-- Vérifie + consomme un billet via son lien signé. Appelable sans compte
-- (contrôle à l'entrée) : la sécurité vient de la signature, pas d'un login.
-- Verrouille la ligne événement le temps de la validation pour qu'un même
-- billet scanné deux fois en même temps ne soit jamais accepté deux fois.
create or replace function verify_ticket(p_ticket_id text, p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_event_code text;
  v_tier_name text;
  v_buyer_name text;
  v_cancelled boolean;
  v_event_name text;
  v_msg text;
  v_expected text;
  v_used jsonb;
  v_used_at bigint;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select b.id, b.event_code, b.tier_name, b.name, b.cancelled
    into v_order_id, v_event_code, v_tier_name, v_buyer_name, v_cancelled
  from buyers b, jsonb_array_elements(b.ids) t
  where t->>'id' = p_ticket_id
  limit 1;

  if v_order_id is null then
    return jsonb_build_object('status', 'INCONNU');
  end if;

  select e.name, e.used into v_event_name, v_used from events e where e.code = v_event_code for update;

  v_msg := p_ticket_id || '|' || v_order_id::text || '|' || v_event_name || '|' || v_tier_name;
  v_expected := encode(hmac(v_msg, ticket_hmac_secret(), 'sha256'), 'hex');

  if v_expected is distinct from p_signature then
    return jsonb_build_object('status', 'SIGNATURE_INVALIDE');
  end if;

  if v_cancelled then
    return jsonb_build_object('status', 'ANNULE', 'eventName', v_event_name, 'buyerName', v_buyer_name);
  end if;

  v_used_at := (v_used->>p_ticket_id)::bigint;
  if v_used_at is not null then
    return jsonb_build_object('status', 'DEJA_UTILISE', 'usedAt', v_used_at, 'eventName', v_event_name, 'buyerName', v_buyer_name);
  end if;

  update events set used = used || jsonb_build_object(p_ticket_id, v_now) where code = v_event_code;

  return jsonb_build_object('status', 'VALIDE', 'usedAt', v_now, 'eventName', v_event_name, 'buyerName', v_buyer_name);
end;
$$;

grant execute on function verify_ticket(text, text) to anon, authenticated;
