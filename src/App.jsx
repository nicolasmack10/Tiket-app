import React, { useState, useEffect, useCallback, useRef } from "react";
import { fetchEvents, createEventDB, addBuyerDB, markTicketUsedDB } from "./lib/db";

/* ============================================================
   TIKÉ v3 — Billetterie par lien, paiement mobile money
   Nouveautés v3 :
   - Animations : transitions de vue, révélations en cascade,
     compteurs animés, anneau de remplissage, micro-interactions
     (respecte prefers-reduced-motion)
   - Tableau de bord organisateur : revenus animés, courbe des
     ventes 7 jours, répartition par catégorie, taux de
     transformation, activité récente
   ============================================================ */

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;900&family=Space+Grotesk:wght@400;500;700&display=swap');
`;

/* ---------- Animations globales ---------- */
const ANIM_CSS = `
@keyframes tk-fade-up { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
@keyframes tk-view-in { from { opacity:0; transform:translateY(8px) scale(.995) } to { opacity:1; transform:none } }
@keyframes tk-pop { 0% { transform:scale(.82); opacity:0 } 60% { transform:scale(1.06) } 100% { transform:scale(1); opacity:1 } }
@keyframes tk-spin { to { transform:rotate(360deg) } }
@keyframes tk-scanline { from { top:6% } to { top:90% } }
@keyframes tk-pulse-green { 0%,100% { box-shadow:0 0 0 0 rgba(61,220,132,.45) } 50% { box-shadow:0 0 0 14px rgba(61,220,132,0) } }
@keyframes tk-shake { 10%,90% { transform:translateX(-2px) } 20%,80% { transform:translateX(4px) } 30%,50%,70% { transform:translateX(-7px) } 40%,60% { transform:translateX(7px) } }
@keyframes tk-toast-in { from { opacity:0; transform:translate(-50%, 18px) } to { opacity:1; transform:translate(-50%, 0) } }
@keyframes tk-shimmer { from { background-position:-320px 0 } to { background-position:320px 0 } }
@keyframes tk-bar-grow { from { transform:scaleY(0) } to { transform:scaleY(1) } }
@keyframes tk-float { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-6px) } }

.tk-view { animation: tk-view-in .32s cubic-bezier(.22,1,.36,1) both; }
.tk-reveal { animation: tk-fade-up .5s cubic-bezier(.22,1,.36,1) both; }
.tk-press { transition: transform .12s ease, border-color .2s ease, background .2s ease; }
.tk-press:active { transform: scale(.972); }
.tk-lift { transition: transform .2s cubic-bezier(.22,1,.36,1), border-color .2s ease; }
.tk-lift:hover { transform: translateY(-3px); border-color: #4A3F7A !important; }
.tk-bar { transform-origin: bottom; animation: tk-bar-grow .6s cubic-bezier(.22,1,.36,1) both; }

@media (prefers-reduced-motion: reduce) {
  .tk-view, .tk-reveal, .tk-bar { animation: none !important; }
  .tk-press:active, .tk-lift:hover { transform: none !important; }
  * { animation-duration: .001ms !important; transition-duration: .001ms !important; }
}
`;

const C = {
  bg: "#0E0B1E",
  surface: "#1A1530",
  surface2: "#241D42",
  line: "#332B58",
  text: "#F2EFFA",
  muted: "#9C94BC",
  amber: "#FFB525",
  amberDark: "#131313",
  pink: "#FF5D73",
  green: "#3DDC84",
  blue: "#5B9DFF",
  mtn: "#FFCB05",
  airtel: "#ED1C24",
};

const TIER_COLORS = [C.amber, C.pink, C.blue, C.green, "#B57BFF"];

const fmtFCFA = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA";
const fmtShort = (n) =>
  n >= 1000000 ? (n / 1000000).toFixed(1).replace(".0", "") + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(n);

const genCode = (len = 6) => {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

const tierSold = (ev, tierId) => ev.buyers.filter((b) => b.tierId === tierId).reduce((s, b) => s + b.qty, 0);
const totalSold = (ev) => ev.buyers.reduce((s, b) => s + b.qty, 0);
const totalCap = (ev) => ev.tiers.reduce((s, t) => s + t.capacity, 0);
const revenue = (ev) => ev.buyers.reduce((s, b) => s + b.qty * b.unitPrice, 0);

/* ---------- Stockage local (par appareil) ---------- */
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/* ---------- Hooks ---------- */
function useCountUp(target, duration = 900) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setV(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(a + (target - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

/* ============================ UI de base ============================ */
const S = {
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: C.surface2,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
    color: C.text,
    padding: "13px 14px",
    fontSize: 15,
    fontFamily: "'Space Grotesk', sans-serif",
    outline: "none",
    marginBottom: 12,
    transition: "border-color .2s ease",
  },
  label: {
    display: "block",
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: C.muted,
    marginBottom: 6,
    fontWeight: 700,
  },
  btn: {
    width: "100%",
    background: C.amber,
    color: C.amberDark,
    border: "none",
    borderRadius: 14,
    padding: "15px 18px",
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "'Space Grotesk', sans-serif",
    cursor: "pointer",
  },
  btnGhost: {
    width: "100%",
    background: "transparent",
    color: C.text,
    border: `1px solid ${C.line}`,
    borderRadius: 14,
    padding: "14px 18px",
    fontSize: 15,
    fontWeight: 500,
    fontFamily: "'Space Grotesk', sans-serif",
    cursor: "pointer",
  },
  card: {
    background: C.surface,
    border: `1px solid ${C.line}`,
    borderRadius: 18,
    padding: 18,
  },
};

function Reveal({ i = 0, children, style }) {
  return (
    <div className="tk-reveal" style={{ animationDelay: `${Math.min(i, 8) * 70}ms`, ...style }}>
      {children}
    </div>
  );
}

function Top({ title, onBack, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 0 14px" }}>
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Retour"
          className="tk-press"
          style={{
            background: C.surface,
            border: `1px solid ${C.line}`,
            color: C.text,
            borderRadius: 10,
            width: 38,
            height: 38,
            cursor: "pointer",
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          ←
        </button>
      )}
      <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 17, flex: 1, lineHeight: 1.2 }}>
        {title}
      </div>
      {right}
    </div>
  );
}

function Perf() {
  return (
    <div style={{ position: "relative", height: 0 }}>
      <div style={{ position: "absolute", left: 10, right: 10, top: -1, borderTop: `2px dashed ${C.line}` }} />
      <div style={{ position: "absolute", left: -12, top: -12, width: 24, height: 24, borderRadius: "50%", background: C.bg, border: `1px solid ${C.line}` }} />
      <div style={{ position: "absolute", right: -12, top: -12, width: 24, height: 24, borderRadius: "50%", background: C.bg, border: `1px solid ${C.line}` }} />
    </div>
  );
}

/* ---------- Anneau de remplissage animé ---------- */
function Ring({ pct, size = 96, stroke = 9, label, sub }) {
  const p = useCountUp(pct, 1100);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.surface2} strokeWidth={stroke} />
        <defs>
          <linearGradient id="tk-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={C.amber} />
            <stop offset="100%" stopColor={C.pink} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#tk-ring)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - (circ * Math.min(100, p)) / 100}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 18 }}>
          {Math.round(p)}
          <span style={{ fontSize: 11, color: C.muted }}>%</span>
        </div>
        {label && <div style={{ fontSize: 9.5, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700 }}>{label}</div>}
      </div>
      {sub}
    </div>
  );
}

/* ---------- Courbe des ventes (7 derniers jours) ---------- */
function SalesChart({ buyers }) {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push({ d, amount: 0, qty: 0 });
  }
  buyers.forEach((b) => {
    const bd = new Date(b.ts);
    bd.setHours(0, 0, 0, 0);
    const slot = days.find((x) => x.d.getTime() === bd.getTime());
    if (slot) {
      slot.amount += b.qty * b.unitPrice;
      slot.qty += b.qty;
    }
  });
  const max = Math.max(1, ...days.map((x) => x.amount));
  const H = 88;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: H, marginBottom: 8 }}>
        {days.map((x, i) => {
          const h = Math.max(3, (x.amount / max) * H);
          const active = x.amount > 0;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
              {active && (
                <div style={{ fontSize: 9, color: C.muted, textAlign: "center", marginBottom: 3, fontWeight: 700 }}>
                  {fmtShort(x.amount)}
                </div>
              )}
              <div
                className="tk-bar"
                title={`${x.qty} billet(s) · ${fmtFCFA(x.amount)}`}
                style={{
                  height: h,
                  borderRadius: 6,
                  background: active ? `linear-gradient(180deg, ${C.amber}, ${C.pink})` : C.surface2,
                  animationDelay: `${i * 60}ms`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {days.map((x, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 10, color: C.muted, textTransform: "capitalize" }}>
            {x.d.toLocaleDateString("fr-FR", { weekday: "narrow" })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Répartition par catégorie (barre empilée) ---------- */
function TierSplit({ ev }) {
  const rows = ev.tiers.map((t, i) => ({
    ...t,
    sold: tierSold(ev, t.id),
    rev: tierSold(ev, t.id) * t.price,
    color: TIER_COLORS[i % TIER_COLORS.length],
  }));
  const totalRev = rows.reduce((s, r) => s + r.rev, 0);

  return (
    <div>
      <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: C.surface2, marginBottom: 14 }}>
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              width: totalRev ? `${(r.rev / totalRev) * 100}%` : "0%",
              background: r.color,
              transition: "width .8s cubic-bezier(.22,1,.36,1)",
            }}
          />
        ))}
      </div>
      {rows.map((r, i) => (
        <div
          key={r.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 0",
            borderBottom: i < rows.length - 1 ? `1px solid ${C.line}` : "none",
            fontSize: 14,
          }}
        >
          <div style={{ width: 9, height: 9, borderRadius: 3, background: r.color, flexShrink: 0 }} />
          <div style={{ flex: 1, fontWeight: 700 }}>
            {r.name}
            <span style={{ color: C.muted, fontWeight: 400, fontSize: 12.5 }}> · {fmtFCFA(r.price)}</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700 }}>
              {r.sold}
              <span style={{ color: C.muted, fontSize: 12 }}>/{r.capacity}</span>
            </div>
            <div style={{ color: C.muted, fontSize: 11.5 }}>{totalRev ? Math.round((r.rev / totalRev) * 100) : 0}% des revenus</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================ App ============================ */
export default function TikeApp() {
  const [view, setView] = useState("home");
  const [creator, setCreator] = useState(null);
  const [events, setEvents] = useState({});
  const [myTickets, setMyTickets] = useState([]);
  const [activeCode, setActiveCode] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    (async () => {
      const c = lsGet("tike:creator", null);
      const tk = lsGet("tike:mytickets:v2", []);
      if (c) setCreator(c);
      if (tk) setMyTickets(tk);
      try {
        setEvents(await fetchEvents());
      } catch (e) {
        console.error("Échec du chargement des événements", e);
        notify("Impossible de charger les événements — vérifie ta connexion.");
      }
      setLoading(false);
    })();
  }, []);

  const saveTickets = useCallback((next) => {
    setMyTickets(next);
    lsSet("tike:mytickets:v2", next);
  }, []);

  const ev = activeCode ? events[activeCode] : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(1200px 600px at 80% -10%, #241D42 0%, ${C.bg} 55%)`,
        color: C.text,
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <style>{FONT_CSS}</style>
      <style>{ANIM_CSS}</style>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 18px 40px" }}>
        {loading ? (
          <div style={{ padding: "70px 0" }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height: i === 0 ? 44 : 78,
                  borderRadius: 16,
                  marginBottom: 14,
                  background: `linear-gradient(90deg, ${C.surface} 0px, ${C.surface2} 160px, ${C.surface} 320px)`,
                  backgroundSize: "640px 100%",
                  animation: "tk-shimmer 1.2s linear infinite",
                }}
              />
            ))}
          </div>
        ) : (
          <div className="tk-view" key={view}>
            {view === "home" && <Home setView={setView} creator={creator} myTickets={myTickets} />}
            {view === "cAuth" && (
              <CreatorAuth
                onBack={() => setView("home")}
                onDone={(c) => {
                  setCreator(c);
                  lsSet("tike:creator", c);
                  setView("cDash");
                }}
              />
            )}
            {view === "cDash" && (
              <CreatorDash
                creator={creator}
                events={events}
                onBack={() => setView("home")}
                onNew={() => setView("cNew")}
                onOpen={(code) => {
                  setActiveCode(code);
                  setView("cEvent");
                }}
              />
            )}
            {view === "cNew" && (
              <NewEvent
                creator={creator}
                onBack={() => setView("cDash")}
                onCreate={async (e) => {
                  try {
                    await createEventDB(e);
                  } catch (err) {
                    console.error(err);
                    notify("Échec de la création — réessaie.");
                    return;
                  }
                  setEvents((prev) => ({ ...prev, [e.code]: e }));
                  setActiveCode(e.code);
                  setView("cEvent");
                  notify("Événement créé — partage ton lien !");
                }}
              />
            )}
            {view === "cEvent" && ev && (
              <CreatorEvent ev={ev} onBack={() => setView("cDash")} onScan={() => setView("cScan")} notify={notify} />
            )}
            {view === "cScan" && ev && (
              <Scanner
                ev={ev}
                onBack={() => setView("cEvent")}
                onMarkUsed={async (ticketId) => {
                  const ts = Date.now();
                  try {
                    await markTicketUsedDB(ev.code, ticketId, ts);
                  } catch (err) {
                    console.error(err);
                    notify("Échec de la validation — réessaie.");
                    return;
                  }
                  setEvents((prev) => ({
                    ...prev,
                    [ev.code]: { ...prev[ev.code], used: { ...(prev[ev.code].used || {}), [ticketId]: ts } },
                  }));
                }}
              />
            )}
            {view === "kAccess" && (
              <ClientAccess
                events={events}
                onBack={() => setView("home")}
                onFound={(code) => {
                  setActiveCode(code);
                  setView("kEvent");
                }}
              />
            )}
            {view === "kEvent" && ev && <ClientEvent ev={ev} onBack={() => setView("kAccess")} onBuy={() => setView("kPay")} />}
            {view === "kPay" && ev && (
              <Payment
                ev={ev}
                onBack={() => setView("kEvent")}
                onPaid={async ({ buyerName, buyerPhone, qty, operator, tier }) => {
                  const ids = Array.from({ length: qty }, () => "TK-" + genCode(4) + "-" + genCode(4));
                  const buyer = {
                    name: buyerName,
                    phone: buyerPhone,
                    qty,
                    operator,
                    tierId: tier.id,
                    tierName: tier.name,
                    unitPrice: tier.price,
                    ids,
                    ts: Date.now(),
                  };
                  try {
                    await addBuyerDB(ev.code, buyer);
                  } catch (err) {
                    console.error(err);
                    notify("Échec de l'enregistrement du paiement — réessaie.");
                    return;
                  }
                  setEvents((prev) => ({
                    ...prev,
                    [ev.code]: { ...prev[ev.code], buyers: [...prev[ev.code].buyers, buyer] },
                  }));
                  const newTickets = ids.map((id) => ({
                    id,
                    eventCode: ev.code,
                    eventName: ev.name,
                    date: ev.date,
                    time: ev.time,
                    venue: ev.venue,
                    city: ev.city,
                    tierName: tier.name,
                    price: tier.price,
                    buyerName,
                    ts: Date.now(),
                  }));
                  saveTickets([...myTickets, ...newTickets]);
                  setView("kTickets");
                  notify("Paiement confirmé — billets reçus 🎟️");
                }}
              />
            )}
            {view === "kTickets" && <MyTickets tickets={myTickets} onBack={() => setView("home")} />}
          </div>
        )}
      </div>
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            background: C.green,
            color: "#08240F",
            fontWeight: 700,
            padding: "12px 20px",
            borderRadius: 999,
            fontSize: 14,
            boxShadow: "0 8px 30px rgba(0,0,0,.5)",
            zIndex: 50,
            maxWidth: "90%",
            animation: "tk-toast-in .35s cubic-bezier(.22,1,.36,1) both",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/* ============================ Accueil ============================ */
function Home({ setView, creator, myTickets }) {
  return (
    <div>
      <Reveal i={0}>
        <div style={{ padding: "44px 0 8px" }}>
          <div
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontWeight: 900,
              fontSize: 40,
              lineHeight: 1,
              letterSpacing: -1,
            }}
          >
            TIKÉ
            <span style={{ color: C.amber, display: "inline-block", animation: "tk-float 2.6s ease-in-out infinite" }}>.</span>
          </div>
          <div style={{ color: C.muted, marginTop: 10, fontSize: 15, lineHeight: 1.5 }}>
            Crée ton événement, partage le lien, encaisse par mobile money. Pas de vitrine publique — ton lien, ton
            public.
          </div>
        </div>
      </Reveal>

      <div style={{ display: "grid", gap: 14, marginTop: 26 }}>
        <Reveal i={1}>
          <button
            onClick={() => setView(creator ? "cDash" : "cAuth")}
            className="tk-press tk-lift"
            style={{ ...S.card, textAlign: "left", cursor: "pointer", color: C.text, width: "100%" }}
          >
            <div style={{ fontSize: 26 }}>🎤</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 16, margin: "8px 0 4px" }}>
              Je suis organisateur
            </div>
            <div style={{ color: C.muted, fontSize: 13.5 }}>
              {creator ? `Reprendre — ${creator.name}` : "Créer un événement et vendre des billets"}
            </div>
          </button>
        </Reveal>

        <Reveal i={2}>
          <button
            onClick={() => setView("kAccess")}
            className="tk-press tk-lift"
            style={{ ...S.card, textAlign: "left", cursor: "pointer", color: C.text, width: "100%" }}
          >
            <div style={{ fontSize: 26 }}>🎟️</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 16, margin: "8px 0 4px" }}>
              J'ai reçu un lien
            </div>
            <div style={{ color: C.muted, fontSize: 13.5 }}>Ouvrir un événement et acheter mon billet</div>
          </button>
        </Reveal>

        {myTickets.length > 0 && (
          <Reveal i={3}>
            <button onClick={() => setView("kTickets")} className="tk-press" style={S.btnGhost}>
              Mes billets ({myTickets.length})
            </button>
          </Reveal>
        )}
      </div>
    </div>
  );
}

/* ============================ Organisateur ============================ */
function CreatorAuth({ onBack, onDone }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <div>
      <Top title="Compte organisateur" onBack={onBack} />
      <Reveal i={0}>
        <div style={S.card}>
          <label style={S.label}>Nom ou nom de scène</label>
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. DJ Maleka Events" />
          <label style={S.label}>Numéro mobile money (encaissements)</label>
          <input style={S.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 XXX XX XX" inputMode="tel" />
          <button
            className="tk-press"
            style={{ ...S.btn, opacity: name && phone ? 1 : 0.4 }}
            disabled={!name || !phone}
            onClick={() => onDone({ id: "c-" + genCode(8), name, phone })}
          >
            Continuer
          </button>
          <div style={{ color: C.muted, fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
            Les fonds des ventes sont reversés sur ce numéro. Tu ne verras que tes propres événements.
          </div>
        </div>
      </Reveal>
    </div>
  );
}

/* ---------- TABLEAU DE BORD GLOBAL ---------- */
function CreatorDash({ creator, events, onBack, onNew, onOpen }) {
  const mine = Object.values(events)
    .filter((e) => e.creatorId === creator.id)
    .sort((a, b) => b.ts - a.ts);

  const allBuyers = mine.flatMap((e) => e.buyers.map((b) => ({ ...b, eventName: e.name, eventCode: e.code })));
  const totalRevenue = mine.reduce((s, e) => s + revenue(e), 0);
  const soldAll = mine.reduce((s, e) => s + totalSold(e), 0);
  const capAll = mine.reduce((s, e) => s + totalCap(e), 0);
  const scannedAll = mine.reduce((s, e) => s + Object.keys(e.used || {}).length, 0);
  const fillPct = capAll ? (soldAll / capAll) * 100 : 0;
  const commission = totalRevenue * 0.05;

  const revAnim = useCountUp(totalRevenue);
  const soldAnim = useCountUp(soldAll);

  const upcoming = mine.filter((e) => new Date(e.date + "T" + (e.time || "00:00")) >= new Date()).length;
  const best = mine.slice().sort((a, b) => revenue(b) - revenue(a))[0];

  const recent = allBuyers.sort((a, b) => b.ts - a.ts).slice(0, 5);

  return (
    <div>
      <Top title={`Salut, ${creator.name}`} onBack={onBack} />

      {/* Bloc revenus principal */}
      <Reveal i={0}>
        <div
          style={{
            ...S.card,
            background: `linear-gradient(140deg, ${C.surface2}, #3A2E6E)`,
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 14,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={S.label}>Revenus encaissés</div>
            <div
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontWeight: 900,
                fontSize: 26,
                color: C.amber,
                lineHeight: 1.1,
                letterSpacing: -0.5,
              }}
            >
              {fmtFCFA(revAnim)}
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
              Net après commission 5% :<br />
              <b style={{ color: C.text }}>{fmtFCFA(totalRevenue - commission)}</b>
            </div>
          </div>
          <Ring pct={fillPct} label="rempli" />
        </div>
      </Reveal>

      {/* KPI */}
      <Reveal i={1}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
          {[
            { k: "Billets", v: Math.round(soldAnim), c: C.text },
            { k: "Scannés", v: scannedAll, c: C.green },
            { k: "À venir", v: upcoming, c: C.blue },
          ].map((x) => (
            <div key={x.k} style={{ ...S.card, padding: 14, textAlign: "center" }}>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 20, color: x.c }}>{x.v}</div>
              <div style={{ fontSize: 10.5, color: C.muted, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 700, marginTop: 3 }}>
                {x.k}
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Courbe 7 jours */}
      {allBuyers.length > 0 && (
        <Reveal i={2}>
          <div style={{ ...S.card, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={S.label}>Ventes — 7 derniers jours</div>
              <div style={{ fontSize: 11.5, color: C.muted }}>tous événements</div>
            </div>
            <SalesChart buyers={allBuyers} />
          </div>
        </Reveal>
      )}

      {/* Meilleur événement */}
      {best && revenue(best) > 0 && (
        <Reveal i={3}>
          <div style={{ ...S.card, marginBottom: 14, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 24 }}>🏆</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
                Meilleur événement
              </div>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 3 }}>{best.name}</div>
            </div>
            <div style={{ color: C.amber, fontWeight: 700, fontSize: 14 }}>{fmtFCFA(revenue(best))}</div>
          </div>
        </Reveal>
      )}

      {/* Activité récente */}
      {recent.length > 0 && (
        <Reveal i={4}>
          <div style={{ ...S.card, marginBottom: 14 }}>
            <div style={{ ...S.label, marginBottom: 12 }}>Activité récente</div>
            {recent.map((b, i) => (
              <div
                key={i}
                className="tk-reveal"
                style={{
                  animationDelay: `${300 + i * 60}ms`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 0",
                  borderBottom: i < recent.length - 1 ? `1px solid ${C.line}` : "none",
                  fontSize: 13.5,
                }}
              >
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {b.name} · {b.qty} × {b.tierName}
                  </div>
                  <div style={{ color: C.muted, fontSize: 11.5 }}>{b.eventName}</div>
                </div>
                <div style={{ color: C.amber, fontWeight: 700, whiteSpace: "nowrap" }}>{fmtFCFA(b.qty * b.unitPrice)}</div>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      <Reveal i={5}>
        <button className="tk-press" style={{ ...S.btn, marginBottom: 20 }} onClick={onNew}>
          + Créer un événement
        </button>
      </Reveal>

      {mine.length === 0 ? (
        <Reveal i={6}>
          <div style={{ ...S.card, textAlign: "center", color: C.muted, fontSize: 14 }}>
            Aucun événement pour l'instant. Crée le premier et partage ton lien sur WhatsApp ou Facebook.
          </div>
        </Reveal>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={S.label}>Mes événements</div>
          {mine.map((e, i) => {
            const p = totalCap(e) ? Math.round((totalSold(e) / totalCap(e)) * 100) : 0;
            return (
              <Reveal key={e.code} i={6 + i}>
                <button
                  onClick={() => onOpen(e.code)}
                  className="tk-press tk-lift"
                  style={{ ...S.card, textAlign: "left", cursor: "pointer", color: C.text, width: "100%" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{e.name}</div>
                    <div style={{ color: C.amber, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
                      {totalSold(e)}/{totalCap(e)}
                    </div>
                  </div>
                  <div style={{ color: C.muted, fontSize: 13, margin: "4px 0 10px" }}>
                    {e.date} · {e.venue}, {e.city}
                  </div>
                  <div style={{ background: C.surface2, borderRadius: 999, height: 6, overflow: "hidden" }}>
                    <div
                      style={{
                        width: p + "%",
                        height: "100%",
                        background: `linear-gradient(90deg, ${C.amber}, ${C.pink})`,
                        transition: "width .9s cubic-bezier(.22,1,.36,1)",
                      }}
                    />
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Création avec catégories de prix ---------- */
function NewEvent({ creator, onBack, onCreate }) {
  const [f, setF] = useState({ name: "", date: "", time: "", venue: "", city: "Pointe-Noire", desc: "" });
  const [tiers, setTiers] = useState([{ id: "t1", name: "Standard", price: "", capacity: "" }]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setTier = (i, k, v) => {
    const next = tiers.slice();
    next[i] = { ...next[i], [k]: v };
    setTiers(next);
  };
  const addTier = () => {
    const suggestions = ["VIP", "VVIP", "Carré Or", "Table"];
    const name = suggestions[Math.min(tiers.length - 1, suggestions.length - 1)] || "Catégorie";
    setTiers([...tiers, { id: "t" + (Date.now() % 100000), name, price: "", capacity: "" }]);
  };
  const removeTier = (i) => setTiers(tiers.filter((_, j) => j !== i));

  const tiersOk = tiers.length > 0 && tiers.every((t) => t.name.trim() && Number(t.price) > 0 && Number(t.capacity) > 0);
  const ok = f.name && f.date && f.time && f.venue && tiersOk;

  return (
    <div>
      <Top title="Nouvel événement" onBack={onBack} />
      <Reveal i={0}>
        <div style={{ ...S.card, marginBottom: 16 }}>
          <label style={S.label}>Nom de l'événement</label>
          <input style={S.input} value={f.name} onChange={set("name")} placeholder="Ex. Soirée Rumba Live" />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Date</label>
              <input style={S.input} type="date" value={f.date} onChange={set("date")} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Heure</label>
              <input style={S.input} type="time" value={f.time} onChange={set("time")} />
            </div>
          </div>
          <label style={S.label}>Lieu</label>
          <input style={S.input} value={f.venue} onChange={set("venue")} placeholder="Ex. Espace Trentenaire" />
          <label style={S.label}>Ville</label>
          <input style={S.input} value={f.city} onChange={set("city")} />
          <label style={S.label}>Description (visible via le lien)</label>
          <textarea
            style={{ ...S.input, minHeight: 70, resize: "vertical", marginBottom: 0 }}
            value={f.desc}
            onChange={set("desc")}
            placeholder="Programme, artistes, dress code…"
          />
        </div>
      </Reveal>

      <Reveal i={1}>
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ ...S.label, marginBottom: 12 }}>Catégories de billets</div>
          {tiers.map((t, i) => (
            <div
              key={t.id}
              className="tk-reveal"
              style={{
                background: C.surface2,
                border: `1px solid ${C.line}`,
                borderRadius: 14,
                padding: 14,
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <input
                  style={{ ...S.input, marginBottom: 0, background: C.surface }}
                  value={t.name}
                  onChange={(e) => setTier(i, "name", e.target.value)}
                  placeholder="Nom (ex. VIP)"
                />
                {tiers.length > 1 && (
                  <button
                    onClick={() => removeTier(i)}
                    aria-label="Supprimer la catégorie"
                    className="tk-press"
                    style={{
                      background: "transparent",
                      border: `1px solid ${C.line}`,
                      color: C.pink,
                      borderRadius: 10,
                      width: 42,
                      height: 42,
                      cursor: "pointer",
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Prix (FCFA)</label>
                  <input
                    style={{ ...S.input, marginBottom: 0, background: C.surface }}
                    inputMode="numeric"
                    value={t.price}
                    onChange={(e) => setTier(i, "price", e.target.value)}
                    placeholder="5000"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Places</label>
                  <input
                    style={{ ...S.input, marginBottom: 0, background: C.surface }}
                    inputMode="numeric"
                    value={t.capacity}
                    onChange={(e) => setTier(i, "capacity", e.target.value)}
                    placeholder="200"
                  />
                </div>
              </div>
            </div>
          ))}
          <button className="tk-press" style={S.btnGhost} onClick={addTier}>
            + Ajouter une catégorie (VIP, Carré Or…)
          </button>
        </div>
      </Reveal>

      <Reveal i={2}>
        <button
          className="tk-press"
          style={{ ...S.btn, opacity: ok ? 1 : 0.4 }}
          disabled={!ok}
          onClick={() =>
            onCreate({
              code: genCode(6),
              creatorId: creator.id,
              momoNumber: creator.phone,
              name: f.name,
              date: f.date,
              time: f.time,
              venue: f.venue,
              city: f.city,
              desc: f.desc,
              tiers: tiers.map((t) => ({ id: t.id, name: t.name.trim(), price: Number(t.price), capacity: Number(t.capacity) })),
              buyers: [],
              used: {},
              ts: Date.now(),
            })
          }
        >
          Créer et obtenir mon lien
        </button>
      </Reveal>
    </div>
  );
}

/* ---------- TABLEAU DE BORD ÉVÉNEMENT ---------- */
function CreatorEvent({ ev, onBack, onScan, notify }) {
  const link = `https://tike.app/e/${ev.code}`;
  const rev = revenue(ev);
  const sold = totalSold(ev);
  const cap = totalCap(ev);
  const pct = cap ? (sold / cap) * 100 : 0;
  const usedCount = Object.keys(ev.used || {}).length;
  const scanPct = sold ? (usedCount / sold) * 100 : 0;
  const revAnim = useCountUp(rev);
  const avgBasket = ev.buyers.length ? rev / ev.buyers.length : 0;
  const commission = rev * 0.05;

  const eventDate = new Date(ev.date + "T" + (ev.time || "00:00"));
  const daysLeft = Math.ceil((eventDate - new Date()) / 86400000);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      notify("Lien copié !");
    } catch {
      notify(`Lien : ${link}`);
    }
  };
  const priceLine = ev.tiers.map((t) => `${t.name} ${fmtFCFA(t.price)}`).join(" · ");
  const waText = encodeURIComponent(
    `🎟️ ${ev.name}\n📅 ${ev.date} à ${ev.time}\n📍 ${ev.venue}, ${ev.city}\n💵 ${priceLine}\n\nAchète ton billet ici : ${link}`
  );

  return (
    <div>
      <Top title={ev.name} onBack={onBack} />

      {/* Bandeau principal */}
      <Reveal i={0}>
        <div
          style={{
            ...S.card,
            background: `linear-gradient(140deg, ${C.surface2}, #3A2E6E)`,
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 14,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={S.label}>Revenus</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 24, color: C.amber, letterSpacing: -0.5 }}>
              {fmtFCFA(revAnim)}
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>
              {sold} / {cap} billets ·{" "}
              {daysLeft >= 0 ? (
                <b style={{ color: daysLeft <= 3 ? C.pink : C.text }}>J−{daysLeft}</b>
              ) : (
                <b style={{ color: C.muted }}>terminé</b>
              )}
            </div>
          </div>
          <Ring pct={pct} label="rempli" />
        </div>
      </Reveal>

      {/* KPI secondaires */}
      <Reveal i={1}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
          {[
            { k: "Panier moyen", v: fmtShort(avgBasket), c: C.text },
            { k: "Commandes", v: ev.buyers.length, c: C.blue },
            { k: "Net à recevoir", v: fmtShort(rev - commission), c: C.green },
          ].map((x) => (
            <div key={x.k} style={{ ...S.card, padding: 14, textAlign: "center" }}>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 17, color: x.c }}>{x.v}</div>
              <div style={{ fontSize: 9.5, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700, marginTop: 4 }}>
                {x.k}
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Lien de partage */}
      <Reveal i={2}>
        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={S.label}>Ton lien de vente</div>
          <div
            style={{
              background: C.surface2,
              border: `1px dashed ${C.amber}`,
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 14,
              wordBreak: "break-all",
              color: C.amber,
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            {link}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="tk-press" style={{ ...S.btnGhost, flex: 1 }} onClick={copy}>
              Copier
            </button>
            <a
              href={`https://wa.me/?text=${waText}`}
              target="_blank"
              rel="noreferrer"
              className="tk-press"
              style={{ ...S.btnGhost, flex: 1, textAlign: "center", textDecoration: "none", display: "block", boxSizing: "border-box" }}
            >
              WhatsApp
            </a>
          </div>
          <div style={{ color: C.muted, fontSize: 12.5, marginTop: 10 }}>
            Code d'accès manuel : <b style={{ color: C.text }}>{ev.code}</b>
          </div>
        </div>
      </Reveal>

      {/* Contrôle d'entrée */}
      <Reveal i={3}>
        <button
          onClick={onScan}
          className="tk-press"
          style={{ ...S.btn, background: `linear-gradient(90deg, ${C.amber}, ${C.pink})`, marginBottom: 14 }}
        >
          🛡️ Mode contrôle d'entrée — {usedCount}/{sold} entrés ({Math.round(scanPct)}%)
        </button>
      </Reveal>

      {/* Courbe des ventes */}
      {ev.buyers.length > 0 && (
        <Reveal i={4}>
          <div style={{ ...S.card, marginBottom: 14 }}>
            <div style={{ ...S.label, marginBottom: 14 }}>Ventes — 7 derniers jours</div>
            <SalesChart buyers={ev.buyers} />
          </div>
        </Reveal>
      )}

      {/* Répartition par catégorie */}
      <Reveal i={5}>
        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={{ ...S.label, marginBottom: 12 }}>Répartition par catégorie</div>
          <TierSplit ev={ev} />
        </div>
      </Reveal>

      {/* Acheteurs */}
      <Reveal i={6}>
        <div style={S.card}>
          <div style={S.label}>Acheteurs ({ev.buyers.length})</div>
          {ev.buyers.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13.5 }}>Pas encore de ventes. Partage ton lien pour lancer la machine !</div>
          ) : (
            ev.buyers
              .slice()
              .reverse()
              .map((b, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: i < ev.buyers.length - 1 ? `1px solid ${C.line}` : "none",
                    fontSize: 14,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{b.name}</div>
                    <div style={{ color: C.muted, fontSize: 12.5 }}>
                      {b.phone} · {b.operator}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: C.amber, fontWeight: 700 }}>
                      {b.qty} × {b.tierName}
                    </div>
                    <div style={{ color: C.muted, fontSize: 12.5 }}>{fmtFCFA(b.qty * b.unitPrice)}</div>
                  </div>
                </div>
              ))
          )}
        </div>
      </Reveal>
    </div>
  );
}

/* ============================ Scanner anti-fraude ============================ */
function Scanner({ ev, onBack, onMarkUsed }) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const usedCount = Object.keys(ev.used || {}).length;
  const sold = totalSold(ev);

  const findTicket = (id) => {
    for (const b of ev.buyers) {
      if (b.ids.includes(id)) return { holder: b.name, phone: b.phone, tierName: b.tierName };
    }
    return null;
  };

  const check = () => {
    const id = input.trim().toUpperCase();
    if (!id) return;
    setScanning(true);
    setResult(null);
    setTimeout(async () => {
      const ticket = findTicket(id);
      if (!ticket) setResult({ status: "fraud", id });
      else if (ev.used && ev.used[id]) setResult({ status: "used", id, ticket, usedAt: ev.used[id] });
      else {
        await onMarkUsed(id);
        setResult({ status: "valid", id, ticket });
      }
      setScanning(false);
    }, 900);
  };

  const reset = () => {
    setInput("");
    setResult(null);
  };

  const R = {
    valid: { bg: "rgba(61,220,132,.12)", border: C.green, icon: "✅", title: "BILLET VALIDE", color: C.green },
    used: { bg: "rgba(255,181,37,.12)", border: C.amber, icon: "⚠️", title: "DÉJÀ UTILISÉ", color: C.amber },
    fraud: { bg: "rgba(255,93,115,.14)", border: C.pink, icon: "🚫", title: "BILLET INCONNU — FRAUDE POSSIBLE", color: C.pink },
  };

  return (
    <div>
      <Top title="Contrôle d'entrée" onBack={onBack} />

      <Reveal i={0}>
        <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={S.label}>Entrées validées</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 20, color: C.green }}>
              {usedCount}
              <span style={{ color: C.muted, fontSize: 13 }}> / {sold} vendus</span>
            </div>
          </div>
          <Ring pct={sold ? (usedCount / sold) * 100 : 0} size={64} stroke={7} />
        </div>
      </Reveal>

      <Reveal i={1}>
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div
            aria-hidden
            style={{
              height: 120,
              borderRadius: 14,
              border: `2px dashed ${scanning ? C.amber : C.line}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
              position: "relative",
              overflow: "hidden",
              background: C.surface2,
              transition: "border-color .3s ease",
            }}
          >
            {scanning && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: 3,
                  background: C.amber,
                  boxShadow: `0 0 16px ${C.amber}`,
                  animation: "tk-scanline .9s ease-in-out infinite alternate",
                }}
              />
            )}
            <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "0 20px", whiteSpace: "pre-line" }}>
              {scanning ? "Analyse du billet…" : "📷 En production : scan caméra du QR code.\nIci, saisis le code du billet."}
            </div>
          </div>
          <label style={S.label}>Code du billet</label>
          <input
            style={{ ...S.input, textTransform: "uppercase" }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="TK-XXXX-XXXX"
            onKeyDown={(e) => e.key === "Enter" && check()}
          />
          <button
            className="tk-press"
            style={{ ...S.btn, opacity: input.trim() && !scanning ? 1 : 0.4 }}
            disabled={!input.trim() || scanning}
            onClick={check}
          >
            {scanning ? "Vérification…" : "Vérifier le billet"}
          </button>
        </div>
      </Reveal>

      {result && (
        <div
          key={result.id + result.status + Date.now()}
          style={{
            ...S.card,
            background: R[result.status].bg,
            border: `2px solid ${R[result.status].border}`,
            textAlign: "center",
            animation:
              result.status === "fraud"
                ? "tk-shake .45s cubic-bezier(.36,.07,.19,.97) both"
                : "tk-pop .4s cubic-bezier(.22,1,.36,1) both",
            ...(result.status === "valid" ? { animationName: "tk-pop, tk-pulse-green", animationDuration: ".4s, 1.6s", animationIterationCount: "1, 2" } : {}),
          }}
        >
          <div style={{ fontSize: 44, animation: "tk-pop .5s cubic-bezier(.22,1,.36,1) both", animationDelay: ".08s" }}>
            {R[result.status].icon}
          </div>
          <div
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontWeight: 900,
              fontSize: 17,
              color: R[result.status].color,
              margin: "10px 0 8px",
            }}
          >
            {R[result.status].title}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>{result.id}</div>

          {result.status === "valid" && (
            <div style={{ fontSize: 14.5, lineHeight: 1.7 }}>
              <b>{result.ticket.holder}</b> · {result.ticket.tierName}
              <br />
              <span style={{ color: C.green, fontWeight: 700 }}>Laisser entrer 👍</span>
            </div>
          )}
          {result.status === "used" && (
            <div style={{ fontSize: 14, lineHeight: 1.7 }}>
              Billet de <b>{result.ticket.holder}</b> ({result.ticket.tierName})<br />
              Déjà scanné à{" "}
              <b>{new Date(result.usedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</b>
              <br />
              <span style={{ color: C.amber, fontWeight: 700 }}>⚠️ Possible partage de billet — refuser l'entrée.</span>
            </div>
          )}
          {result.status === "fraud" && (
            <div style={{ fontSize: 14, lineHeight: 1.7 }}>
              Ce code n'existe pas dans les ventes de <b>{ev.name}</b>.<br />
              <span style={{ color: C.pink, fontWeight: 700 }}>🚫 Faux billet — refuser l'entrée.</span>
            </div>
          )}

          <button className="tk-press" style={{ ...S.btn, marginTop: 16 }} onClick={reset}>
            Scanner le suivant
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================ Client ============================ */
function ClientAccess({ events, onBack, onFound }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const tryOpen = () => {
    const clean = code.trim().toUpperCase().replace(/^HTTPS?:\/\/TIKE\.APP\/E\//, "");
    if (events[clean]) onFound(clean);
    else setErr("Aucun événement trouvé avec ce lien ou ce code. Vérifie auprès de l'organisateur.");
  };
  return (
    <div>
      <Top title="Ouvrir un événement" onBack={onBack} />
      <Reveal i={0}>
        <div style={{ ...S.card, animation: err ? "tk-shake .4s both" : "none" }}>
          <div style={{ color: C.muted, fontSize: 14, marginBottom: 14, lineHeight: 1.5 }}>
            Colle le lien reçu (WhatsApp, Facebook…) ou saisis le code de l'événement.
          </div>
          <label style={S.label}>Lien ou code</label>
          <input
            style={S.input}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setErr("");
            }}
            placeholder="https://tike.app/e/ABC123 ou ABC123"
            onKeyDown={(e) => e.key === "Enter" && tryOpen()}
          />
          {err && <div style={{ color: C.pink, fontSize: 13, marginBottom: 12 }}>{err}</div>}
          <button className="tk-press" style={S.btn} onClick={tryOpen}>
            Ouvrir l'événement
          </button>
        </div>
      </Reveal>
    </div>
  );
}

function ClientEvent({ ev, onBack, onBuy }) {
  const d = ev.date ? new Date(ev.date + "T" + (ev.time || "00:00")) : null;
  const dateStr = d ? d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ev.date;
  const anyLeft = ev.tiers.some((t) => t.capacity - tierSold(ev, t.id) > 0);

  return (
    <div>
      <Top title="Événement" onBack={onBack} />
      <Reveal i={0}>
        <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
          <div style={{ background: `linear-gradient(135deg, ${C.surface2}, #3A2E6E)`, padding: "26px 20px 22px" }}>
            <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: C.amber, fontWeight: 700 }}>Invitation</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 24, lineHeight: 1.15, margin: "8px 0 10px" }}>
              {ev.name}
            </div>
            <div style={{ color: C.text, fontSize: 14.5, lineHeight: 1.7 }}>
              📅 {dateStr} à {ev.time}
              <br />
              📍 {ev.venue}, {ev.city}
            </div>
          </div>
          <div style={{ padding: "20px 20px 22px" }}>
            <Perf />
            {ev.desc && <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, margin: "16px 0 4px" }}>{ev.desc}</div>}

            <div style={{ ...S.label, margin: "18px 0 10px" }}>Tarifs</div>
            {ev.tiers.map((t, i) => {
              const left = t.capacity - tierSold(ev, t.id);
              return (
                <div
                  key={t.id}
                  className="tk-reveal"
                  style={{
                    animationDelay: `${150 + i * 80}ms`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: `1px solid ${C.line}`,
                    fontSize: 14.5,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{t.name}</div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: C.amber, fontWeight: 700 }}>{fmtFCFA(t.price)}</div>
                    <div style={{ color: left <= 5 ? C.pink : C.muted, fontSize: 12 }}>
                      {left > 0 ? `${left} restante${left > 1 ? "s" : ""}` : "Épuisé"}
                    </div>
                  </div>
                </div>
              );
            })}

            <button className="tk-press" style={{ ...S.btn, marginTop: 18, opacity: anyLeft ? 1 : 0.4 }} disabled={!anyLeft} onClick={onBuy}>
              {anyLeft ? "Acheter mon billet" : "Complet"}
            </button>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

/* ============================ Paiement MoMo ============================ */
function Payment({ ev, onBack, onPaid }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [qty, setQty] = useState(1);
  const [op, setOp] = useState(null);
  const [tierId, setTierId] = useState(null);

  const tier = ev.tiers.find((t) => t.id === tierId) || null;
  const left = tier ? tier.capacity - tierSold(ev, tier.id) : 0;
  const total = tier ? qty * tier.price : 0;

  useEffect(() => {
    if (tier && qty > left) setQty(Math.max(1, left));
  }, [tierId]); // eslint-disable-line

  useEffect(() => {
    if (step === 3) {
      const t = setTimeout(() => onPaid({ buyerName: name, buyerPhone: phone, qty, operator: op, tier }), 2600);
      return () => clearTimeout(t);
    }
  }, [step]); // eslint-disable-line

  return (
    <div>
      <Top title="Paiement" onBack={step === 1 ? onBack : undefined} />

      {step === 1 && (
        <div className="tk-view" style={S.card}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>{ev.name}</div>

          <label style={S.label}>Catégorie</label>
          <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            {ev.tiers.map((t) => {
              const l = t.capacity - tierSold(ev, t.id);
              const sel = tierId === t.id;
              return (
                <button
                  key={t.id}
                  disabled={l <= 0}
                  onClick={() => setTierId(t.id)}
                  className="tk-press"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: sel ? `2px solid ${C.amber}` : `1px solid ${C.line}`,
                    background: sel ? "rgba(255,181,37,.08)" : C.surface2,
                    color: C.text,
                    cursor: l > 0 ? "pointer" : "not-allowed",
                    opacity: l > 0 ? 1 : 0.4,
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 14.5,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{t.name}</span>
                  <span style={{ color: C.amber, fontWeight: 700 }}>{fmtFCFA(t.price)}</span>
                </button>
              );
            })}
          </div>

          <label style={S.label}>Ton nom (sur le billet)</label>
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom complet" />
          <label style={S.label}>Numéro mobile money</label>
          <input style={S.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 XXX XX XX" inputMode="tel" />

          <label style={S.label}>Nombre de billets</label>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <button className="tk-press" style={{ ...S.btnGhost, width: 48 }} onClick={() => setQty(Math.max(1, qty - 1))}>
              −
            </button>
            <div key={qty} style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 20, minWidth: 30, textAlign: "center", animation: "tk-pop .3s both" }}>
              {qty}
            </div>
            <button className="tk-press" style={{ ...S.btnGhost, width: 48 }} onClick={() => setQty(tier ? Math.min(left, qty + 1) : qty + 1)}>
              +
            </button>
          </div>

          <label style={S.label}>Opérateur</label>
          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            {[
              { id: "MTN MoMo", bg: C.mtn, fg: "#111" },
              { id: "Airtel Money", bg: C.airtel, fg: "#fff" },
            ].map((o) => (
              <button
                key={o.id}
                onClick={() => setOp(o.id)}
                className="tk-press"
                style={{
                  flex: 1,
                  padding: "13px 10px",
                  borderRadius: 12,
                  border: op === o.id ? `2px solid ${C.amber}` : `1px solid ${C.line}`,
                  background: o.bg,
                  color: o.fg,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {o.id}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "12px 0",
              borderTop: `1px dashed ${C.line}`,
              marginBottom: 14,
              fontSize: 15,
            }}
          >
            <div style={{ color: C.muted }}>Total {tier ? `(${qty} × ${tier.name})` : ""}</div>
            <div key={total} style={{ fontWeight: 700, color: C.amber, animation: "tk-pop .3s both" }}>
              {tier ? fmtFCFA(total) : "—"}
            </div>
          </div>
          <button
            className="tk-press"
            style={{ ...S.btn, opacity: name && phone && op && tier ? 1 : 0.4 }}
            disabled={!name || !phone || !op || !tier}
            onClick={() => setStep(2)}
          >
            Payer {tier ? fmtFCFA(total) : ""}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="tk-view" style={{ ...S.card, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12, animation: "tk-float 2s ease-in-out infinite" }}>📲</div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 17, marginBottom: 10 }}>
            Confirme sur ton téléphone
          </div>
          <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
            Une demande de paiement <b style={{ color: C.text }}>{op}</b> de <b style={{ color: C.amber }}>{fmtFCFA(total)}</b> a été
            envoyée au <b style={{ color: C.text }}>{phone}</b>.<br />
            Compose ton code PIN pour valider.
          </div>
          <div style={{ background: C.surface2, borderRadius: 12, padding: 12, fontSize: 13, color: C.muted, marginBottom: 18 }}>
            💡 Démo : en production, cette étape passe par l'API {op} (demande USSD/push réelle).
          </div>
          <button className="tk-press" style={S.btn} onClick={() => setStep(3)}>
            J'ai validé sur mon téléphone
          </button>
          <button className="tk-press" style={{ ...S.btnGhost, marginTop: 10 }} onClick={() => setStep(1)}>
            Annuler
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="tk-view" style={{ ...S.card, textAlign: "center", padding: 40 }}>
          <div
            style={{
              width: 54,
              height: 54,
              margin: "0 auto 18px",
              border: `4px solid ${C.line}`,
              borderTopColor: C.amber,
              borderRadius: "50%",
              animation: "tk-spin 1s linear infinite",
            }}
          />
          <div style={{ fontWeight: 700, fontSize: 16 }}>Vérification du paiement…</div>
          <div style={{ color: C.muted, fontSize: 13.5, marginTop: 8 }}>Ne ferme pas cette page.</div>
        </div>
      )}
    </div>
  );
}

/* ============================ Mes billets ============================ */
function MyTickets({ tickets, onBack }) {
  const sorted = tickets.slice().sort((a, b) => b.ts - a.ts);
  return (
    <div>
      <Top title="Mes billets" onBack={onBack} />
      {sorted.length === 0 ? (
        <Reveal i={0}>
          <div style={{ ...S.card, textAlign: "center", color: C.muted }}>Aucun billet. Ouvre un lien d'événement pour en acheter.</div>
        </Reveal>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {sorted.map((t, idx) => (
            <Reveal key={t.id} i={idx}>
              <div className="tk-lift" style={{ ...S.card, padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "18px 20px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.amber, fontWeight: 700 }}>
                      Billet valide
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        background: "rgba(255,181,37,.14)",
                        border: `1px solid ${C.amber}`,
                        color: C.amber,
                        borderRadius: 999,
                        padding: "4px 10px",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      {t.tierName}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 17, margin: "8px 0 6px" }}>
                    {t.eventName}
                  </div>
                  <div style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6 }}>
                    {t.date} à {t.time} · {t.venue}, {t.city}
                    <br />
                    Titulaire : <b style={{ color: C.text }}>{t.buyerName}</b>
                  </div>
                </div>
                <Perf />
                <div style={{ padding: "16px 20px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
                      Code d'entrée
                    </div>
                    <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 15, color: C.amber, marginTop: 4 }}>
                      {t.id}
                    </div>
                  </div>
                  <div
                    aria-hidden
                    style={{
                      width: 62,
                      height: 62,
                      background: C.text,
                      borderRadius: 8,
                      padding: 6,
                      display: "grid",
                      gridTemplateColumns: "repeat(6, 1fr)",
                      gap: 2,
                      boxSizing: "border-box",
                    }}
                  >
                    {Array.from({ length: 36 }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          background: (t.id.charCodeAt(i % t.id.length) + i) % 3 === 0 ? C.bg : "transparent",
                          borderRadius: 1,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
