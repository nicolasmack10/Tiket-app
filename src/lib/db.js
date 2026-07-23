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
    tiers: row.tiers || [],
    used: row.used || {},
    ts: row.ts,
    buyers: [],
    withdrawals: [],
  };
}

function rowToBuyer(row) {
  return {
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    qty: row.qty,
    operator: row.operator,
    tierId: row.tier_id,
    tierName: row.tier_name,
    unitPrice: Number(row.unit_price),
    ids: row.ids,
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
    tiers: ev.tiers,
    used: ev.used,
    ts: ev.ts,
  });
  if (error) throw error;
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
  const { error } = await supabase.from("buyers").insert({
    event_code: eventCode,
    user_id: userId,
    name: buyer.name,
    phone: buyer.phone,
    qty: buyer.qty,
    operator: buyer.operator,
    tier_id: buyer.tierId,
    tier_name: buyer.tierName,
    unit_price: buyer.unitPrice,
    ids: buyer.ids,
    ts: buyer.ts,
  });
  if (error) throw error;
}
