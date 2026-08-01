-- pgcrypto is installed in the "extensions" schema on Supabase, not "public" —
-- these functions only had public in their search_path, so the bare hmac(...)
-- call couldn't be resolved. Qualifying it explicitly.

create or replace function get_ticket_seal(p_ticket_id text)
returns table(qr_url text, seal_short text)
language plpgsql
stable
security definer
set search_path = public, extensions
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
  v_sig := encode(extensions.hmac(convert_to(v_msg, 'UTF8'), convert_to(ticket_hmac_secret(), 'UTF8'), 'sha256'::text), 'hex');

  return query select
    'https://tiketapp-phi.vercel.app/v/' || p_ticket_id || '?s=' || v_sig,
    left(v_sig, 12);
end;
$$;

create or replace function verify_ticket(p_ticket_id text, p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
  v_expected := encode(extensions.hmac(convert_to(v_msg, 'UTF8'), convert_to(ticket_hmac_secret(), 'UTF8'), 'sha256'::text), 'hex');

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
