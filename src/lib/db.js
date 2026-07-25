import { supabase } from "./supabase";

function rowToEvent(row) {
  return {
    code: row.code,
    creatorId: row.creator_id,
    momoNumber: row.momo_number,
    name: row.name,
    date: row.date,
    time: row.time,
    venue: row.venue,
    city: row.city,
    desc: row.description,
    posterUrl: row.poster_url,
    queueEnabled: row.queue_enabled,
    tiers: row.tiers || [],
    used: row.used || {},
    ts: row.ts,
    buyers: [],
    withdrawals: [],
  };
}

function rowToBuyer(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    qty: row.qty,
    operator: row.operator,
    tierId: row.tier_id,
    tierName: row.tier_name,
    unitPrice: Number(row.unit_price),
    ids: (row.ids || []).map((x) => (typeof x === "string" ? { id: x, rank: null } : x)),
    cancelled: !!row.cancelled,
    ts: Number(row.ts),
  };
}

function rowToWithdrawal(row) {
  return { id: row.id, amount: Number(row.amount), ts: Number(row.ts) };
}

async function assemble(eventRows, eventCodes) {
  const byCode = {};
  for (const row of eventRows) byCode[row.code] = rowToEvent(row);
  if (!eventCodes.length) return byCode;

  const [{ data: buyerRows, error: e2 }, { data: withdrawalRows, error: e3 }] = await Promise.all([
    supabase.from("buyers").select("*").in("event_code", eventCodes),
    supabase.from("withdrawals").select("*").in("event_code", eventCodes),
  ]);
  if (e2) throw e2;
  if (e3) throw e3;

  for (const row of buyerRows || []) {
    if (byCode[row.event_code]) byCode[row.event_code].buyers.push(rowToBuyer(row));
  }
  for (const row of withdrawalRows || []) {
    if (byCode[row.event_code]) byCode[row.event_code].withdrawals.push(rowToWithdrawal(row));
  }
  return byCode;
}

/* ---------- Organisateur ---------- */
export async function fetchOrganizerEvents(userId) {
  const { data: eventRows, error } = await supabase.from("events").select("*").eq("creator_id", userId);
  if (error) throw error;
  return assemble(eventRows, eventRows.map((r) => r.code));
}

export async function createEventDB(ev) {
  const { error } = await supabase.from("events").insert({
    code: ev.code,
    creator_id: ev.creatorId,
    momo_number: ev.momoNumber,
    name: ev.name,
    date: ev.date,
    time: ev.time,
    venue: ev.venue,
    city: ev.city,
    description: ev.desc,
    poster_url: ev.posterUrl,
    queue_enabled: ev.queueEnabled,
    tiers: ev.tiers,
    used: ev.used,
    ts: ev.ts,
  });
  if (error) throw error;
}

export async function uploadPosterDB(userId, code, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${code}.${ext}`;
  const { error } = await supabase.storage.from("posters").upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("posters").getPublicUrl(path);
  return data.publicUrl;
}

export async function markTicketUsedDB(eventCode, ticketId, ts) {
  const { error } = await supabase.rpc("mark_ticket_used", {
    p_code: eventCode,
    p_ticket_id: ticketId,
    p_ts: ts,
  });
  if (error) throw error;
}

export async function withdrawFundsDB(eventCode, amount) {
  const { error } = await supabase.from("withdrawals").insert({
    event_code: eventCode,
    amount,
    ts: Date.now(),
  });
  if (error) throw error;
}

/* ---------- Client ---------- */
export async function fetchClientEvents(userId) {
  const { data: accessRows, error: e1 } = await supabase.from("event_access").select("event_code").eq("user_id", userId);
  if (e1) throw e1;
  const codes = accessRows.map((r) => r.event_code);
  if (!codes.length) return {};

  const { data: eventRows, error: e2 } = await supabase.from("events").select("*").in("code", codes);
  if (e2) throw e2;

  const byCode = await assemble(eventRows, codes);
  // Un client ne voit que ses propres billets (RLS garantit déjà ce filtrage côté serveur).
  const { data: buyerRows, error: e3 } = await supabase.from("buyers").select("*").eq("user_id", userId).in("event_code", codes);
  if (e3) throw e3;
  for (const code of Object.keys(byCode)) byCode[code].buyers = [];
  for (const row of buyerRows || []) {
    if (byCode[row.event_code]) byCode[row.event_code].buyers.push(rowToBuyer(row));
  }
  return byCode;
}

export async function openEventByCode(code) {
  const { data, error } = await supabase.from("events").select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const byCode = await assemble([data], [data.code]);
  return byCode[data.code];
}

export async function recordEventAccess(userId, eventCode) {
  const { error } = await supabase
    .from("event_access")
    .upsert({ user_id: userId, event_code: eventCode, ts: Date.now() }, { onConflict: "user_id,event_code", ignoreDuplicates: true });
  if (error) throw error;
}

export async function addBuyerDB(eventCode, userId, buyer) {
  const { data, error } = await supabase.rpc("record_purchase", {
    p_event_code: eventCode,
    p_name: buyer.name,
    p_phone: buyer.phone,
    p_qty: buyer.qty,
    p_operator: buyer.operator,
    p_tier_id: buyer.tierId,
    p_tier_name: buyer.tierName,
    p_unit_price: buyer.unitPrice,
    p_ticket_ids: buyer.ids,
    p_ts: buyer.ts,
  });
  if (error) throw error;
  return data; // [{ id, rank }, ...]
}

/* ---------- Remboursements ---------- */
export async function requestRefundDB(buyerId, eventCode, userId) {
  const { error } = await supabase.from("refund_requests").insert({
    buyer_id: buyerId,
    event_code: eventCode,
    user_id: userId,
    requested_at: Date.now(),
  });
  if (error) throw error;
}

export async function fetchMyRefundRequestsDB(userId) {
  const { data, error } = await supabase.from("refund_requests").select("*").eq("user_id", userId);
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id, buyerId: r.buyer_id, eventCode: r.event_code, status: r.status, requestedAt: Number(r.requested_at) }));
}

export async function fetchRefundRequestsDB(eventCode) {
  const { data, error } = await supabase.from("refund_requests").select("*").eq("event_code", eventCode).eq("status", "pending");
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id, buyerId: r.buyer_id, eventCode: r.event_code, userId: r.user_id, requestedAt: Number(r.requested_at) }));
}

export async function resolveRefundDB(requestId, buyerId, approve) {
  if (approve) {
    const { error: e1 } = await supabase.from("buyers").update({ cancelled: true }).eq("id", buyerId);
    if (e1) throw e1;
  }
  const { error: e2 } = await supabase
    .from("refund_requests")
    .update({ status: approve ? "approved" : "rejected", resolved_at: Date.now() })
    .eq("id", requestId);
  if (e2) throw e2;
}

/* ---------- Super admin ---------- */
function rowToProfile(row) {
  return { id: row.id, role: row.role, name: row.name, phone: row.phone, suspended: row.suspended, createdAt: row.created_at };
}

export async function fetchAdminOverview() {
  const [{ data: profileRows, error: e1 }, { data: eventRows, error: e2 }] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("events").select("*"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const byCode = await assemble(eventRows, eventRows.map((r) => r.code));
  return {
    profiles: profileRows.map(rowToProfile),
    events: Object.values(byCode),
  };
}

export async function setSuspendedDB(userId, suspended) {
  const { error } = await supabase.from("profiles").update({ suspended }).eq("id", userId);
  if (error) throw error;
}

export async function adminDeleteAccountDB(userId) {
  const { error } = await supabase.from("profiles").delete().eq("id", userId);
  if (error) throw error;
}

export async function adminDeleteEventDB(code) {
  const { error } = await supabase.from("events").delete().eq("code", code);
  if (error) throw error;
}

/* ---------- Salle d'attente avant achat ---------- */
export async function joinQueueDB(eventCode, userId) {
  const { data: existing, error: e1 } = await supabase
    .from("queue")
    .select("admitted_at")
    .eq("event_code", eventCode)
    .eq("user_id", userId)
    .maybeSingle();
  if (e1) throw e1;
  if (existing) return existing.admitted_at != null;
  const { error: e2 } = await supabase.from("queue").insert({ event_code: eventCode, user_id: userId, joined_at: Date.now() });
  if (e2) throw e2;
  return false;
}

export async function queuePositionDB(eventCode) {
  const { data, error } = await supabase.rpc("queue_position", { p_event_code: eventCode });
  if (error) throw error;
  return data;
}

export async function tryAdmitSelfDB(eventCode) {
  const { data, error } = await supabase.rpc("try_admit_self", { p_event_code: eventCode });
  if (error) throw error;
  return data;
}

export async function leaveQueueDB(eventCode, userId) {
  const { error } = await supabase.from("queue").delete().eq("event_code", eventCode).eq("user_id", userId);
  if (error) throw error;
}

export async function fetchQueueCountDB(eventCode) {
  const { count, error } = await supabase
    .from("queue")
    .select("*", { count: "exact", head: true })
    .eq("event_code", eventCode)
    .is("admitted_at", null);
  if (error) throw error;
  return count || 0;
}
