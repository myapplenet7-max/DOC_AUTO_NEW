// @ts-nocheck
import { useState, useEffect } from "react";

const API = "/api";

async function apiFetch(path, opts = {}, token = null) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

function Badge({ children, color = "slate" }) {
  const colors = { slate: "bg-slate-100 text-slate-700", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", yellow: "bg-amber-50 text-amber-700", blue: "bg-indigo-50 text-indigo-700" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>{children}</span>;
}

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-xl border border-slate-100 shadow-sm ${className}`}>{children}</div>;
}

const Spinner = () => <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>;

function Lightbox({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white text-sm hover:text-slate-300 flex items-center gap-1">✕ Close</button>
        <img src={src} alt="Payment screenshot" className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]" />
      </div>
    </div>
  );
}

function PaymentCard({ payment, token, onReviewed }) {
  const [loadingAction, setLoadingAction] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);

  const screenshotUrl = `${API}/admin/payments/screenshot/${payment.id}`;
  const authUrl = `${screenshotUrl}?token=${token}`;

  const review = async (status, note = "") => {
    setLoadingAction(status);
    try {
      await apiFetch(`/admin/payments/${payment.id}/review`, {
        method: "PUT",
        body: JSON.stringify({ status, admin_note: note || undefined }),
      }, token);
      onReviewed();
    } catch (e) { alert(e.message); }
    setLoadingAction(null);
  };

  return (
    <>
      {lightboxOpen && <Lightbox src={authUrl} onClose={() => setLightboxOpen(false)} />}
      <Card className="p-4">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            {payment.screenshot_path ? (
              <div className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity bg-slate-100 flex items-center justify-center" onClick={() => setLightboxOpen(true)} title="Click to enlarge">
                {!imgError ? (
                  <>
                    {!imgLoaded && <Spinner />}
                    <img src={authUrl} alt="Screenshot" className={`w-full h-full object-cover transition-opacity ${imgLoaded ? "opacity-100" : "opacity-0 absolute"}`} onLoad={() => setImgLoaded(true)} onError={() => setImgError(true)} />
                  </>
                ) : (
                  <div className="text-xs text-slate-400 text-center p-1">No image</div>
                )}
              </div>
            ) : (
              <div className="w-20 h-20 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-slate-300 text-xs text-center">No screenshot</div>
            )}
            {payment.screenshot_path && !imgError && (
              <button onClick={() => setLightboxOpen(true)} className="text-xs text-indigo-600 hover:underline mt-1 block text-center w-full">View full</button>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="font-semibold text-slate-900">₹{payment.amount} → {payment.credits} credits</div>
                <div className="text-xs text-slate-500 mt-0.5">User #{payment.user_id} · {new Date(payment.created_at).toLocaleString("en-IN")}</div>
                {payment.upi_ref && <div className="text-xs text-slate-500 mt-0.5 font-mono">UTR: {payment.upi_ref}</div>}
              </div>
              <Badge color="yellow">Pending</Badge>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button onClick={() => review("approved")} disabled={loadingAction !== null} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all">
                {loadingAction === "approved" ? <Spinner /> : "✓"} Approve
              </button>
              {!showRejectBox ? (
                <button onClick={() => setShowRejectBox(true)} disabled={loadingAction !== null} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-all">✕ Reject</button>
              ) : (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <input autoFocus value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Reason (optional)" className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-red-400 min-w-0" onKeyDown={e => { if (e.key === "Enter") review("rejected", rejectNote); if (e.key === "Escape") setShowRejectBox(false); }} />
                  <button onClick={() => review("rejected", rejectNote)} disabled={loadingAction !== null} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 whitespace-nowrap">{loadingAction === "rejected" ? "…" : "Confirm Reject"}</button>
                  <button onClick={() => setShowRejectBox(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}

export default function AdminPage({ token }) {
  const [tab, setTab] = useState("payments");
  const [payments, setPayments] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [p, u, s] = await Promise.all([
        apiFetch("/admin/payments/pending", {}, token),
        apiFetch("/admin/users", {}, token),
        apiFetch("/admin/stats", {}, token),
      ]);
      setPayments(p); setUsers(u); setStats(s);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xl">🛡️</span>
        <h2 className="text-xl font-bold text-slate-900">Admin Panel</h2>
      </div>
      {stats && (
        <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-4">
          {[
            { label: "Users",     value: stats.total_users,     icon: "👤" },
            { label: "Documents", value: stats.total_documents,  icon: "📄" },
            { label: "Pending",   value: stats.pending_payments, icon: "⏳" },
            { label: "Revenue",   value: `₹${stats.total_revenue}`, icon: "💰" },
          ].map(s => (
            <Card key={s.label} className="p-4 text-center">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-xl font-bold text-slate-900">{s.value}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </Card>
          ))}
        </div>
      )}
      <div className="flex bg-slate-100 rounded-lg p-1 mb-6 w-fit">
        {["payments", "users"].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-all ${tab === t ? "bg-white shadow text-slate-900" : "text-slate-500"}`}>
            {t === "payments" ? `Pending Payments (${payments.length})` : `Users (${users.length})`}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-slate-500"><Spinner /> Loading…</div>
      ) : tab === "payments" ? (
        <div className="flex flex-col gap-3">
          {payments.length === 0 ? (
            <Card className="p-10 text-center text-slate-400"><div className="text-3xl mb-2">✅</div>No pending payments</Card>
          ) : payments.map(p => (
            <PaymentCard key={p.id} payment={p} token={token} onReviewed={load} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map(u => (
            <Card key={u.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900 text-sm">{u.name}</div>
                <div className="text-xs text-slate-500">{u.mobile}{u.email ? ` · ${u.email}` : ""}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-900">🎟️ {u.credits} credits</span>
                <Badge color={u.role === "admin" ? "blue" : "slate"}>{u.role}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
