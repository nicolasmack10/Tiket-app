import React, { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import {
  fetchOrganizerEvents,
  fetchClientEvents,
  createEventDB,
  uploadPosterDB,
  addBuyerDB,
  markTicketUsedDB,
  withdrawFundsDB,
  openEventByCode,
  recordEventAccess,
  fetchAdminOverview,
  setSuspendedDB,
  adminDeleteAccountDB,
  adminDeleteEventDB,
  setCommissionOverrideDB,
  joinQueueDB,
  queuePositionDB,
  tryAdmitSelfDB,
  leaveQueueDB,
  fetchQueueCountDB,
  requestRefundDB,
  fetchRefundRequestsDB,
  fetchMyRefundRequestsDB,
  resolveRefundDB,
  getTicketSealDB,
  verifyTicketDB,
} from "./lib/db";
import {
  getSessionProfile,
  getSession,
  getProfile,
  signUp,
  signIn,
  signOut,
  signInWithGoogle,
  createProfileForCurrentUser,
  sendPasswordReset,
  updatePassword,
  onAuthEvent,
} from "./lib/auth";

/* ============================================================
   TIKÉ v4 — Billetterie par lien, paiement mobile money
   - Comptes organisateur / client (Supabase Auth), retrait de
     fonds en un clic, tableau de bord client (accès + billets)
   - Affiche d'événement, lien de partage réel (/e/:code)
   - Interface claire, responsive, QR codes réels par billet,
     téléchargement de billet, scan caméra, compte à rebours
   ============================================================ */

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;900&family=Space+Grotesk:wght@400;500;700&display=swap');
`;

/* ---------- Animations + mise en page responsive ---------- */
const ANIM_CSS = `
@keyframes tk-fade-up { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
@keyframes tk-view-in { from { opacity:0; transform:translateY(8px) scale(.995) } to { opacity:1; transform:none } }
@keyframes tk-pop { 0% { transform:scale(.82); opacity:0 } 60% { transform:scale(1.06) } 100% { transform:scale(1); opacity:1 } }
@keyframes tk-spin { to { transform:rotate(360deg) } }
@keyframes tk-scanline { from { top:6% } to { top:92% } }
@keyframes tk-pulse-green { 0%,100% { box-shadow:0 0 0 0 rgba(18,166,107,.45) } 50% { box-shadow:0 0 0 14px rgba(18,166,107,0) } }
@keyframes tk-shake { 10%,90% { transform:translateX(-2px) } 20%,80% { transform:translateX(4px) } 30%,50%,70% { transform:translateX(-7px) } 40%,60% { transform:translateX(7px) } }
@keyframes tk-toast-in { from { opacity:0; transform:translate(-50%, 18px) } to { opacity:1; transform:translate(-50%, 0) } }
@keyframes tk-shimmer { from { background-position:-320px 0 } to { background-position:320px 0 } }
@keyframes tk-bar-grow { from { transform:scaleY(0) } to { transform:scaleY(1) } }
@keyframes tk-float { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-6px) } }

.tk-view { animation: tk-view-in .32s cubic-bezier(.22,1,.36,1) both; }
.tk-reveal { animation: tk-fade-up .5s cubic-bezier(.22,1,.36,1) both; }
.tk-press { transition: transform .12s ease, border-color .2s ease, background .2s ease; }
.tk-press:active { transform: scale(.972); }
.tk-lift { transition: transform .2s cubic-bezier(.22,1,.36,1), border-color .2s ease, box-shadow .2s ease; }
.tk-lift:hover { transform: translateY(-3px); border-color: #D8CCF5 !important; box-shadow: 0 10px 24px rgba(28,21,51,.08); }
.tk-bar { transform-origin: bottom; animation: tk-bar-grow .6s cubic-bezier(.22,1,.36,1) both; }

.tk-shell { max-width: 460px; margin: 0 auto; padding: 0 18px 40px; box-sizing: border-box; }
@media (min-width: 640px) { .tk-shell { max-width: 600px; } }
@media (min-width: 960px) { .tk-shell { max-width: 900px; } }
@media (min-width: 1280px) { .tk-shell { max-width: 1180px; padding-top: 8px; } }
@media (min-width: 1600px) { .tk-shell { max-width: 1400px; } }

.tk-shell-narrow { max-width: 640px !important; }

.tk-kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
@media (max-width: 380px) { .tk-kpi-grid { grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); } }

.tk-list-grid { display: grid; gap: 12px; }
@media (min-width: 720px) { .tk-list-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); } }

.tk-home-grid { display: grid; gap: 14px; margin-top: 26px; }
@media (min-width: 520px) { .tk-home-grid { grid-template-columns: repeat(2, 1fr); } }

.tk-tutorial { width: 100%; max-width: 300px; margin: 4px 0 0 auto; }

.tk-ticket-visual {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 24px;
  overflow: hidden;
  background: #0E0B1E;
  -webkit-mask-image:
    radial-gradient(circle 16px at 0% 32%, transparent 99%, #000 100%),
    radial-gradient(circle 16px at 100% 32%, transparent 99%, #000 100%);
  -webkit-mask-composite: source-in;
  mask-image:
    radial-gradient(circle 16px at 0% 32%, transparent 99%, #000 100%),
    radial-gradient(circle 16px at 100% 32%, transparent 99%, #000 100%);
  mask-composite: intersect;
}
.tk-ticket-perf {
  position: absolute;
  left: 22px;
  right: 22px;
  top: 32%;
  border-top: 2px dashed rgba(245, 243, 252, 0.4);
}
.tk-ticket-panel {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: rgba(10, 10, 26, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 28px;
}

.tk-countdown { display: flex; gap: 8px; flex-wrap: wrap; }
.tk-countdown > div { flex: 1; min-width: 56px; }

@media (prefers-reduced-motion: reduce) {
  .tk-view, .tk-reveal, .tk-bar { animation: none !important; }
  .tk-press:active, .tk-lift:hover { transform: none !important; }
  * { animation-duration: .001ms !important; transition-duration: .001ms !important; }
}
`;

const C = {
  bg: "#F7F5FB",
  surface: "#FFFFFF",
  surface2: "#F1EEF9",
  line: "#E4DEF5",
  text: "#1C1533",
  muted: "#77708F",
  amber: "#FF7A1A",
  amberDark: "#1C1533",
  pink: "#FF3D68",
  green: "#12A66B",
  blue: "#3366F0",
  mtn: "#FFCB05",
  airtel: "#ED1C24",
};

const HERO_GRADIENT = `linear-gradient(140deg, ${C.amber}, ${C.pink})`;

// Palette du billet électronique : intentionnellement sombre (contrairement au
// thème clair du reste de l'app) pour lire comme une vraie carte/pass, quel
// que soit le visuel de l'événement affiché derrière.
const TK = {
  bg: "#0E0B1E",
  text: "#F5F3FC",
  muted: "#C8C4E1",
  amber: "#FFBE3C",
  pink: "#FF5D73",
  green: "#50E696",
};

const TIER_COLORS = [C.amber, C.pink, C.blue, C.green, "#8B5CF6"];

const fmtFCFA = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA";
const fmtShort = (n) =>
  n >= 1000000 ? (n / 1000000).toFixed(1).replace(".0", "") + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(n);

const genCode = (len = 6) => {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

// Préfixe des billets : 3 premières lettres du nom de l'événement (accents
// retirés, complété par des X si le nom est trop court) — le code aléatoire
// qui suit garantit l'unicité au sein de l'événement.
const ticketPrefix = (name) => {
  const letters = (name || "")
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return (letters + "XXX").slice(0, 3);
};

const fmtDateTime = (ts) =>
  new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const codeFromPath = () => {
  const m = window.location.pathname.match(/^\/e\/([A-Za-z0-9]+)/);
  return m ? m[1].toUpperCase() : null;
};

// Lien de vérification scanné à l'entrée : /v/{ticketId}?s={signature}
const verifyParamsFromPath = () => {
  const m = window.location.pathname.match(/^\/v\/([A-Za-z0-9-]+)/);
  if (!m) return null;
  const signature = new URLSearchParams(window.location.search).get("s") || "";
  return { ticketId: m[1].toUpperCase(), signature };
};

// Pages tableau de bord / listes : profitent d'un conteneur pleine largeur sur
// grand écran. Le reste (formulaires, détails) reste centré et lisible.
const WIDE_VIEWS = new Set([
  "home",
  "cDash",
  "clientDash",
  "adminDash",
  "adminOrganizers",
  "adminClients",
  "adminEvents",
  "adminFinance",
]);

const activeBuyers = (ev) => ev.buyers.filter((b) => !b.cancelled);
const tierSold = (ev, tierId) => activeBuyers(ev).filter((b) => b.tierId === tierId).reduce((s, b) => s + b.qty, 0);
const totalSold = (ev) => activeBuyers(ev).reduce((s, b) => s + b.qty, 0);
const totalCap = (ev) => ev.tiers.reduce((s, t) => s + t.capacity, 0);
const revenue = (ev) => activeBuyers(ev).reduce((s, b) => s + b.qty * b.unitPrice, 0);
// Commission variable selon le prix du billet : 0–5000 FCFA = 10%, 5001+ FCFA = 20%.
const commissionRate = (unitPrice) => (unitPrice <= 5000 ? 0.1 : 0.2);
const commissionAmount = (ev) =>
  ev.commissionOverride != null
    ? revenue(ev) * ev.commissionOverride
    : activeBuyers(ev).reduce((s, b) => s + b.qty * b.unitPrice * commissionRate(b.unitPrice), 0);
const netRevenue = (ev) => revenue(ev) - commissionAmount(ev);
const withdrawnTotal = (ev) => (ev.withdrawals || []).reduce((s, w) => s + w.amount, 0);
const availableFunds = (ev) => netRevenue(ev) - withdrawnTotal(ev);

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

function useCountdown(targetMs) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, targetMs - now);
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
    done: diff <= 0,
  };
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

function LogoutButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="tk-press"
      style={{
        background: "transparent",
        border: `1px solid ${C.line}`,
        color: C.muted,
        borderRadius: 10,
        padding: "8px 12px",
        fontSize: 12.5,
        cursor: "pointer",
        fontFamily: "'Space Grotesk', sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      Déconnexion
    </button>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,21,51,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        zIndex: 100,
        animation: "tk-fade-up .2s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...S.card, width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto", animation: "tk-pop .25s cubic-bezier(.22,1,.36,1) both" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 16 }}>{title}</div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="tk-press"
            style={{ background: "transparent", border: "none", fontSize: 22, lineHeight: 1, cursor: "pointer", color: C.muted, padding: 4 }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
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

/* ---------- Compte à rebours jusqu'à l'événement ---------- */
function Countdown({ target }) {
  const { d, h, m, s, done } = useCountdown(target);
  if (done) {
    return <div style={{ fontWeight: 700, color: "#FFFFFF", fontSize: 14 }}>🎉 L'événement a commencé</div>;
  }
  const cells = [
    { v: d, l: "jours" },
    { v: h, l: "heures" },
    { v: m, l: "min" },
    { v: s, l: "sec" },
  ];
  return (
    <div className="tk-countdown">
      {cells.map((c) => (
        <div
          key={c.l}
          style={{
            textAlign: "center",
            background: "rgba(255,255,255,.18)",
            borderRadius: 10,
            padding: "8px 4px",
          }}
        >
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 18, color: "#FFFFFF" }}>
            {String(c.v).padStart(2, "0")}
          </div>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, color: "rgba(255,255,255,.85)" }}>{c.l}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- QR code réel (un par billet) ---------- */
function TicketQR({ value, size = 64 }) {
  const [dataUrl, setDataUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size * 6, margin: 1, errorCorrectionLevel: "H", color: { dark: "#1C1533", light: "#FFFFFF" } })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [value, size]);
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#FFFFFF",
        borderRadius: 8,
        border: `1px solid ${C.line}`,
        padding: 5,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {dataUrl ? (
        <img src={dataUrl} alt="QR code du billet" width={size - 12} height={size - 12} style={{ display: "block" }} />
      ) : (
        <div style={{ width: size - 12, height: size - 12, background: C.surface2, borderRadius: 4 }} />
      )}
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

/* ---------- Carte billet (téléchargeable, QR réel) ---------- */
function TicketCard({ t, i = 0, muted = false, refundStatus, onRequestRefund }) {
  const cardRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [seal, setSeal] = useState(null);
  const [sealErr, setSealErr] = useState(false);

  // Le lien signé (HMAC) + le sceau court sont générés côté serveur, à la
  // demande, plutôt que stockés : voir get_ticket_seal.
  useEffect(() => {
    let cancelled = false;
    setSeal(null);
    setSealErr(false);
    getTicketSealDB(t.id)
      .then((s) => {
        if (!cancelled) setSeal(s);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setSealErr(true);
      });
    return () => {
      cancelled = true;
    };
  }, [t.id]);

  const download = async () => {
    if (!cardRef.current || downloading) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: TK.bg, cacheBust: true });
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });
      const pdf = new jsPDF({ unit: "px", format: [img.width, img.height] });
      pdf.addImage(dataUrl, "PNG", 0, 0, img.width, img.height);
      pdf.save(`tike-${t.id}.pdf`);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloading(false);
    }
  };

  const requestRefund = async () => {
    setRequesting(true);
    await onRequestRefund();
    setRequesting(false);
  };

  const isFree = t.unitPrice === 0;
  const d = t.date ? new Date(`${t.date}T00:00:00`) : null;
  let dateLabel = "";
  if (d) {
    dateLabel = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    dateLabel = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
    if (t.time) dateLabel += ` · ${t.time.replace(":", "h")}`;
  }

  const labelStyle = {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: TK.muted,
    textShadow: "0 1px 3px rgba(0,0,0,.6)",
  };
  const valueStyle = { fontSize: 13, fontWeight: 700, color: TK.text, marginTop: 3, textShadow: "0 1px 3px rgba(0,0,0,.6)" };

  return (
    <Reveal i={i}>
      <div style={{ borderRadius: 24, overflow: "hidden", boxShadow: "0 14px 34px rgba(28,21,51,.16)", opacity: muted || t.cancelled ? 0.6 : 1 }}>
        {/* Visuel du billet — c'est ce qui est exporté en PDF/image */}
        <div ref={cardRef} className="tk-ticket-visual">
          {t.posterUrl ? (
            <img
              crossOrigin="anonymous"
              src={t.posterUrl}
              alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }}
            />
          ) : (
            <div style={{ position: "absolute", inset: 0, background: HERO_GRADIENT }} />
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to bottom, rgba(10,10,26,0) 0%, rgba(10,10,26,.12) 12%, rgba(10,10,26,.42) 45%, rgba(10,10,26,.82) 100%)",
            }}
          />

          {/* Zone haute : logo + badge catégorie */}
          <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 18px 0" }}>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 20, color: TK.amber, textShadow: "0 2px 8px rgba(0,0,0,.55)" }}>
              TIKÉ<span style={{ color: TK.pink }}>.</span>
            </div>
            {isFree ? (
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: TK.green,
                  background: "rgba(80,230,150,.16)",
                  border: `1px solid ${TK.green}`,
                  borderRadius: 999,
                  padding: "5px 10px",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Entrée libre
              </div>
            ) : (
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: TK.amber,
                  background: "rgba(255,190,60,.16)",
                  border: `1px solid ${TK.amber}`,
                  borderRadius: 999,
                  padding: "5px 10px",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {t.tierName}
              </div>
            )}
          </div>

          <div className="tk-ticket-perf" />

          {/* Panneau verre dépoli */}
          <div className="tk-ticket-panel" style={{ position: "absolute", left: 20, right: 20, bottom: 20, top: "36%", padding: "18px 18px 16px", overflowY: "auto" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: TK.amber, textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>
              {isFree ? "Laissez-passer" : "Billet"}
              {t.cancelled && <span style={{ color: TK.pink }}> · Annulé</span>}
              {!t.cancelled && t.usedAt && <span style={{ color: TK.muted }}> · Déjà scanné</span>}
            </div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: 18, color: TK.text, marginTop: 6, lineHeight: 1.25, textShadow: "0 1px 4px rgba(0,0,0,.6)" }}>
              {t.eventName}
            </div>
            <div style={{ fontSize: 12, color: TK.muted, marginTop: 4, textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>
              {t.buyerName && (
                <>
                  Titulaire : <b style={{ color: TK.text }}>{t.buyerName}</b>
                  {t.rank != null && " · "}
                </>
              )}
              {t.rank != null && <>N°{t.rank}</>}
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={labelStyle}>Date &amp; heure</div>
              <div style={valueStyle}>{dateLabel}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
              <div>
                <div style={labelStyle}>Lieu</div>
                <div style={valueStyle}>
                  {t.venue}
                  {t.city ? `, ${t.city}` : ""}
                </div>
              </div>
              <div>
                <div style={labelStyle}>Prix</div>
                <div style={{ ...valueStyle, color: TK.amber }}>{isFree ? "Entrée libre" : fmtFCFA(t.unitPrice)}</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", margin: "18px 0 12px" }}>
              {seal ? (
                <TicketQR value={seal.qrUrl} size={168} />
              ) : sealErr ? (
                <div
                  style={{
                    width: 168,
                    height: 168,
                    borderRadius: 12,
                    background: "rgba(255,255,255,.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 12,
                    textAlign: "center",
                    fontSize: 11,
                    color: TK.muted,
                  }}
                >
                  QR indisponible — réessaie plus tard
                </div>
              ) : (
                <div style={{ width: 168, height: 168, borderRadius: 12, background: "#FFFFFF", opacity: 0.5 }} />
              )}
            </div>

            <div
              style={{
                textAlign: "center",
                fontFamily: "'Space Grotesk', monospace",
                fontWeight: 700,
                fontSize: 14,
                color: TK.amber,
                letterSpacing: 1,
                textShadow: "0 1px 3px rgba(0,0,0,.6)",
              }}
            >
              {t.id}
            </div>

            {t.usedAt ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginTop: 12,
                  padding: "7px 12px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,.08)",
                  border: `1px solid ${TK.muted}`,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: TK.muted,
                  flexWrap: "wrap",
                  textAlign: "center",
                }}
              >
                ✅ Utilisé le {fmtDateTime(t.usedAt)}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginTop: 12,
                  padding: "7px 12px",
                  borderRadius: 999,
                  background: "rgba(80,230,150,.12)",
                  border: `1px solid ${TK.green}`,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: TK.green,
                  flexWrap: "wrap",
                  textAlign: "center",
                }}
              >
                🛡 VÉRIFIÉ {seal ? `HMAC · ${seal.sealShort}` : "…"}
              </div>
            )}
          </div>
        </div>

        {/* Actions (hors export) */}
        <div style={{ background: C.surface }}>
          {t.momoNumber && (
            <div style={{ padding: "10px 18px", fontSize: 12, color: C.muted, borderTop: `1px solid ${C.line}` }}>
              Organisateur : <b style={{ color: C.text }}>{t.momoNumber}</b>
            </div>
          )}
          <button
            onClick={download}
            disabled={downloading}
            className="tk-press"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: C.surface2,
              border: "none",
              borderTop: `1px solid ${C.line}`,
              color: C.text,
              padding: "12px 18px",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {downloading ? "Préparation…" : "⬇ Télécharger le billet (PDF)"}
          </button>
          {!muted && !t.cancelled && onRequestRefund && (
            <>
              {refundStatus === "pending" ? (
                <div
                  style={{
                    padding: "10px 18px",
                    fontSize: 12.5,
                    color: C.muted,
                    textAlign: "center",
                    borderTop: `1px solid ${C.line}`,
                  }}
                >
                  Demande de remboursement en cours de traitement
                </div>
              ) : (
                <button
                  onClick={requestRefund}
                  disabled={requesting}
                  className="tk-press"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: "transparent",
                    border: "none",
                    borderTop: `1px solid ${C.line}`,
                    color: C.pink,
                    padding: "12px 18px",
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  {requesting ? "…" : refundStatus === "rejected" ? "Demande refusée — réessayer" : "Demander un remboursement"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </Reveal>
  );
}

/* ============================ App ============================ */
export default function TikeApp() {
  const [view, setView] = useState("home");
  const [profile, setProfile] = useState(null);
  const [pendingRole, setPendingRole] = useState("organizer");
  const [events, setEvents] = useState({});
  const [adminData, setAdminData] = useState(null);
  const [activeCode, setActiveCode] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchaseWarning, setPurchaseWarning] = useState(false);
  const [verifyParams] = useState(verifyParamsFromPath);

  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const loadOrganizerEvents = useCallback(async (userId) => {
    try {
      const fetched = await fetchOrganizerEvents(userId);
      setEvents(fetched);
      return fetched;
    } catch (e) {
      console.error(e);
      notify("Impossible de charger tes événements.");
      return {};
    }
  }, []);

  // Recharge un seul événement (ex. en ouvrant sa page, ou pendant un scan) :
  // le tableau de bord n'est chargé qu'une fois à la connexion, donc sans ça
  // les billets achetés après coup par des clients ne seraient jamais vus.
  const refreshEvent = useCallback(async (code) => {
    try {
      const fresh = await openEventByCode(code);
      if (fresh) setEvents((prev) => ({ ...prev, [code]: fresh }));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadClientEvents = useCallback(async (userId) => {
    try {
      setEvents(await fetchClientEvents(userId));
    } catch (e) {
      console.error(e);
      notify("Impossible de charger tes événements.");
    }
  }, []);

  const loadAdminData = useCallback(async () => {
    try {
      const fetched = await fetchAdminOverview();
      setAdminData(fetched);
      return fetched;
    } catch (e) {
      console.error(e);
      notify("Impossible de charger les données admin.");
      return null;
    }
  }, []);

  // Ouvre l'événement pointé par un lien /e/CODE partagé, et l'ajoute aux
  // événements du client connecté pour qu'il le retrouve la prochaine fois.
  const openSharedEvent = useCallback(async (userId, code) => {
    try {
      const found = await openEventByCode(code);
      if (!found) {
        notify("Lien invalide ou événement introuvable.");
        return false;
      }
      await recordEventAccess(userId, code);
      setEvents((prev) => ({ ...prev, [code]: found }));
      setActiveCode(code);
      setView("kEvent");
      return true;
    } catch (e) {
      console.error(e);
      notify("Impossible d'ouvrir cet événement.");
      return false;
    }
  }, []); // eslint-disable-line

  const [pendingUser, setPendingUser] = useState(null);
  const pendingCode = useRef(codeFromPath());

  const routeAfterAuth = useCallback(
    async (p) => {
      setProfile(p);
      setPendingUser(null);
      const code = pendingCode.current;
      pendingCode.current = null;
      if (p.role === "organizer") {
        const orgEvents = await loadOrganizerEvents(p.id);
        if (code && orgEvents[code]) {
          setActiveCode(code);
          setView("cEvent");
        } else {
          if (code) notify("Ce lien pointe vers un événement que tu ne gères pas — connecte-toi avec un compte client pour l'ouvrir.");
          setView("cDash");
        }
      } else if (p.role === "admin") {
        const admin = await loadAdminData();
        const adminMatch = code && admin && admin.events.find((e) => e.code === code);
        if (adminMatch) {
          setActiveCode(code);
          setView("adminEventDetail");
        } else {
          setView("adminDash");
        }
      } else {
        await loadClientEvents(p.id);
        if (!code || !(await openSharedEvent(p.id, code))) setView("clientDash");
      }
    },
    [loadOrganizerEvents, loadAdminData, loadClientEvents, openSharedEvent]
  );

  // Un lien de réinitialisation de mot de passe redirige ici avec
  // #type=recovery dans l'URL : on doit montrer l'écran "nouveau mot de
  // passe" en priorité, avant tout routage normal basé sur la session.
  useEffect(() => {
    // Lien de contrôle à l'entrée (/v/{ticketId}?s=...) : passe avant tout,
    // ne nécessite aucune session — c'est la signature qui fait foi.
    if (verifyParams) {
      setView("verifyTicket");
      setLoading(false);
      return;
    }
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setView("resetPassword");
      setLoading(false);
      return;
    }
    (async () => {
      if (pendingCode.current) window.history.replaceState({}, "", "/");
      const session = await getSession();
      if (session) {
        let p = null;
        try {
          p = await getProfile(session.user.id);
        } catch {
          p = null;
        }
        if (p) {
          let expectedRole = null;
          try {
            expectedRole = localStorage.getItem("tike:pending-role");
            localStorage.removeItem("tike:pending-role");
          } catch {}
          if (expectedRole && p.role !== expectedRole && p.role !== "admin") {
            await signOut();
            notify(
              expectedRole === "organizer"
                ? "Ce compte est enregistré comme client. Utilise la carte « Je suis client » pour te connecter."
                : "Ce compte est enregistré comme organisateur. Utilise la carte « Je suis organisateur » pour te connecter."
            );
            setPendingRole(expectedRole);
            setView("auth");
          } else {
            await routeAfterAuth(p);
          }
        } else {
          // Session valide mais pas de profil applicatif : première connexion Google.
          setPendingUser({
            id: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || "",
          });
          setView("completeProfile");
        }
      } else if (pendingCode.current) {
        setPendingRole("client");
        setView("auth");
      }
      setLoading(false);
    })();
  }, []); // eslint-disable-line

  // Filet de sécurité : si un événement de récupération de mot de passe
  // survient pendant que l'app tourne déjà.
  useEffect(() => onAuthEvent((event) => {
    if (event === "PASSWORD_RECOVERY") setView("resetPassword");
  }), []);

  const handleAuthDone = routeAfterAuth;

  const handleLogout = async () => {
    await signOut();
    setProfile(null);
    setEvents({});
    setAdminData(null);
    setActiveCode(null);
    setView("home");
  };

  // Déconnexion automatique après 1h sans interaction. On compare des
  // horodatages réels (plutôt qu'un setTimeout brut) car un setTimeout de
  // longue durée ne s'écoule pas pendant que l'ordinateur est en veille —
  // il fallait littéralement laisser l'onglet actif sans interruption pour
  // que l'ancienne version se déclenche, ce qui explique qu'elle ne se soit
  // (quasi) jamais déclenchée en usage réel.
  useEffect(() => {
    if (!profile) return;
    const LIMIT_MS = 60 * 60 * 1000;
    const KEY = "tike:last-activity";
    let loggedOut = false;

    const mark = () => {
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {}
    };
    mark();

    const checkNow = () => {
      if (loggedOut) return;
      let last = Date.now();
      try {
        last = Number(localStorage.getItem(KEY)) || Date.now();
      } catch {}
      if (Date.now() - last >= LIMIT_MS) {
        loggedOut = true;
        handleLogout();
        notify("Déconnecté après 1h d'inactivité.");
      }
    };

    const events = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    document.addEventListener("visibilitychange", checkNow);
    const interval = setInterval(checkNow, 60000);
    return () => {
      clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, mark));
      document.removeEventListener("visibilitychange", checkNow);
    };
  }, [profile]); // eslint-disable-line

  const ev = activeCode ? events[activeCode] : null;
  const adminEv = activeCode && adminData ? adminData.events.find((e) => e.code === activeCode) : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(1200px 600px at 80% -10%, #FDE7D6 0%, ${C.bg} 55%)`,
        color: C.text,
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <style>{FONT_CSS}</style>
      <style>{ANIM_CSS}</style>
      <div className={`tk-shell ${WIDE_VIEWS.has(view) ? "" : "tk-shell-narrow"}`}>
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
            {view === "home" && (
              <Home
                onPickRole={(role) => {
                  setPendingRole(role);
                  setView("auth");
                }}
                onNav={setView}
              />
            )}
            {view === "auth" && (
              <Auth
                role={pendingRole}
                onBack={() => setView("home")}
                onDone={handleAuthDone}
                onForgotPassword={() => setView("forgotPassword")}
                onViewTerms={() => setView("organizerTerms")}
              />
            )}
            {view === "forgotPassword" && <ForgotPassword onBack={() => setView("auth")} />}
            {view === "resetPassword" && (
              <ResetPassword
                onDone={async (p) => {
                  if (p) await routeAfterAuth(p);
                  else setView("home");
                }}
              />
            )}
            {view === "completeProfile" && pendingUser && (
              <CompleteProfile pendingUser={pendingUser} onDone={routeAfterAuth} />
            )}
            {view === "verifyTicket" && verifyParams && <VerifyTicket ticketId={verifyParams.ticketId} signature={verifyParams.signature} />}
            {view === "faq" && <FAQ onBack={() => setView("home")} />}
            {view === "about" && <About onBack={() => setView("home")} />}
            {view === "contact" && <Contact onBack={() => setView("home")} />}
            {view === "organizerTerms" && <OrganizerTerms onBack={() => setView("auth")} />}

            {view === "cDash" && profile && (
              <CreatorDash
                profile={profile}
                events={events}
                onLogout={handleLogout}
                onNew={() => setView("cNew")}
                onOpen={(code) => {
                  setActiveCode(code);
                  setView("cEvent");
                  refreshEvent(code);
                }}
              />
            )}
            {view === "cNew" && (
              <NewEvent
                profile={profile}
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
              <CreatorEvent
                ev={ev}
                onBack={() => setView("cDash")}
                onScan={() => {
                  setView("cScan");
                  refreshEvent(ev.code);
                }}
                notify={notify}
                onWithdraw={async (amount, phone, reason) => {
                  const actual = await withdrawFundsDB(ev.code, amount, phone, reason);
                  setEvents((prev) => ({
                    ...prev,
                    [ev.code]: {
                      ...prev[ev.code],
                      withdrawals: [...prev[ev.code].withdrawals, { amount: actual, phone, reason, ts: Date.now() }],
                    },
                  }));
                  notify("Fonds retirés !");
                  return actual;
                }}
              />
            )}
            {view === "cScan" && ev && (
              <Scanner
                ev={ev}
                onBack={() => setView("cEvent")}
                onRefresh={() => refreshEvent(ev.code)}
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

            {view === "adminDash" && profile && adminData && (
              <AdminOverview profile={profile} data={adminData} onLogout={handleLogout} onNav={setView} notify={notify} />
            )}
            {view === "adminOrganizers" && adminData && (
              <AdminOrganizers
                data={adminData}
                onBack={() => setView("adminDash")}
                onSuspend={async (userId, suspended) => {
                  try {
                    await setSuspendedDB(userId, suspended);
                  } catch (err) {
                    console.error(err);
                    notify("Échec de la mise à jour du compte.");
                    return;
                  }
                  setAdminData((prev) => ({
                    ...prev,
                    profiles: prev.profiles.map((p) => (p.id === userId ? { ...p, suspended } : p)),
                  }));
                }}
                onDeleteAccount={async (userId) => {
                  try {
                    await adminDeleteAccountDB(userId);
                  } catch (err) {
                    console.error(err);
                    notify("Échec de la suppression du compte.");
                    return;
                  }
                  setAdminData((prev) => ({ ...prev, profiles: prev.profiles.filter((p) => p.id !== userId) }));
                  notify("Compte supprimé.");
                }}
              />
            )}
            {view === "adminClients" && adminData && (
              <AdminClients
                data={adminData}
                onBack={() => setView("adminDash")}
                onSuspend={async (userId, suspended) => {
                  try {
                    await setSuspendedDB(userId, suspended);
                  } catch (err) {
                    console.error(err);
                    notify("Échec de la mise à jour du compte.");
                    return;
                  }
                  setAdminData((prev) => ({
                    ...prev,
                    profiles: prev.profiles.map((p) => (p.id === userId ? { ...p, suspended } : p)),
                  }));
                }}
                onDeleteAccount={async (userId) => {
                  try {
                    await adminDeleteAccountDB(userId);
                  } catch (err) {
                    console.error(err);
                    notify("Échec de la suppression du compte.");
                    return;
                  }
                  setAdminData((prev) => ({ ...prev, profiles: prev.profiles.filter((p) => p.id !== userId) }));
                  notify("Compte supprimé.");
                }}
              />
            )}
            {view === "adminEvents" && adminData && (
              <AdminEvents
                data={adminData}
                onBack={() => setView("adminDash")}
                onOpen={(code) => {
                  setActiveCode(code);
                  setView("adminEventDetail");
                }}
              />
            )}
            {view === "adminFinance" && adminData && (
              <AdminFinance
                data={adminData}
                onBack={() => setView("adminDash")}
                notify={notify}
                onOpenEvent={(code) => {
                  setActiveCode(code);
                  setView("adminEventDetail");
                }}
              />
            )}
            {view === "adminEventDetail" && adminData && adminEv && (
              <AdminEventDetail
                ev={adminEv}
                onBack={() => setView("adminEvents")}
                notify={notify}
                onSetCommission={async (code, pct) => {
                  await setCommissionOverrideDB(code, pct);
                  setAdminData((prev) => ({
                    ...prev,
                    events: prev.events.map((e) => (e.code === code ? { ...e, commissionOverride: pct } : e)),
                  }));
                }}
                onDeleteEvent={async (code) => {
                  try {
                    await adminDeleteEventDB(code);
                  } catch (err) {
                    console.error(err);
                    notify("Échec de la suppression de l'événement.");
                    return;
                  }
                  setAdminData((prev) => ({ ...prev, events: prev.events.filter((e) => e.code !== code) }));
                  notify("Événement supprimé.");
                  setView("adminEvents");
                }}
              />
            )}

            {view === "clientDash" && profile && (
              <ClientDash
                profile={profile}
                events={events}
                onLogout={handleLogout}
                onOpenEvent={(code) => {
                  setActiveCode(code);
                  setView("kEvent");
                }}
                onOpenedNew={(code, e) => setEvents((prev) => ({ ...prev, [code]: e }))}
                notify={notify}
              />
            )}
            {view === "kEvent" && ev && (
              <ClientEvent ev={ev} onBack={() => setView("clientDash")} onBuy={() => setView(ev.queueEnabled ? "kQueue" : "kPay")} />
            )}
            {view === "kQueue" && ev && profile && (
              <Queue ev={ev} profile={profile} onAdmitted={() => setView("kPay")} onBack={() => setView("kEvent")} notify={notify} />
            )}
            {view === "kPay" && ev && profile && (
              <Payment
                ev={ev}
                profile={profile}
                onBack={() => setView("kEvent")}
                onPaid={async ({ buyerName, buyerPhone, qty, operator, tier }) => {
                  // Le prix est revalidé et les ID de billets sont générés côté
                  // serveur (voir record_purchase) : rien n'est fait confiance ici.
                  const buyer = {
                    name: buyerName,
                    phone: buyerPhone,
                    qty,
                    operator,
                    tierId: tier.id,
                    unitPrice: tier.price,
                    ts: Date.now(),
                  };
                  try {
                    await addBuyerDB(ev.code, profile.id, buyer);
                  } catch (err) {
                    console.error(err);
                    notify("Échec de l'enregistrement du paiement — réessaie.");
                    return;
                  }
                  await loadClientEvents(profile.id);
                  setView("clientDash");
                  notify("Paiement confirmé — billets reçus 🎟️");
                  setPurchaseWarning(true);
                }}
              />
            )}
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
            color: "#FFFFFF",
            fontWeight: 700,
            padding: "12px 20px",
            borderRadius: 999,
            fontSize: 14,
            boxShadow: "0 8px 30px rgba(28,21,51,.25)",
            zIndex: 50,
            maxWidth: "90%",
            animation: "tk-toast-in .35s cubic-bezier(.22,1,.36,1) both",
          }}
        >
          {toast}
        </div>
      )}
      {purchaseWarning && (
        <Modal title="⚠️ Ne partage jamais ton code" onClose={() => setPurchaseWarning(false)}>
          <div style={{ color: C.text, fontSize: 14.5, lineHeight: 1.7, marginBottom: 18 }}>
            Chaque billet n'est scanné <b>qu'une seule fois</b> à l'entrée. Si tu partages ton QR code ou ton
            numéro de billet avec quelqu'un d'autre, il pourra l'utiliser à ta place — et tu n'auras plus accès à
            l'événement.
            <br />
            <br />
            Garde ton billet uniquement pour toi jusqu'au jour J.
          </div>
          <button className="tk-press" style={S.btn} onClick={() => setPurchaseWarning(false)}>
            J'ai compris
          </button>
        </Modal>
      )}
    </div>
  );
}

/* ============================ Accueil ============================ */
function Home({ onPickRole, onNav }) {
  return (
    <div style={{ minHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column" }}>
      <Reveal i={0}>
        <div
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: 40,
            lineHeight: 1,
            letterSpacing: -1,
            padding: "44px 0 0",
          }}
        >
          TIKÉ
          <span style={{ color: C.amber, display: "inline-block", animation: "tk-float 2.6s ease-in-out infinite" }}>.</span>
        </div>
      </Reveal>

      <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", flex: 1 }}>
        <Reveal i={0}>
          <div style={{ color: C.muted, marginTop: 10, padding: "0 0 8px", fontSize: 15, lineHeight: 1.5 }}>
            Crée ton événement, partage le lien, encaisse par mobile money. Pas de vitrine publique — ton lien, ton
            public.
          </div>
        </Reveal>

        <div className="tk-home-grid">
          <Reveal i={1}>
            <button
              onClick={() => onPickRole("organizer")}
              className="tk-press tk-lift"
              style={{ ...S.card, textAlign: "left", cursor: "pointer", color: C.text, width: "100%" }}
            >
              <div style={{ fontSize: 26 }}>🎤</div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 16, margin: "8px 0 4px" }}>
                Je suis organisateur
              </div>
              <div style={{ color: C.muted, fontSize: 13.5 }}>Créer un événement et vendre des billets</div>
            </button>
          </Reveal>

          <Reveal i={2}>
            <button
              onClick={() => onPickRole("client")}
              className="tk-press tk-lift"
              style={{ ...S.card, textAlign: "left", cursor: "pointer", color: C.text, width: "100%" }}
            >
              <div style={{ fontSize: 26 }}>🎟️</div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 16, margin: "8px 0 4px" }}>Je suis client</div>
              <div style={{ color: C.muted, fontSize: 13.5 }}>Ouvrir un événement et retrouver mes billets</div>
            </button>
          </Reveal>
        </div>

        <Reveal i={2.5}>
          <TutorialCorner />
        </Reveal>

        <Reveal i={3} style={{ marginTop: "auto" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 18, paddingTop: 34, flexWrap: "wrap" }}>
            {[
              { id: "faq", label: "FAQ" },
              { id: "about", label: "À propos" },
              { id: "contact", label: "Nous contacter" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => onNav(p.id)}
                className="tk-press"
                style={{
                  background: "none",
                  border: "none",
                  color: C.muted,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/* ---------- Diaporama tuto (coin de l'écran) ---------- */
const TUTORIAL_SLIDES = [
  { icon: "🎤", title: "Crée ton événement", text: "Nom, date, lieu, catégories de billets et affiche — prêt en 2 minutes." },
  { icon: "🔗", title: "Partage ton lien", text: "Un lien unique à envoyer sur WhatsApp ou Facebook. Pas de vitrine publique." },
  { icon: "📲", title: "Encaisse par mobile money", text: "Tes invités payent directement par MTN MoMo ou Airtel Money." },
  { icon: "🎟️", title: "Billets avec QR unique", text: "Chaque billet a un QR code, un numéro N° et est vérifiable à l'entrée." },
  { icon: "🛡️", title: "Contrôle d'entrée live", text: "Scanne les billets à la caméra le jour J — fraude et doublons détectés." },
];

function TutorialCorner() {
  const [i, setI] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("tike:tuto-dismissed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (dismissed) return;
    const id = setInterval(() => setI((v) => (v + 1) % TUTORIAL_SLIDES.length), 4200);
    return () => clearInterval(id);
  }, [dismissed]);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem("tike:tuto-dismissed", "1");
    } catch {}
  };

  const slide = TUTORIAL_SLIDES[i];

  return (
    <div className="tk-tutorial">
      <div
        key={i}
        style={{
          ...S.card,
          boxShadow: "0 14px 34px rgba(28,21,51,.16)",
          animation: "tk-fade-up .35s cubic-bezier(.22,1,.36,1) both",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ fontSize: 22, animation: "tk-float 2.4s ease-in-out infinite" }}>{slide.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{slide.title}</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>{slide.text}</div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Fermer le tutoriel"
            className="tk-press"
            style={{ background: "none", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0 }}
          >
            ×
          </button>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
          {TUTORIAL_SLIDES.map((_, k) => (
            <div
              key={k}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 999,
                background: k === i ? C.amber : C.line,
                transition: "background .3s ease",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================ Pages statiques ============================ */
function StaticPage({ title, onBack, children }) {
  return (
    <div>
      <Top title={title} onBack={onBack} />
      <Reveal i={0}>
        <div style={S.card}>{children}</div>
      </Reveal>
    </div>
  );
}

function FAQItem({ q, children, i }) {
  const [open, setOpen] = useState(false);
  return (
    <Reveal i={i}>
      <div style={{ borderBottom: `1px solid ${C.line}`, padding: "14px 0" }}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="tk-press"
          style={{
            width: "100%",
            background: "none",
            border: "none",
            padding: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            textAlign: "left",
            color: C.text,
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>{q}</span>
          <span style={{ color: C.amber, fontSize: 18, flexShrink: 0, transform: open ? "rotate(45deg)" : "none", transition: "transform .2s ease" }}>
            +
          </span>
        </button>
        {open && <div style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.7, marginTop: 10 }}>{children}</div>}
      </div>
    </Reveal>
  );
}

function FAQ({ onBack }) {
  return (
    <StaticPage title="Foire aux questions" onBack={onBack}>
      <FAQItem i={0} q="Comment acheter un billet ?">
        Un organisateur te partage un lien unique (WhatsApp, Facebook…). En l'ouvrant, tu crées ou utilises ton compte
        client, tu choisis ta catégorie de billet, puis tu payes par mobile money. Ton billet est disponible
        immédiatement avec un QR code unique.
      </FAQItem>
      <FAQItem i={1} q="Le paiement mobile money est-il sécurisé ?">
        Le paiement se fait via une demande envoyée à ton opérateur (MTN MoMo ou Airtel Money) que tu valides toi-même
        avec ton code PIN. TIKÉ ne stocke jamais ton code PIN ni tes identifiants mobile money.
      </FAQItem>
      <FAQItem i={2} q="Puis-je me faire rembourser ?">
        Tu peux faire une demande de remboursement directement depuis un billet actif. Seul l'organisateur de
        l'événement peut approuver ou refuser cette demande — TIKÉ ne décide pas à sa place.
      </FAQItem>
      <FAQItem i={3} q="Comment fonctionne la file d'attente virtuelle ?">
        Pour les événements à forte demande, l'organisateur peut activer une salle d'attente : tu patientes en ligne
        et es admis au paiement automatiquement, un par un, dans l'ordre d'arrivée.
      </FAQItem>
      <FAQItem i={4} q="Je suis organisateur, comment je récupère mes fonds ?">
        Depuis le tableau de bord de ton événement, tu peux retirer les fonds disponibles (revenus moins la
        commission) vers ton numéro mobile money. Chaque retrait demande une raison et une confirmation, et reste
        consultable dans un historique permanent.
      </FAQItem>
      <FAQItem i={5} q="Comment est calculée la commission ?">
        Elle dépend du prix du billet : 10% par billet jusqu'à 5 000 FCFA, 20% par billet au-delà de 5 000 FCFA.
      </FAQItem>
      <FAQItem i={6} q="Mes billets sont-ils protégés contre la fraude ?">
        Chaque billet a un QR code unique et un numéro de rang (N°...). À l'entrée, l'organisateur scanne le billet
        avec la caméra : un billet déjà utilisé, annulé ou inconnu est immédiatement signalé.
      </FAQItem>
    </StaticPage>
  );
}

function About({ onBack }) {
  return (
    <StaticPage title="À propos de nous" onBack={onBack}>
      <div style={{ color: C.text, fontSize: 14.5, lineHeight: 1.8 }}>
        <p style={{ marginTop: 0 }}>
          <b>TIKÉ</b> est une billetterie pensée pour les organisateurs d'événements en Afrique centrale : pas de
          vitrine publique à parcourir, juste un lien à partager sur WhatsApp ou Facebook et un paiement mobile
          money simple pour tes invités.
        </p>
        <p>
          Notre objectif : donner aux artistes, DJ et organisateurs indépendants les mêmes outils que les grandes
          plateformes de billetterie — vente en ligne, contrôle d'entrée anti-fraude, tableau de bord de revenus,
          file d'attente pour les fortes demandes — sans complexité ni frais cachés.
        </p>
        <p style={{ marginBottom: 0 }}>
          Une commission simple selon le prix du billet est prélevée sur les ventes, rien de plus : 10% jusqu'à 5 000
          FCFA, 20% au-delà.
        </p>
      </div>
    </StaticPage>
  );
}

function OrganizerTerms({ onBack }) {
  const item = (title, children) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{title}</div>
      <div style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
  return (
    <StaticPage title="Conditions d'utilisation — Organisateurs" onBack={onBack}>
      <div style={{ color: C.muted, fontSize: 12.5, marginBottom: 20 }}>
        En créant ou en utilisant un compte organisateur, tu acceptes les conditions ci-dessous.
      </div>

      {item(
        "1. Objet",
        "TIKÉ est un outil de billetterie : il te permet de créer un lien de vente et d'encaisser tes billets par mobile money (MTN MoMo, Airtel Money). TIKÉ n'est pas une agence événementielle et n'organise aucun événement."
      )}
      {item(
        "2. Compte organisateur",
        "Les informations fournies à la création de ton compte (nom, numéro mobile money) doivent être exactes et t'appartenir. Le numéro mobile money renseigné à la création d'un événement est celui qui reçoit les retraits pour cet événement : il doit être correct, sa saisie est redemandée à chaque retrait pour confirmation."
      )}
      {item(
        "3. Événements",
        "Tu es seul responsable du contenu, de la légalité et du bon déroulement de tes événements (autorisations nécessaires, sécurité du lieu, respect des lois locales). TIKÉ n'intervient à aucun moment dans l'organisation de l'événement lui-même."
      )}
      {item(
        "4. Commission",
        "Une commission est prélevée sur chaque billet vendu : 10% pour un billet à 5 000 FCFA ou moins, 20% au-delà. Un taux personnalisé peut, à titre exceptionnel, être appliqué par l'administrateur de la plateforme ; il est alors visible dans le tableau de bord de l'événement concerné."
      )}
      {item(
        "5. Retraits",
        "Les fonds disponibles (revenus des ventes moins la commission et les retraits déjà effectués) peuvent être retirés vers le numéro mobile money renseigné à la création de l'événement. Chaque retrait exige une raison et une confirmation. L'historique des retraits est permanent et ne peut pas être supprimé."
      )}
      {item(
        "6. Annulations et remboursements",
        "Un client peut te demander un remboursement depuis son billet ; toi seul décides de l'approuver ou de le refuser. Un billet remboursé est définitivement annulé et ne peut plus être scanné à l'entrée."
      )}
      {item(
        "7. Contrôle d'entrée",
        "Chaque billet porte un QR code signé, à usage unique : le premier scan valide l'entrée, tout scan suivant du même billet est signalé comme déjà utilisé. Le contrôle d'entrée (scanner ou lien de vérification) relève de ta responsabilité."
      )}
      {item(
        "8. Nom du client sur le billet",
        "Tu choisis, événement par événement, si le nom et prénom du client sont demandés à l'achat et affichés sur le billet."
      )}
      {item(
        "9. Suspension et résiliation",
        "TIKÉ peut suspendre un compte organisateur en cas de fraude avérée, de non-respect de ces conditions, ou d'événement manifestement illégal. Un compte suspendu ne peut plus créer d'événement, encaisser de vente ni retirer de fonds."
      )}
      {item(
        "10. Responsabilité",
        "TIKÉ fournit un outil technique et n'est pas partie à la relation entre toi et tes clients. Tu restes seul responsable des obligations légales et fiscales liées à ton activité et à tes événements."
      )}
      {item("11. Modifications", "Ces conditions peuvent évoluer ; les changements s'appliquent aux événements créés après leur mise à jour.")}
    </StaticPage>
  );
}

function Contact({ onBack }) {
  return (
    <StaticPage title="Nous contacter" onBack={onBack}>
      <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 18 }}>
        Une question, un souci avec un billet ou un événement ? Écris-nous.
      </div>
      <a
        href="mailto:nicolas.mack10@gmail.com"
        className="tk-press"
        style={{ ...S.card, display: "block", textDecoration: "none", color: C.text, marginBottom: 12 }}
      >
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>Email</div>
        <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>nicolas.mack10@gmail.com</div>
      </a>
      <a
        href="tel:+242066820530"
        className="tk-press"
        style={{ ...S.card, display: "block", textDecoration: "none", color: C.text }}
      >
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>Téléphone</div>
        <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>+242 06 682 05 30</div>
      </a>
    </StaticPage>
  );
}

/* ============================ Connexion / Création de compte ============================ */
function GoogleButton({ busy, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="tk-press"
      style={{
        ...S.btnGhost,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .9 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z" />
      </svg>
      Continuer avec Google
    </button>
  );
}

function Auth({ role, onBack, onDone, onForgotPassword, onViewTerms }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [err, setErr] = useState("");

  const title = role === "organizer" ? "Compte organisateur" : "Compte client";
  const phoneLabel = role === "organizer" ? "Numéro mobile money (encaissements)" : "Numéro de téléphone";

  const ok = mode === "login" ? email && password : email && password.length >= 6 && name && phone;

  const submit = async () => {
    if (!ok || busy) return;
    setErr("");
    setBusy(true);
    try {
      const profile = mode === "signup" ? await signUp({ email, password, role, name, phone }) : await signIn({ email, password });
      if (mode === "login" && profile.role !== role && profile.role !== "admin") {
        await signOut();
        throw new Error(
          role === "organizer"
            ? "Ce compte est enregistré comme client. Utilise la carte « Je suis client » pour te connecter."
            : "Ce compte est enregistré comme organisateur. Utilise la carte « Je suis organisateur » pour te connecter."
        );
      }
      onDone(profile);
    } catch (e) {
      setErr(e.message || "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const withGoogle = async () => {
    setErr("");
    setGoogleBusy(true);
    try {
      try {
        localStorage.setItem("tike:pending-role", role);
      } catch {}
      await signInWithGoogle();
      // La page redirige vers Google — rien d'autre à faire ici.
    } catch (e) {
      setErr(e.message || "Connexion Google indisponible.");
      setGoogleBusy(false);
    }
  };

  return (
    <div>
      <Top title={title} onBack={onBack} />
      <Reveal i={0}>
        <div style={{ ...S.card, animation: err ? "tk-shake .4s both" : "none" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[
              { id: "login", label: "Se connecter" },
              { id: "signup", label: "Créer un compte" },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMode(m.id);
                  setErr("");
                }}
                className="tk-press"
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: `1px solid ${C.line}`,
                  background: mode === m.id ? C.amber : C.surface2,
                  color: mode === m.id ? C.amberDark : C.text,
                  fontWeight: 700,
                  fontSize: 13.5,
                  cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <GoogleButton busy={googleBusy} onClick={withGoogle} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
            <div style={{ flex: 1, height: 1, background: C.line }} />
            <div style={{ color: C.muted, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 1 }}>ou</div>
            <div style={{ flex: 1, height: 1, background: C.line }} />
          </div>

          {mode === "signup" && (
            <>
              <label style={S.label}>{role === "organizer" ? "Nom ou nom de scène" : "Nom complet"}</label>
              <input
                style={S.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={role === "organizer" ? "Ex. DJ Maleka Events" : "Ex. Nadège Loemba"}
              />
              <label style={S.label}>{phoneLabel}</label>
              <input style={S.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 XXX XX XX" inputMode="tel" />
            </>
          )}

          <label style={S.label}>Email</label>
          <input style={S.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@email.com" />
          <label style={S.label}>Mot de passe</label>
          <input
            style={S.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "6 caractères minimum" : "••••••••"}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />

          {mode === "login" && (
            <button
              type="button"
              onClick={onForgotPassword}
              className="tk-press"
              style={{
                background: "none",
                border: "none",
                color: C.muted,
                fontSize: 12.5,
                cursor: "pointer",
                fontFamily: "'Space Grotesk', sans-serif",
                padding: 0,
                marginBottom: 14,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Mot de passe oublié ?
            </button>
          )}

          {err && <div style={{ color: C.pink, fontSize: 13, marginBottom: 12 }}>{err}</div>}

          <button className="tk-press" style={{ ...S.btn, opacity: ok && !busy ? 1 : 0.4 }} disabled={!ok || busy} onClick={submit}>
            {busy ? "Un instant…" : mode === "signup" ? "Créer mon compte" : "Se connecter"}
          </button>

          {role === "organizer" && mode === "signup" && (
            <div style={{ color: C.muted, fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
              Les fonds des ventes sont reversés sur ce numéro. Tu ne verras que tes propres événements.
              <br />
              En créant ce compte, tu acceptes nos{" "}
              <button
                type="button"
                onClick={onViewTerms}
                className="tk-press"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: C.amber,
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                conditions d'utilisation organisateurs
              </button>
              .
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}

function ForgotPassword({ onBack }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!email.trim() || busy) return;
    setErr("");
    setBusy(true);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setErr(e.message || "Échec de l'envoi — réessaie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Top title="Mot de passe oublié" onBack={onBack} />
      <Reveal i={0}>
        <div style={S.card}>
          {sent ? (
            <div style={{ color: C.text, fontSize: 14.5, lineHeight: 1.7 }}>
              Si un compte existe pour <b>{email}</b>, un lien de réinitialisation vient d'être envoyé. Vérifie ta
              boîte mail (et les spams).
            </div>
          ) : (
            <>
              <div style={{ color: C.muted, fontSize: 13.5, marginBottom: 14, lineHeight: 1.5 }}>
                Indique l'email de ton compte, on t'envoie un lien pour choisir un nouveau mot de passe.
              </div>
              <label style={S.label}>Email</label>
              <input
                style={S.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="toi@email.com"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              {err && <div style={{ color: C.pink, fontSize: 13, marginBottom: 12 }}>{err}</div>}
              <button className="tk-press" style={{ ...S.btn, opacity: email.trim() && !busy ? 1 : 0.4 }} disabled={!email.trim() || busy} onClick={submit}>
                {busy ? "Envoi…" : "Envoyer le lien"}
              </button>
            </>
          )}
        </div>
      </Reveal>
    </div>
  );
}

function ResetPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const ok = password.length >= 6 && password === confirm;

  const submit = async () => {
    if (!ok || busy) return;
    setErr("");
    setBusy(true);
    try {
      await updatePassword(password);
      window.history.replaceState({}, "", "/");
      const p = await getSessionProfile();
      onDone(p);
    } catch (e) {
      setErr(e.message || "Échec — réessaie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Top title="Nouveau mot de passe" />
      <Reveal i={0}>
        <div style={S.card}>
          <label style={S.label}>Nouveau mot de passe</label>
          <input style={S.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6 caractères minimum" />
          <label style={S.label}>Confirmer</label>
          <input
            style={S.input}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Retape le mot de passe"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          {confirm && password !== confirm && (
            <div style={{ color: C.pink, fontSize: 13, marginBottom: 12 }}>Les mots de passe ne correspondent pas.</div>
          )}
          {err && <div style={{ color: C.pink, fontSize: 13, marginBottom: 12 }}>{err}</div>}
          <button className="tk-press" style={{ ...S.btn, opacity: ok && !busy ? 1 : 0.4 }} disabled={!ok || busy} onClick={submit}>
            {busy ? "Enregistrement…" : "Enregistrer et continuer"}
          </button>
        </div>
      </Reveal>
    </div>
  );
}

function CompleteProfile({ pendingUser, onDone }) {
  const [role, setRole] = useState("client");
  const [name, setName] = useState(pendingUser.name || "");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const ok = name.trim() && phone.trim();

  const submit = async () => {
    if (!ok || busy) return;
    setErr("");
    setBusy(true);
    try {
      const profile = await createProfileForCurrentUser({ role, name: name.trim(), phone: phone.trim() });
      await onDone(profile);
    } catch (e) {
      setErr(e.message || "Échec — réessaie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Top title="Finalise ton compte" />
      <Reveal i={0}>
        <div style={S.card}>
          <div style={{ color: C.muted, fontSize: 13.5, marginBottom: 16, lineHeight: 1.5 }}>
            Connecté avec <b style={{ color: C.text }}>{pendingUser.email}</b>. Encore quelques infos pour finaliser
            ton compte.
          </div>

          <label style={S.label}>Type de compte</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[
              { id: "organizer", label: "Organisateur" },
              { id: "client", label: "Client" },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => setRole(r.id)}
                className="tk-press"
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: `1px solid ${C.line}`,
                  background: role === r.id ? C.amber : C.surface2,
                  color: role === r.id ? C.amberDark : C.text,
                  fontWeight: 700,
                  fontSize: 13.5,
                  cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <label style={S.label}>{role === "organizer" ? "Nom ou nom de scène" : "Nom complet"}</label>
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ton nom" />
          <label style={S.label}>{role === "organizer" ? "Numéro mobile money (encaissements)" : "Numéro de téléphone"}</label>
          <input style={S.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 XXX XX XX" inputMode="tel" />

          {err && <div style={{ color: C.pink, fontSize: 13, marginBottom: 12 }}>{err}</div>}

          <button className="tk-press" style={{ ...S.btn, opacity: ok && !busy ? 1 : 0.4 }} disabled={!ok || busy} onClick={submit}>
            {busy ? "Un instant…" : "Terminer"}
          </button>
        </div>
      </Reveal>
    </div>
  );
}

/* ---------- Contrôle à l'entrée via lien signé (public, sans compte) ---------- */
const VERIFY_STATUS_META = {
  VALIDE: { icon: "✅", label: "Billet valide", color: TK.green, sub: "Accès autorisé — premier scan." },
  DEJA_UTILISE: { icon: "⚠️", label: "Déjà utilisé", color: TK.amber, sub: "Ce billet a déjà été scanné." },
  ANNULE: { icon: "🚫", label: "Billet annulé", color: TK.pink, sub: "Ce billet a été remboursé — accès refusé." },
  SIGNATURE_INVALIDE: { icon: "⛔", label: "Billet invalide", color: TK.pink, sub: "La signature ne correspond pas — billet falsifié ou corrompu." },
  INCONNU: { icon: "❓", label: "Billet introuvable", color: TK.pink, sub: "Aucun billet ne correspond à ce code." },
  ERREUR: { icon: "⚠️", label: "Erreur réseau", color: TK.pink, sub: "Réessaie dans un instant." },
};

function VerifyTicket({ ticketId, signature }) {
  const [checking, setChecking] = useState(true);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    verifyTicketDB(ticketId, signature)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setResult({ status: "ERREUR" });
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, signature]);

  const meta = result ? VERIFY_STATUS_META[result.status] || VERIFY_STATUS_META.ERREUR : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: TK.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
        fontFamily: "'Space Grotesk', sans-serif",
        zIndex: 200,
      }}
    >
      <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 22, color: TK.amber, marginBottom: 28 }}>
        TIKÉ<span style={{ color: TK.pink }}>.</span>
      </div>

      {checking ? (
        <div style={{ color: TK.muted, fontSize: 15 }}>Vérification du billet…</div>
      ) : (
        <>
          <div style={{ fontSize: 56, marginBottom: 12 }}>{meta.icon}</div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: 24, color: meta.color, marginBottom: 8 }}>
            {meta.label}
          </div>
          <div style={{ color: TK.muted, fontSize: 14, maxWidth: 320, lineHeight: 1.6 }}>{meta.sub}</div>

          {result && (result.buyerName || result.eventName) && (
            <div
              style={{
                marginTop: 24,
                padding: "14px 20px",
                borderRadius: 16,
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.12)",
                maxWidth: 320,
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              {result.eventName && <div style={{ color: TK.text, fontWeight: 700, fontSize: 14.5 }}>{result.eventName}</div>}
              {result.buyerName && <div style={{ color: TK.muted, fontSize: 13, marginTop: 4 }}>Titulaire : {result.buyerName}</div>}
              {result.usedAt && (
                <div style={{ color: TK.muted, fontSize: 12, marginTop: 4 }}>
                  {result.status === "VALIDE" ? "Scanné à l'instant" : `Scanné le ${fmtDateTime(result.usedAt)}`}
                </div>
              )}
            </div>
          )}

          <div style={{ color: TK.muted, fontSize: 11.5, marginTop: 16, fontFamily: "monospace", opacity: 0.7 }}>{ticketId}</div>
        </>
      )}
    </div>
  );
}

/* ---------- TABLEAU DE BORD GLOBAL (ORGANISATEUR) ---------- */
function CreatorDash({ profile, events, onLogout, onNew, onOpen }) {
  const mine = Object.values(events).sort((a, b) => b.ts - a.ts);

  const allBuyers = mine.flatMap((e) => e.buyers.map((b) => ({ ...b, eventName: e.name, eventCode: e.code })));
  const totalRevenue = mine.reduce((s, e) => s + revenue(e), 0);
  const soldAll = mine.reduce((s, e) => s + totalSold(e), 0);
  const capAll = mine.reduce((s, e) => s + totalCap(e), 0);
  const scannedAll = mine.reduce((s, e) => s + Object.keys(e.used || {}).length, 0);
  const fillPct = capAll ? (soldAll / capAll) * 100 : 0;
  const totalNet = mine.reduce((s, e) => s + netRevenue(e), 0);

  const revAnim = useCountUp(totalRevenue);
  const soldAnim = useCountUp(soldAll);

  const upcoming = mine.filter((e) => new Date(e.date + "T" + (e.time || "00:00")) >= new Date()).length;
  const best = mine.slice().sort((a, b) => revenue(b) - revenue(a))[0];

  const recent = allBuyers.sort((a, b) => b.ts - a.ts).slice(0, 5);

  return (
    <div>
      <Top title={`Salut, ${profile.name}`} right={<LogoutButton onClick={onLogout} />} />

      {/* Bloc revenus principal */}
      <Reveal i={0}>
        <div
          style={{
            ...S.card,
            background: HERO_GRADIENT,
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 14,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ ...S.label, color: "rgba(255,255,255,.8)" }}>Revenus encaissés</div>
            <div
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontWeight: 900,
                fontSize: 26,
                color: "#FFFFFF",
                lineHeight: 1.1,
                letterSpacing: -0.5,
              }}
            >
              {fmtFCFA(revAnim)}
            </div>
            <div style={{ color: "rgba(255,255,255,.85)", fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
              Net après commission :<br />
              <b style={{ color: "#FFFFFF" }}>{fmtFCFA(totalNet)}</b>
            </div>
          </div>
          <Ring pct={fillPct} label="rempli" />
        </div>
      </Reveal>

      {/* KPI */}
      <Reveal i={1}>
        <div className="tk-kpi-grid">
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
                    {b.name || "Client sans nom"} · {b.qty} × {b.tierName}
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
        <div>
          <div style={{ ...S.label, marginBottom: 12 }}>Mes événements</div>
          <div className="tk-list-grid">
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
        </div>
      )}
    </div>
  );
}

/* ---------- Création avec catégories de prix ---------- */
function NewEvent({ profile, onBack, onCreate }) {
  const [f, setF] = useState({ name: "", date: "", time: "", venue: "", city: "Pointe-Noire", desc: "" });
  const [tiers, setTiers] = useState([{ id: "t1", name: "Standard", price: "", capacity: "" }]);
  const [posterFile, setPosterFile] = useState(null);
  const [posterPreview, setPosterPreview] = useState(null);
  const [posterErr, setPosterErr] = useState("");
  const [queueEnabled, setQueueEnabled] = useState(false);
  const [requireBuyerName, setRequireBuyerName] = useState(true);
  const [creating, setCreating] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const onPosterChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPosterErr("Choisis un fichier image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPosterErr("Image trop lourde (5 Mo max).");
      return;
    }
    setPosterErr("");
    setPosterFile(file);
    setPosterPreview(URL.createObjectURL(file));
  };

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
  const ok = f.name && f.date && f.time && f.venue && tiersOk && posterFile;

  const handleCreate = async () => {
    if (!ok || creating) return;
    setCreating(true);
    const code = genCode(6);
    let posterUrl;
    try {
      posterUrl = await uploadPosterDB(profile.id, code, posterFile);
    } catch (err) {
      console.error(err);
      setPosterErr("Échec de l'envoi de l'affiche — réessaie.");
      setCreating(false);
      return;
    }
    await onCreate({
      code,
      creatorId: profile.id,
      momoNumber: profile.phone,
      name: f.name,
      date: f.date,
      time: f.time,
      venue: f.venue,
      city: f.city,
      desc: f.desc,
      posterUrl,
      queueEnabled,
      requireBuyerName,
      tiers: tiers.map((t) => ({ id: t.id, name: t.name.trim(), price: Number(t.price), capacity: Number(t.capacity) })),
      buyers: [],
      used: {},
      withdrawals: [],
      ts: Date.now(),
    });
    setCreating(false);
  };

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
          <label style={S.label}>Affiche de l'événement</label>
          <div style={{ color: C.muted, fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
            Visible en en-tête de la page que verront tes invités.
          </div>
          {posterPreview && (
            <img
              src={posterPreview}
              alt=""
              style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", objectPosition: "center", borderRadius: 12, marginBottom: 12, display: "block" }}
            />
          )}
          <label
            className="tk-press"
            style={{
              ...S.btnGhost,
              display: "block",
              textAlign: "center",
              boxSizing: "border-box",
              marginBottom: 0,
              cursor: "pointer",
            }}
          >
            {posterFile ? "Changer l'affiche" : "Choisir une image"}
            <input type="file" accept="image/*" onChange={onPosterChange} style={{ display: "none" }} />
          </label>
          {posterErr && <div style={{ color: C.pink, fontSize: 13, marginTop: 10 }}>{posterErr}</div>}
        </div>
      </Reveal>

      <Reveal i={2}>
        <button
          type="button"
          onClick={() => setQueueEnabled((v) => !v)}
          className="tk-press"
          style={{
            ...S.card,
            width: "100%",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 14,
            textAlign: "left",
            cursor: "pointer",
            border: `1px solid ${queueEnabled ? C.amber : C.line}`,
          }}
        >
          <div
            style={{
              width: 44,
              height: 26,
              borderRadius: 999,
              background: queueEnabled ? C.amber : C.surface2,
              border: `1px solid ${queueEnabled ? C.amber : C.line}`,
              position: "relative",
              flexShrink: 0,
              transition: "background .2s ease",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 2,
                left: queueEnabled ? 20 : 2,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#FFFFFF",
                transition: "left .2s ease",
                boxShadow: "0 1px 3px rgba(28,21,51,.3)",
              }}
            />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>File d'attente virtuelle</div>
            <div style={{ color: C.muted, fontSize: 12.5, marginTop: 2, lineHeight: 1.5 }}>
              Recommandé en cas de forte demande : les clients patientent et sont admis un par un avant de pouvoir payer.
            </div>
          </div>
        </button>
      </Reveal>

      <Reveal i={2.5}>
        <button
          type="button"
          onClick={() => setRequireBuyerName((v) => !v)}
          className="tk-press"
          style={{
            ...S.card,
            width: "100%",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 14,
            textAlign: "left",
            cursor: "pointer",
            border: `1px solid ${requireBuyerName ? C.amber : C.line}`,
          }}
        >
          <div
            style={{
              width: 44,
              height: 26,
              borderRadius: 999,
              background: requireBuyerName ? C.amber : C.surface2,
              border: `1px solid ${requireBuyerName ? C.amber : C.line}`,
              position: "relative",
              flexShrink: 0,
              transition: "background .2s ease",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 2,
                left: requireBuyerName ? 20 : 2,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#FFFFFF",
                transition: "left .2s ease",
                boxShadow: "0 1px 3px rgba(28,21,51,.3)",
              }}
            />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>Nom et prénom sur le billet</div>
            <div style={{ color: C.muted, fontSize: 12.5, marginTop: 2, lineHeight: 1.5 }}>
              {requireBuyerName
                ? "Le client doit indiquer son nom et prénom à l'achat, affiché sur le billet."
                : "Le client peut acheter sans donner son nom — le billet n'affichera pas de titulaire."}
            </div>
          </div>
        </button>
      </Reveal>

      <Reveal i={3}>
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ ...S.label, marginBottom: 4 }}>Catégories de billets</div>
          <div style={{ color: C.muted, fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
            Commission : 10% par billet à 5 000 FCFA ou moins, 20% au-delà.
          </div>
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

      <Reveal i={4}>
        <button className="tk-press" style={{ ...S.btn, opacity: ok && !creating ? 1 : 0.4 }} disabled={!ok || creating} onClick={handleCreate}>
          {creating ? "Création…" : "Créer et obtenir mon lien"}
        </button>
      </Reveal>
    </div>
  );
}

// Liste des acheteurs/transactions d'un événement, avec pour chaque billet
// son statut et son heure de scan — utilisée côté organisateur et admin.
function BuyersList({ ev, title = "Acheteurs" }) {
  return (
    <div style={S.card}>
      <div style={S.label}>
        {title} ({ev.buyers.length})
      </div>
      {ev.buyers.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13.5 }}>Pas encore de ventes.</div>
      ) : (
        ev.buyers
          .slice()
          .reverse()
          .map((b, i) => (
            <div
              key={i}
              style={{
                padding: "12px 0",
                borderBottom: i < ev.buyers.length - 1 ? `1px solid ${C.line}` : "none",
                opacity: b.cancelled ? 0.5 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {b.name || "Client sans nom"}
                    {b.cancelled && (
                      <span style={{ color: C.pink, fontWeight: 700, fontSize: 11, marginLeft: 8, textTransform: "uppercase" }}>
                        Annulé
                      </span>
                    )}
                  </div>
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
              <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>Achat le {fmtDateTime(b.ts)}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {b.ids.map((t) => {
                  const usedAt = ev.used && ev.used[t.id];
                  return (
                    <div
                      key={t.id}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: usedAt ? "rgba(52,199,89,.14)" : C.surface2,
                        color: usedAt ? C.green : C.muted,
                      }}
                    >
                      N°{t.rank} — {usedAt ? `Scanné à ${fmtDateTime(usedAt)}` : "Non scanné"}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
      )}
    </div>
  );
}

/* ---------- TABLEAU DE BORD ÉVÉNEMENT ---------- */
function CreatorEvent({ ev, onBack, onScan, notify, onWithdraw }) {
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState(null); // null | "form" | "confirm"
  const [wPhone, setWPhone] = useState("");
  const [wReason, setWReason] = useState("");
  const [wErr, setWErr] = useState("");
  const [queueCount, setQueueCount] = useState(null);
  const [refunds, setRefunds] = useState([]);
  const [resolvingId, setResolvingId] = useState(null);

  useEffect(() => {
    if (!ev.queueEnabled) return;
    let cancelled = false;
    const poll = () => fetchQueueCountDB(ev.code).then((n) => !cancelled && setQueueCount(n)).catch(() => {});
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ev.code, ev.queueEnabled]);

  const loadRefunds = useCallback(() => {
    fetchRefundRequestsDB(ev.code)
      .then(setRefunds)
      .catch((e) => console.error(e));
  }, [ev.code]);
  useEffect(() => {
    loadRefunds();
    const id = setInterval(loadRefunds, 8000);
    return () => clearInterval(id);
  }, [loadRefunds]);

  const resolveRefund = async (req, approve) => {
    setResolvingId(req.id);
    try {
      await resolveRefundDB(req.id, req.buyerId, approve);
      setRefunds((prev) => prev.filter((r) => r.id !== req.id));
      notify(approve ? "Billet annulé et remboursement approuvé." : "Demande refusée.");
    } catch (e) {
      console.error(e);
      notify("Échec de l'opération — réessaie.");
    } finally {
      setResolvingId(null);
    }
  };
  const link = `${window.location.origin}/e/${ev.code}`;
  const rev = revenue(ev);
  const sold = totalSold(ev);
  const cap = totalCap(ev);
  const pct = cap ? (sold / cap) * 100 : 0;
  const usedCount = Object.keys(ev.used || {}).length;
  const scanPct = sold ? (usedCount / sold) * 100 : 0;
  const revAnim = useCountUp(rev);
  const avgBasket = ev.buyers.length ? rev / ev.buyers.length : 0;
  const withdrawn = withdrawnTotal(ev);
  const available = availableFunds(ev);

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

  const normPhone = (s) => (s || "").replace(/\D/g, "");

  const openWithdraw = () => {
    if (available <= 0) return;
    setWPhone("");
    setWReason("");
    setWErr("");
    setWithdrawModal("form");
  };

  const toConfirm = () => {
    setWErr("");
    if (!wReason.trim()) {
      setWErr("Indique une raison pour ce retrait.");
      return;
    }
    if (!wPhone.trim()) {
      setWErr("Indique le numéro mobile money.");
      return;
    }
    if (normPhone(wPhone) !== normPhone(ev.momoNumber)) {
      setWErr("Ce numéro ne correspond pas à celui renseigné à la création de l'événement.");
      return;
    }
    setWithdrawModal("confirm");
  };

  const doWithdraw = async () => {
    setWithdrawing(true);
    setWErr("");
    try {
      await onWithdraw(available, wPhone.trim(), wReason.trim());
      setWithdrawModal(null);
    } catch (e) {
      setWErr(e.message || "Échec du retrait — réessaie.");
    } finally {
      setWithdrawing(false);
    }
  };

  const priceLine = ev.tiers.map((t) => `${t.name} ${fmtFCFA(t.price)}`).join(" · ");
  const waText = encodeURIComponent(
    `🎟️ ${ev.name}\n📅 ${ev.date} à ${ev.time}\n📍 ${ev.venue}, ${ev.city}\n💵 ${priceLine}\n\nAchète ton billet ici : ${link}`
  );

  return (
    <div>
      <Top title={ev.name} onBack={onBack} />

      {ev.posterUrl && (
        <Reveal i={0}>
          <img
            src={ev.posterUrl}
            alt=""
            style={{ width: "100%", display: "block", aspectRatio: "16 / 9", objectFit: "cover", objectPosition: "center", borderRadius: 18, marginBottom: 14 }}
          />
        </Reveal>
      )}

      {/* Compte à rebours */}
      <Reveal i={0}>
        <div style={{ ...S.card, background: HERO_GRADIENT, marginBottom: 14 }}>
          <div style={{ color: "rgba(255,255,255,.85)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
            {daysLeft >= 0 ? "Compte à rebours" : "Événement terminé"}
          </div>
          {daysLeft >= 0 ? <Countdown target={eventDate.getTime()} /> : null}
        </div>
      </Reveal>

      {/* Bandeau revenus */}
      <Reveal i={0}>
        <div
          style={{
            ...S.card,
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
            <div style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>{sold} / {cap} billets</div>
          </div>
          <Ring pct={pct} label="rempli" />
        </div>
      </Reveal>

      {/* KPI secondaires */}
      <Reveal i={1}>
        <div className="tk-kpi-grid">
          {[
            { k: "Panier moyen", v: fmtShort(avgBasket), c: C.text },
            { k: "Commandes", v: ev.buyers.length, c: C.blue },
            { k: "Disponible", v: fmtShort(available), c: C.green },
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

      {/* Retrait de fonds */}
      <Reveal i={2}>
        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={S.label}>Fonds disponibles</div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 22, color: C.green }}>
                {fmtFCFA(available)}
              </div>
            </div>
            <button
              className="tk-press"
              style={{ ...S.btn, width: "auto", padding: "13px 20px", opacity: available > 0 ? 1 : 0.4 }}
              disabled={available <= 0}
              onClick={openWithdraw}
            >
              Retirer
            </button>
          </div>
          {ev.commissionOverride != null && (
            <div style={{ color: C.muted, fontSize: 12, marginTop: 10 }}>
              Commission personnalisée appliquée par l'administrateur : {Math.round(ev.commissionOverride * 100)}%.
            </div>
          )}
          {ev.withdrawals.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
              <div style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>
                {fmtFCFA(withdrawn)} déjà retirés · historique ({ev.withdrawals.length})
              </div>
              {ev.withdrawals
                .slice()
                .sort((a, b) => b.ts - a.ts)
                .map((w, i) => (
                  <div
                    key={w.id ?? i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "8px 0",
                      borderBottom: i < ev.withdrawals.length - 1 ? `1px solid ${C.line}` : "none",
                      fontSize: 12.5,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.text, fontWeight: 700 }}>{w.reason || "—"}</div>
                      <div style={{ color: C.muted }}>
                        {new Date(w.ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                        {w.phone ? ` · ${w.phone}` : ""}
                      </div>
                    </div>
                    <div style={{ color: C.amber, fontWeight: 700, whiteSpace: "nowrap" }}>{fmtFCFA(w.amount)}</div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </Reveal>

      {withdrawModal && (
        <Modal title={withdrawModal === "form" ? "Retirer des fonds" : "Confirmer le retrait"} onClose={() => (withdrawing ? null : setWithdrawModal(null))}>
          {withdrawModal === "form" && (
            <>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
                Montant disponible : <b style={{ color: C.text }}>{fmtFCFA(available)}</b>
              </div>
              <label style={S.label}>Raison du retrait</label>
              <textarea
                style={{ ...S.input, minHeight: 60, resize: "vertical" }}
                value={wReason}
                onChange={(e) => setWReason(e.target.value)}
                placeholder="Ex. Frais de salle, cachets artistes…"
              />
              <label style={S.label}>Numéro mobile money</label>
              <input
                style={S.input}
                value={wPhone}
                onChange={(e) => setWPhone(e.target.value)}
                placeholder={ev.momoNumber || "06 XXX XX XX"}
                inputMode="tel"
              />
              <div style={{ color: C.muted, fontSize: 12, marginTop: -6, marginBottom: 14, lineHeight: 1.5 }}>
                Doit correspondre au numéro renseigné à la création de l'événement.
              </div>
              {wErr && <div style={{ color: C.pink, fontSize: 13, marginBottom: 12 }}>{wErr}</div>}
              <button className="tk-press" style={S.btn} onClick={toConfirm}>
                Continuer
              </button>
            </>
          )}
          {withdrawModal === "confirm" && (
            <>
              <div style={{ color: C.text, fontSize: 14.5, lineHeight: 1.7, marginBottom: 18 }}>
                Tu es sur le point de retirer <b style={{ color: C.amber }}>{fmtFCFA(available)}</b> vers le numéro{" "}
                <b>{wPhone}</b>.
                <br />
                Raison : <b>{wReason}</b>
              </div>
              {wErr && <div style={{ color: C.pink, fontSize: 13, marginBottom: 12 }}>{wErr}</div>}
              <button className="tk-press" style={{ ...S.btn, opacity: withdrawing ? 0.6 : 1 }} disabled={withdrawing} onClick={doWithdraw}>
                {withdrawing ? "Retrait en cours…" : "Confirmer le retrait"}
              </button>
              <button
                className="tk-press"
                style={{ ...S.btnGhost, marginTop: 10 }}
                disabled={withdrawing}
                onClick={() => setWithdrawModal("form")}
              >
                Retour
              </button>
            </>
          )}
        </Modal>
      )}

      {/* Lien de partage */}
      <Reveal i={3}>
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

      {ev.queueEnabled && queueCount != null && queueCount > 0 && (
        <Reveal i={3}>
          <div style={{ ...S.card, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 22 }}>⏳</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                {queueCount} personne{queueCount > 1 ? "s" : ""} en file d'attente
              </div>
              <div style={{ color: C.muted, fontSize: 12.5 }}>Admission automatique, une par une.</div>
            </div>
          </div>
        </Reveal>
      )}

      {/* Contrôle d'entrée */}
      <Reveal i={4}>
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
        <Reveal i={5}>
          <div style={{ ...S.card, marginBottom: 14 }}>
            <div style={{ ...S.label, marginBottom: 14 }}>Ventes — 7 derniers jours</div>
            <SalesChart buyers={ev.buyers} />
          </div>
        </Reveal>
      )}

      {/* Répartition par catégorie */}
      <Reveal i={6}>
        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={{ ...S.label, marginBottom: 12 }}>Répartition par catégorie</div>
          <TierSplit ev={ev} />
        </div>
      </Reveal>

      {/* Demandes de remboursement */}
      {refunds.length > 0 && (
        <Reveal i={7}>
          <div style={{ ...S.card, marginBottom: 14 }}>
            <div style={{ ...S.label, marginBottom: 4 }}>Demandes de remboursement ({refunds.length})</div>
            {refunds.map((r, i) => {
              const b = ev.buyers.find((x) => x.id === r.buyerId);
              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 0",
                    borderBottom: i < refunds.length - 1 ? `1px solid ${C.line}` : "none",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{b ? b.name || "Client sans nom" : "Commande"}</div>
                    <div style={{ color: C.muted, fontSize: 12 }}>
                      {b ? `${b.qty} × ${b.tierName} · ${fmtFCFA(b.qty * b.unitPrice)}` : "Détails indisponibles"}
                    </div>
                  </div>
                  <button
                    className="tk-press"
                    disabled={resolvingId === r.id}
                    onClick={() => resolveRefund(r, true)}
                    style={{
                      background: C.pink,
                      border: "none",
                      color: "#FFFFFF",
                      borderRadius: 8,
                      padding: "7px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "'Space Grotesk', sans-serif",
                      opacity: resolvingId === r.id ? 0.5 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Annuler + rembourser
                  </button>
                  <button
                    className="tk-press"
                    disabled={resolvingId === r.id}
                    onClick={() => resolveRefund(r, false)}
                    style={{
                      background: "transparent",
                      border: `1px solid ${C.line}`,
                      color: C.text,
                      borderRadius: 8,
                      padding: "7px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "'Space Grotesk', sans-serif",
                      opacity: resolvingId === r.id ? 0.5 : 1,
                    }}
                  >
                    Refuser
                  </button>
                </div>
              );
            })}
          </div>
        </Reveal>
      )}

      {/* Acheteurs */}
      <Reveal i={8}>
        <BuyersList ev={ev} title="Acheteurs" />
      </Reveal>
    </div>
  );
}

/* ============================ Scanner anti-fraude (caméra QR + saisie manuelle) ============================ */
function Scanner({ ev, onBack, onMarkUsed, onRefresh }) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraErr, setCameraErr] = useState("");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const scanningRef = useRef(false);
  const resultRef = useRef(null);
  const checkRef = useRef(null);

  const usedCount = Object.keys(ev.used || {}).length;
  const sold = totalSold(ev);

  const findTicket = (id) => {
    for (const b of ev.buyers) {
      const entry = b.ids.find((x) => x.id === id);
      if (entry) return { holder: b.name || "Client sans nom", phone: b.phone, tierName: b.tierName, rank: entry.rank, cancelled: b.cancelled };
    }
    return null;
  };

  // Le QR encode désormais un lien de vérification signé (/v/{id}?s=...), pas
  // seulement l'ID du billet — la caméra lit ce lien tel quel. On en extrait
  // l'ID quel que soit le format scanné (lien complet ou code saisi à la main).
  const extractTicketId = (raw) => {
    const trimmed = (raw || "").trim();
    const m = trimmed.match(/\/v\/([A-Za-z0-9-]+)/i);
    return (m ? m[1] : trimmed).toUpperCase();
  };

  const check = useCallback(
    (rawId) => {
      const id = extractTicketId(rawId ?? input);
      if (!id) return;
      setScanning(true);
      setResult(null);
      setTimeout(async () => {
        const ticket = findTicket(id);
        if (!ticket) setResult({ status: "fraud", id });
        else if (ticket.cancelled) setResult({ status: "cancelled", id, ticket });
        else if (ev.used && ev.used[id]) setResult({ status: "used", id, ticket, usedAt: ev.used[id] });
        else {
          await onMarkUsed(id);
          setResult({ status: "valid", id, ticket });
        }
        setScanning(false);
      }, 900);
    },
    [ev, onMarkUsed, input]
  );

  useEffect(() => {
    scanningRef.current = scanning;
  }, [scanning]);
  useEffect(() => {
    resultRef.current = result;
  }, [result]);
  useEffect(() => {
    checkRef.current = check;
  }, [check]);

  // Les ventes se poursuivent pendant le contrôle d'entrée : on recharge
  // régulièrement les billets de l'événement pour reconnaître ceux achetés
  // depuis l'ouverture de cet écran.
  useEffect(() => {
    if (!onRefresh) return;
    const id = setInterval(onRefresh, 6000);
    return () => clearInterval(id);
  }, [onRefresh]);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data && !scanningRef.current && !resultRef.current) {
        setInput(code.data);
        checkRef.current?.(code.data);
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  }, []);

  const startCamera = async () => {
    setCameraErr("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraErr(
        "La caméra n'est pas accessible dans ce navigateur. Si tu as ouvert ce lien depuis WhatsApp ou une autre appli, ouvre-le plutôt dans Chrome ou Safari — sinon, utilise la saisie manuelle ci-dessous."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      let msg = "Impossible d'accéder à la caméra — utilise la saisie manuelle ci-dessous.";
      if (e.name === "NotAllowedError" || e.name === "SecurityError") {
        msg = "Accès à la caméra refusé. Autorise la caméra pour ce site dans les réglages de ton navigateur (souvent : appuie sur le cadenas à côté de l'adresse), puis réessaie.";
      } else if (e.name === "NotFoundError" || e.name === "OverconstrainedError") {
        msg = "Aucune caméra détectée sur cet appareil — utilise la saisie manuelle ci-dessous.";
      } else if (e.name === "NotReadableError") {
        msg = "La caméra est déjà utilisée par une autre application — ferme-la et réessaie.";
      }
      setCameraErr(msg);
    }
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  const reset = () => {
    setInput("");
    setResult(null);
  };

  const R = {
    valid: { bg: "rgba(18,166,107,.12)", border: C.green, icon: "✅", title: "BILLET VALIDE", color: C.green },
    used: { bg: "rgba(255,122,26,.12)", border: C.amber, icon: "⚠️", title: "DÉJÀ UTILISÉ", color: C.amber },
    fraud: { bg: "rgba(255,61,104,.12)", border: C.pink, icon: "🚫", title: "BILLET INCONNU — FRAUDE POSSIBLE", color: C.pink },
    cancelled: { bg: "rgba(255,61,104,.12)", border: C.pink, icon: "🚫", title: "BILLET ANNULÉ / REMBOURSÉ", color: C.pink },
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
            style={{
              position: "relative",
              height: 220,
              borderRadius: 14,
              border: `2px dashed ${scanning ? C.amber : C.line}`,
              overflow: "hidden",
              marginBottom: 14,
              background: C.surface2,
              transition: "border-color .3s ease",
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover", display: cameraOn ? "block" : "none" }}
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {!cameraOn && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 20px",
                  textAlign: "center",
                  color: C.muted,
                  fontSize: 13,
                }}
              >
                {cameraErr || "Active la caméra pour scanner le QR code du billet, ou saisis le code manuellement."}
              </div>
            )}
            {(cameraOn || scanning) && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: 3,
                  background: C.amber,
                  boxShadow: `0 0 16px ${C.amber}`,
                  animation: "tk-scanline 1.6s ease-in-out infinite alternate",
                }}
              />
            )}
          </div>

          <button className="tk-press" style={{ ...S.btnGhost, marginBottom: 14 }} onClick={cameraOn ? stopCamera : startCamera}>
            {cameraOn ? "Désactiver la caméra" : "📷 Scanner avec la caméra"}
          </button>

          <label style={S.label}>Ou saisis le code manuellement</label>
          <input
            style={{ ...S.input, textTransform: "uppercase" }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`${ticketPrefix(ev.name)}-XXXXXX`}
            onKeyDown={(e) => e.key === "Enter" && check()}
          />
          <button
            className="tk-press"
            style={{ ...S.btn, opacity: input.trim() && !scanning ? 1 : 0.4 }}
            disabled={!input.trim() || scanning}
            onClick={() => check()}
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
          {result.status === "cancelled" && (
            <div style={{ fontSize: 14, lineHeight: 1.7 }}>
              Billet de <b>{result.ticket.holder}</b> ({result.ticket.tierName}) — annulé et remboursé.
              <br />
              <span style={{ color: C.pink, fontWeight: 700 }}>🚫 Refuser l'entrée.</span>
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

/* ============================ TABLEAU DE BORD CLIENT ============================ */
function ClientDash({ profile, events, onLogout, onOpenEvent, onOpenedNew, notify }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("active");
  const [refundMap, setRefundMap] = useState({});

  const loadRefunds = useCallback(async () => {
    try {
      const reqs = await fetchMyRefundRequestsDB(profile.id);
      const map = {};
      for (const r of reqs) {
        // La demande la plus récente par commande fait foi.
        if (!map[r.buyerId] || r.requestedAt > map[r.buyerId].requestedAt) map[r.buyerId] = r;
      }
      setRefundMap(Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.status])));
    } catch (e) {
      console.error(e);
    }
  }, [profile.id]);

  useEffect(() => {
    loadRefunds();
  }, [loadRefunds]);

  const requestRefund = async (buyerId, eventCode) => {
    try {
      await requestRefundDB(buyerId, eventCode, profile.id);
      await loadRefunds();
      notify("Demande envoyée à l'organisateur.");
    } catch (e) {
      console.error(e);
      notify("Échec de la demande — réessaie.");
    }
  };

  const list = Object.values(events).sort((a, b) => b.ts - a.ts);
  const now = new Date();

  const allTickets = [];
  for (const e of list) {
    for (const b of e.buyers) {
      for (const entry of b.ids) {
        allTickets.push({
          id: entry.id,
          rank: entry.rank,
          buyerId: b.id,
          cancelled: b.cancelled,
          eventCode: e.code,
          eventName: e.name,
          date: e.date,
          time: e.time,
          venue: e.venue,
          city: e.city,
          posterUrl: e.posterUrl,
          momoNumber: e.momoNumber,
          tierName: b.tierName,
          unitPrice: b.unitPrice,
          buyerName: b.name,
          usedAt: (e.used && e.used[entry.id]) || null,
          ts: b.ts,
          eventDate: new Date(e.date + "T" + (e.time || "00:00")),
        });
      }
    }
  }
  allTickets.sort((a, b) => b.ts - a.ts);
  const active = allTickets.filter((t) => t.eventDate >= now);
  const history = allTickets.filter((t) => t.eventDate < now);
  const shown = tab === "active" ? active : history;

  const openByCode = async () => {
    // Le domaine réel (tiketapp-phi.vercel.app) était codé en dur à tort ici
    // sous un ancien nom ("tike.app") jamais déployé : coller le vrai lien
    // partagé ne matchait donc jamais et échouait silencieusement. On extrait
    // désormais le code depuis /e/CODE quel que soit le domaine, avec repli
    // sur la saisie brute si ce n'est pas une URL.
    const raw = code.trim();
    const pathMatch = raw.match(/\/e\/([A-Za-z0-9]+)/i);
    const clean = (pathMatch ? pathMatch[1] : raw).toUpperCase();
    if (!clean || busy) return;
    setErr("");
    setBusy(true);
    try {
      const found = await openEventByCode(clean);
      if (!found) {
        setErr("Aucun événement trouvé avec ce lien ou ce code.");
        return;
      }
      await recordEventAccess(profile.id, clean);
      onOpenedNew(clean, found);
      setCode("");
      onOpenEvent(clean);
    } catch (e) {
      console.error(e);
      notify("Erreur réseau — réessaie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Top title={`Salut, ${profile.name}`} right={<LogoutButton onClick={onLogout} />} />

      <Reveal i={0}>
        <div style={{ ...S.card, animation: err ? "tk-shake .4s both" : "none", marginBottom: 20 }}>
          <div style={S.label}>Ouvrir un événement</div>
          <input
            style={S.input}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setErr("");
            }}
            placeholder="Colle le lien reçu, ou entre juste le code (ex. ABC123)"
            onKeyDown={(e) => e.key === "Enter" && openByCode()}
          />
          {err && <div style={{ color: C.pink, fontSize: 13, marginBottom: 12 }}>{err}</div>}
          <button className="tk-press" style={{ ...S.btn, opacity: code.trim() && !busy ? 1 : 0.4 }} disabled={!code.trim() || busy} onClick={openByCode}>
            {busy ? "Recherche…" : "Ouvrir"}
          </button>
        </div>
      </Reveal>

      <Reveal i={1}>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { id: "active", label: `Billets en cours (${active.length})` },
            { id: "history", label: `Historique (${history.length})` },
          ].map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className="tk-press"
              style={{
                flex: 1,
                padding: "10px 8px",
                borderRadius: 10,
                border: `1px solid ${C.line}`,
                background: tab === tb.id ? C.amber : C.surface2,
                color: tab === tb.id ? C.amberDark : C.text,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {tb.label}
            </button>
          ))}
        </div>
      </Reveal>

      {shown.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="tk-list-grid">
            {shown.map((t, i) => (
              <TicketCard
                key={t.id}
                t={t}
                i={i}
                muted={tab === "history"}
                refundStatus={refundMap[t.buyerId]}
                onRequestRefund={tab === "active" ? () => requestRefund(t.buyerId, t.eventCode) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {tab === "active" &&
        (list.length > 0 ? (
          <div style={{ marginBottom: 20 }}>
            <div style={{ ...S.label, marginBottom: 12 }}>Mes événements</div>
            <div className="tk-list-grid">
              {list.map((e, i) => (
                <Reveal key={e.code} i={i}>
                  <button
                    onClick={() => onOpenEvent(e.code)}
                    className="tk-press tk-lift"
                    style={{ ...S.card, textAlign: "left", cursor: "pointer", color: C.text, width: "100%" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{e.name}</div>
                      <div style={{ color: e.buyers.length ? C.green : C.muted, fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>
                        {e.buyers.length ? "Billet acheté" : "Pas encore acheté"}
                      </div>
                    </div>
                    <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
                      {e.date} · {e.venue}, {e.city}
                    </div>
                  </button>
                </Reveal>
              ))}
            </div>
          </div>
        ) : (
          <Reveal i={2}>
            <div style={{ ...S.card, textAlign: "center", color: C.muted, fontSize: 14 }}>
              Aucun événement pour l'instant. Ouvre le lien reçu d'un organisateur pour commencer.
            </div>
          </Reveal>
        ))}

      {tab === "history" && shown.length === 0 && (
        <Reveal i={2}>
          <div style={{ ...S.card, textAlign: "center", color: C.muted, fontSize: 14 }}>Aucun billet dans l'historique pour l'instant.</div>
        </Reveal>
      )}
    </div>
  );
}

/* ============================ Détail événement (client) ============================ */
function ClientEvent({ ev, onBack, onBuy }) {
  const d = ev.date ? new Date(ev.date + "T" + (ev.time || "00:00")) : null;
  const dateStr = d ? d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ev.date;
  const anyLeft = ev.tiers.some((t) => t.capacity - tierSold(ev, t.id) > 0);

  return (
    <div>
      <Top title="Événement" onBack={onBack} />
      <Reveal i={0}>
        <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
          {ev.posterUrl && <img src={ev.posterUrl} alt="" style={{ width: "100%", display: "block", aspectRatio: "4 / 5", objectFit: "cover" }} />}
          <div style={{ background: HERO_GRADIENT, padding: "26px 20px 22px" }}>
            <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,.85)", fontWeight: 700 }}>
              Invitation
            </div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 24, lineHeight: 1.15, margin: "8px 0 10px", color: "#FFFFFF" }}>
              {ev.name}
            </div>
            <div style={{ color: "rgba(255,255,255,.92)", fontSize: 14.5, lineHeight: 1.7, marginBottom: 16 }}>
              📅 {dateStr} à {ev.time}
              <br />
              📍 {ev.venue}, {ev.city}
            </div>
            {d && <Countdown target={d.getTime()} />}
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
function Payment({ ev, profile, onBack, onPaid }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(profile.name || "");
  const [phone, setPhone] = useState(profile.phone || "");
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
      const t = setTimeout(
        () => onPaid({ buyerName: ev.requireBuyerName ? name : null, buyerPhone: phone, qty, operator: op, tier }),
        2600
      );
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
                    background: sel ? "rgba(255,122,26,.08)" : C.surface2,
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

          {ev.requireBuyerName && (
            <>
              <label style={S.label}>Ton nom (sur le billet)</label>
              <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom complet" />
            </>
          )}
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
            style={{ ...S.btn, opacity: (!ev.requireBuyerName || name) && phone && op && tier ? 1 : 0.4 }}
            disabled={(ev.requireBuyerName && !name) || !phone || !op || !tier}
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

/* ============================ SUPER ADMIN ============================ */
function AccountRow({ p, eventCount, onSuspend, onDelete, busy }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 0",
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
          {p.suspended && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.pink,
                background: "rgba(255,61,104,.12)",
                border: `1px solid ${C.pink}`,
                borderRadius: 999,
                padding: "2px 8px",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                flexShrink: 0,
              }}
            >
              Suspendu
            </div>
          )}
        </div>
        <div style={{ color: C.muted, fontSize: 12 }}>
          {p.phone || "—"}
          {eventCount != null && ` · ${eventCount} événement${eventCount > 1 ? "s" : ""}`}
        </div>
      </div>
      <button
        className="tk-press"
        disabled={busy}
        onClick={() => onSuspend(p.id, !p.suspended)}
        style={{
          background: "transparent",
          border: `1px solid ${C.line}`,
          color: C.text,
          borderRadius: 8,
          padding: "7px 10px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
          whiteSpace: "nowrap",
          opacity: busy ? 0.5 : 1,
        }}
      >
        {p.suspended ? "Réactiver" : "Suspendre"}
      </button>
      <button
        className="tk-press"
        disabled={busy}
        onClick={() => {
          if (window.confirm(`Supprimer définitivement le compte de ${p.name} ? Cette action est irréversible.`)) onDelete(p.id);
        }}
        style={{
          background: "transparent",
          border: `1px solid ${C.pink}`,
          color: C.pink,
          borderRadius: 8,
          padding: "7px 10px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
          opacity: busy ? 0.5 : 1,
        }}
      >
        Suppr.
      </button>
    </div>
  );
}

function AdminOverview({ profile, data, onLogout, onNav, notify }) {
  const { profiles, events } = data;
  const organizers = profiles.filter((p) => p.role === "organizer");
  const clients = profiles.filter((p) => p.role === "client");
  const totalAvailable = events.reduce((s, e) => s + availableFunds(e), 0);

  return (
    <div>
      <Top title={`Admin — ${profile.name}`} right={<LogoutButton onClick={onLogout} />} />

      {/* Navigation vers les autres pages admin */}
      <Reveal i={0}>
        <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
          {[
            { id: "adminFinance", icon: "💰", label: "Finances", count: `${fmtShort(totalAvailable)} FCFA disponibles` },
            { id: "adminOrganizers", icon: "🎤", label: "Organisateurs", count: `${organizers.length} au total` },
            { id: "adminClients", icon: "🎟️", label: "Clients", count: `${clients.length} au total` },
            { id: "adminEvents", icon: "📅", label: "Événements", count: `${events.length} au total` },
          ].map((x) => (
            <button
              key={x.id}
              onClick={() => onNav(x.id)}
              className="tk-press tk-lift"
              style={{ ...S.card, display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer", color: C.text, width: "100%" }}
            >
              <div style={{ fontSize: 24 }}>{x.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{x.label}</div>
                <div style={{ color: C.muted, fontSize: 12.5 }}>{x.count}</div>
              </div>
              <div style={{ color: C.muted, fontSize: 18 }}>→</div>
            </button>
          ))}
        </div>
      </Reveal>
    </div>
  );
}

function AdminFinance({ data, onBack, onOpenEvent, notify }) {
  const { profiles, events } = data;
  const organizers = profiles.filter((p) => p.role === "organizer");

  const totalRevenue = events.reduce((s, e) => s + revenue(e), 0);
  const totalCommission = events.reduce((s, e) => s + commissionAmount(e), 0);
  const totalNet = events.reduce((s, e) => s + netRevenue(e), 0);
  const totalWithdrawn = events.reduce((s, e) => s + withdrawnTotal(e), 0);
  const totalAvailable = events.reduce((s, e) => s + availableFunds(e), 0);
  const totalTickets = events.reduce((s, e) => s + totalSold(e), 0);
  const revAnim = useCountUp(totalCommission);

  const allWithdrawals = events
    .flatMap((e) => (e.withdrawals || []).map((w) => ({ ...w, eventName: e.name })))
    .sort((a, b) => b.ts - a.ts);

  const sortedEvents = events.slice().sort((a, b) => availableFunds(b) - availableFunds(a));

  const exportCommissionsCSV = () => {
    const rows = [["Organisateur", "Téléphone", "Événements", "Revenu brut (FCFA)", "Commission (FCFA)"]];
    for (const p of organizers) {
      const orgEvents = events.filter((e) => e.creatorId === p.id);
      const rev = orgEvents.reduce((s, e) => s + revenue(e), 0);
      const comm = orgEvents.reduce((s, e) => s + commissionAmount(e), 0);
      rows.push([p.name, p.phone || "", orgEvents.length, Math.round(rev), Math.round(comm)]);
    }
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tike-commissions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Export CSV téléchargé.");
  };

  return (
    <div>
      <Top title="Finances" onBack={onBack} />

      {/* Commissions plateforme */}
      <Reveal i={0}>
        <div style={{ ...S.card, background: HERO_GRADIENT, marginBottom: 14 }}>
          <div style={{ color: "rgba(255,255,255,.8)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
            Commissions collectées
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 26, color: "#FFFFFF", letterSpacing: -0.5 }}>
            {fmtFCFA(revAnim)}
          </div>
          <div style={{ color: "rgba(255,255,255,.85)", fontSize: 12, marginTop: 6 }}>
            sur {fmtFCFA(totalRevenue)} de revenus bruts, {totalTickets} billets vendus
          </div>
        </div>
      </Reveal>

      <Reveal i={1}>
        <div className="tk-kpi-grid">
          {[
            { k: "Reversé aux organisateurs", v: fmtShort(totalNet), c: C.text },
            { k: "Déjà retiré", v: fmtShort(totalWithdrawn), c: C.blue },
            { k: "Disponible (non retiré)", v: fmtShort(totalAvailable), c: C.amber },
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

      <Reveal i={2}>
        <button className="tk-press" style={{ ...S.btnGhost, marginBottom: 20 }} onClick={exportCommissionsCSV}>
          ⬇ Exporter les commissions par organisateur (CSV)
        </button>
      </Reveal>

      {/* Fonds par événement */}
      <Reveal i={3}>
        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={S.label}>Fonds disponibles par événement</div>
          {sortedEvents.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13.5 }}>Aucun événement pour l'instant.</div>
          ) : (
            sortedEvents.map((e, i) => {
              const org = profiles.find((p) => p.id === e.creatorId);
              return (
                <button
                  key={e.code}
                  onClick={() => onOpenEvent(e.code)}
                  className="tk-press"
                  style={{
                    width: "100%",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "'Space Grotesk', sans-serif",
                    color: C.text,
                    display: "block",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 0",
                      borderBottom: i < sortedEvents.length - 1 ? `1px solid ${C.line}` : "none",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {e.name}
                      </div>
                      <div style={{ color: C.muted, fontSize: 12 }}>
                        {org ? org.name : "—"} · {fmtFCFA(revenue(e))} brut
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: availableFunds(e) > 0 ? C.amber : C.muted }}>{fmtFCFA(availableFunds(e))}</div>
                      <div style={{ color: C.muted, fontSize: 11 }}>disponible</div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </Reveal>

      {/* Historique des retraits */}
      <Reveal i={4}>
        <div style={S.card}>
          <div style={S.label}>Historique des retraits ({allWithdrawals.length})</div>
          {allWithdrawals.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13.5 }}>Aucun retrait effectué pour l'instant.</div>
          ) : (
            allWithdrawals.map((w, i) => (
              <div
                key={w.id}
                style={{ padding: "10px 0", borderBottom: i < allWithdrawals.length - 1 ? `1px solid ${C.line}` : "none" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, gap: 10 }}>
                  <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.eventName}</div>
                  <div style={{ color: C.green, fontWeight: 700, flexShrink: 0 }}>{fmtFCFA(w.amount)}</div>
                </div>
                <div style={{ color: C.muted, fontSize: 12 }}>
                  {w.phone} · {fmtDateTime(w.ts)}
                </div>
                {w.reason && <div style={{ color: C.muted, fontSize: 12, marginTop: 2, fontStyle: "italic" }}>« {w.reason} »</div>}
              </div>
            ))
          )}
        </div>
      </Reveal>
    </div>
  );
}

function AdminOrganizers({ data, onBack, onSuspend, onDeleteAccount }) {
  const [busyId, setBusyId] = useState(null);
  const organizers = data.profiles.filter((p) => p.role === "organizer").sort((a, b) => a.name.localeCompare(b.name));
  const eventsByOrganizer = {};
  for (const e of data.events) eventsByOrganizer[e.creatorId] = (eventsByOrganizer[e.creatorId] || 0) + 1;

  const wrapSuspend = async (userId, suspended) => {
    setBusyId(userId);
    await onSuspend(userId, suspended);
    setBusyId(null);
  };
  const wrapDeleteAccount = async (userId) => {
    setBusyId(userId);
    await onDeleteAccount(userId);
    setBusyId(null);
  };

  return (
    <div>
      <Top title={`Organisateurs (${organizers.length})`} onBack={onBack} />
      <Reveal i={0}>
        <div style={S.card}>
          {organizers.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13.5, padding: "10px 0" }}>Aucun organisateur inscrit.</div>
          ) : (
            organizers.map((p) => (
              <AccountRow
                key={p.id}
                p={p}
                eventCount={eventsByOrganizer[p.id] || 0}
                busy={busyId === p.id}
                onSuspend={wrapSuspend}
                onDelete={wrapDeleteAccount}
              />
            ))
          )}
        </div>
      </Reveal>
    </div>
  );
}

function AdminClients({ data, onBack, onSuspend, onDeleteAccount }) {
  const [busyId, setBusyId] = useState(null);
  const clients = data.profiles.filter((p) => p.role === "client").sort((a, b) => a.name.localeCompare(b.name));

  const wrapSuspend = async (userId, suspended) => {
    setBusyId(userId);
    await onSuspend(userId, suspended);
    setBusyId(null);
  };
  const wrapDeleteAccount = async (userId) => {
    setBusyId(userId);
    await onDeleteAccount(userId);
    setBusyId(null);
  };

  return (
    <div>
      <Top title={`Clients (${clients.length})`} onBack={onBack} />
      <Reveal i={0}>
        <div style={S.card}>
          {clients.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13.5, padding: "10px 0" }}>Aucun client inscrit.</div>
          ) : (
            clients.map((p) => <AccountRow key={p.id} p={p} busy={busyId === p.id} onSuspend={wrapSuspend} onDelete={wrapDeleteAccount} />)
          )}
        </div>
      </Reveal>
    </div>
  );
}

function AdminEvents({ data, onBack, onOpen }) {
  const events = data.events.slice().sort((a, b) => b.ts - a.ts);
  return (
    <div>
      <Top title={`Événements (${events.length})`} onBack={onBack} />
      <Reveal i={0}>
        <div style={S.card}>
          {events.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13.5, padding: "10px 0" }}>Aucun événement pour l'instant.</div>
          ) : (
            events.map((e, i) => (
              <button
                key={e.code}
                onClick={() => onOpen(e.code)}
                className="tk-press"
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "'Space Grotesk', sans-serif",
                  color: C.text,
                  display: "block",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 0",
                    borderBottom: i < events.length - 1 ? `1px solid ${C.line}` : "none",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {e.name}
                    </div>
                    <div style={{ color: C.muted, fontSize: 12 }}>
                      {e.date} · {e.venue}, {e.city} · {fmtFCFA(revenue(e))}
                    </div>
                  </div>
                  {e.commissionOverride != null && (
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: C.amber,
                        background: "rgba(255,122,26,.12)",
                        border: `1px solid ${C.amber}`,
                        borderRadius: 999,
                        padding: "2px 8px",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {Math.round(e.commissionOverride * 100)}%
                    </div>
                  )}
                  <div style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>→</div>
                </div>
              </button>
            ))
          )}
        </div>
      </Reveal>
    </div>
  );
}

function AdminEventDetail({ ev, onBack, onDeleteEvent, onSetCommission, notify }) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(ev.commissionOverride != null ? String(Math.round(ev.commissionOverride * 1000) / 10) : "");
  const [savingCommission, setSavingCommission] = useState(false);

  const rev = revenue(ev);
  const comm = commissionAmount(ev);
  const sold = totalSold(ev);
  const effectiveRate = rev > 0 ? (comm / rev) * 100 : null;

  const saveCommission = async () => {
    const trimmed = pct.trim();
    const n = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && (isNaN(n) || n < 0 || n > 100)) {
      notify("Pourcentage invalide (entre 0 et 100).");
      return;
    }
    setSavingCommission(true);
    try {
      await onSetCommission(ev.code, n === null ? null : n / 100);
      notify(n === null ? "Retour aux paliers par défaut." : `Commission fixée à ${n}%.`);
    } catch (e) {
      console.error(e);
      notify("Échec de la mise à jour.");
    } finally {
      setSavingCommission(false);
    }
  };

  const del = async () => {
    if (!window.confirm(`Supprimer définitivement « ${ev.name} » et toutes ses ventes ?`)) return;
    setBusy(true);
    await onDeleteEvent(ev.code);
    setBusy(false);
  };

  return (
    <div>
      <Top title={ev.name} onBack={onBack} />

      {ev.posterUrl && (
        <Reveal i={0}>
          <img
            src={ev.posterUrl}
            alt=""
            style={{ width: "100%", display: "block", aspectRatio: "16 / 9", objectFit: "cover", objectPosition: "center", borderRadius: 18, marginBottom: 14 }}
          />
        </Reveal>
      )}

      <Reveal i={1}>
        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={S.label}>Revenu brut</div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 22, color: C.amber }}>{fmtFCFA(rev)}</div>
          <div style={{ color: C.muted, fontSize: 12.5, marginTop: 8 }}>
            {ev.date} · {ev.venue}, {ev.city}
          </div>
        </div>
      </Reveal>

      <Reveal i={2}>
        <div className="tk-kpi-grid">
          {[
            { k: "Billets vendus", v: sold, c: C.text },
            { k: "Commission", v: fmtShort(comm), c: C.pink },
            { k: "Taux effectif", v: effectiveRate != null ? `${effectiveRate.toFixed(1)}%` : "—", c: C.blue },
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

      <Reveal i={3}>
        <div style={{ marginBottom: 14 }}>
          <BuyersList ev={ev} title="Transactions" />
        </div>
      </Reveal>

      <Reveal i={4}>
        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={S.label}>Commission personnalisée</div>
          <div style={{ color: C.muted, fontSize: 12.5, margin: "8px 0 12px", lineHeight: 1.5 }}>
            {ev.commissionOverride != null
              ? `Un taux fixe de ${Math.round(ev.commissionOverride * 100)}% s'applique à cet événement, à la place des paliers par défaut (10% / 20%).`
              : "Cet événement utilise les paliers par défaut (10% jusqu'à 5 000 FCFA, 20% au-delà)."}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
            <input
              style={{ ...S.input, marginBottom: 0, flex: 1 }}
              inputMode="decimal"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="Laisser vide = paliers par défaut"
            />
            <span style={{ color: C.muted, fontSize: 14, flexShrink: 0 }}>%</span>
          </div>
          <button
            className="tk-press"
            style={{ ...S.btn, opacity: savingCommission ? 0.6 : 1 }}
            disabled={savingCommission}
            onClick={saveCommission}
          >
            {savingCommission ? "…" : "Enregistrer"}
          </button>
        </div>
      </Reveal>

      <Reveal i={5}>
        <button className="tk-press" style={{ ...S.btn, background: C.pink, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={del}>
          {busy ? "…" : "Supprimer l'événement"}
        </button>
      </Reveal>
    </div>
  );
}

/* ============================ SALLE D'ATTENTE ============================ */
function Queue({ ev, profile, onAdmitted, onBack, notify }) {
  const [position, setPosition] = useState(null);
  const [err, setErr] = useState("");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let interval;

    const tick = async () => {
      try {
        const admitted = await tryAdmitSelfDB(ev.code);
        if (admitted) {
          if (!cancelled) onAdmitted();
          return;
        }
        const pos = await queuePositionDB(ev.code);
        if (!cancelled) setPosition(pos);
      } catch (e) {
        console.error(e);
      }
    };

    (async () => {
      try {
        const alreadyAdmitted = await joinQueueDB(ev.code, profile.id);
        if (alreadyAdmitted) {
          if (!cancelled) onAdmitted();
          return;
        }
        await tick();
        if (!cancelled) interval = setInterval(tick, 1500);
      } catch (e) {
        console.error(e);
        if (!cancelled) setErr("Impossible de rejoindre la file d'attente — réessaie.");
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ev.code, profile.id]); // eslint-disable-line

  const leave = async () => {
    setLeaving(true);
    try {
      await leaveQueueDB(ev.code, profile.id);
    } catch (e) {
      console.error(e);
      notify("Erreur réseau — réessaie.");
      setLeaving(false);
      return;
    }
    onBack();
  };

  return (
    <div>
      <Top title="File d'attente" />
      <Reveal i={0}>
        <div style={{ ...S.card, textAlign: "center", padding: "36px 24px" }}>
          <div style={{ fontSize: 42, marginBottom: 14, animation: "tk-float 2.4s ease-in-out infinite" }}>⏳</div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 20, marginBottom: 10, lineHeight: 1.3 }}>
            {position === null
              ? "Connexion à la file…"
              : position === 0
              ? "C'est presque ton tour…"
              : `Tu es ${position + 1}ᵉ dans la file`}
          </div>
          <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
            Forte demande pour <b style={{ color: C.text }}>{ev.name}</b>. On te laisse passer automatiquement — reste sur cette
            page, pas besoin de rafraîchir.
          </div>
          <div style={{ height: 8, borderRadius: 999, background: C.surface2, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: "45%",
                borderRadius: 999,
                background: `linear-gradient(90deg, ${C.amber}, ${C.pink})`,
                backgroundSize: "220% 100%",
                animation: "tk-shimmer 1.3s linear infinite",
              }}
            />
          </div>
          {err && <div style={{ color: C.pink, fontSize: 13, marginTop: 18 }}>{err}</div>}
          <button className="tk-press" style={{ ...S.btnGhost, marginTop: 26 }} disabled={leaving} onClick={leave}>
            {leaving ? "…" : "Quitter la file"}
          </button>
        </div>
      </Reveal>
    </div>
  );
}
