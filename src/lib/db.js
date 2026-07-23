import { supabase } from "./supabase";

function rowToEvent(row, buyers) {
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
    buyers,
  };
}

function rowToBuyer(row) {
  return {
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

export async function fetchEvents() {
  const [{ data: eventRows, error: e1 }, { data: buyerRows, error: e2 }] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("buyers").select("*"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const byCode = {};
  for (const row of eventRows) byCode[row.code] = rowToEvent(row, []);
  for (const row of buyerRows || []) {
    if (byCode[row.event_code]) byCode[row.event_code].buyers.push(rowToBuyer(row));
  }
  return byCode;
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

export async function addBuyerDB(eventCode, buyer) {
  const { error } = await supabase.from("buyers").insert({
    event_code: eventCode,
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

export async function markTicketUsedDB(eventCode, ticketId, ts) {
  const { error } = await supabase.rpc("mark_ticket_used", {
    p_code: eventCode,
    p_ticket_id: ticketId,
    p_ts: ts,
  });
  if (error) throw error;
}
