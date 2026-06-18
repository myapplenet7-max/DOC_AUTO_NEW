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
  const colors = {
    slate:  "bg-slate-100 text-slate-700",
    green:  "bg-emerald-50 text-emerald-700 border border-emerald-200",
    red:    "bg-red-50 text-red-700 border border-red-200",
    yellow: "bg-amber-50 text-amber-700 border border-amber-200",
    blue:   "bg-indigo-50 text-indigo-700 border border-indigo-200",
    purple: "bg-purple-50 text-purple-700 border border-purple-200",
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[color]}`}>{children}</span>;
}

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>{children}</div>;
}

const Spinner = () => (
  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
  </svg>
);

function Alert({ type = "info", children, className = "" }) {
  const styles = {
    info:    "bg-indigo-50 text-indigo-800 border-indigo-200",
    success: "bg-emerald-50 text-emerald-800 border-emerald-200",
    error:   "bg-red-50 text-red-800 border-red-200",
    warning: "bg-amber-50 text-amber-800 border-amber-200",
  };
  return <div className={`px-4 py-3 rounded-xl border text-sm ${styles[type]} ${className}`}>{children}</div>;
}

function Lightbox({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white text-sm hover:text-slate-300 flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-lg">
          ✕ Close (Esc)
        </button>
        <img src={src} alt="Payment screenshot" className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]" />
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
  const [actionMsg, setActionMsg] = useState("");

  const screenshotUrl = `${API}/admin/payments/screenshot/${payment.id}`;
  const authUrl = `${screenshotUrl}?token=${token}`;

  const review = async (status, note = "") => {
    setLoadingAction(status);
    setActionMsg("");
    try {
      await apiFetch(`/admin/payments/${payment.id}/review`, {
        method: "PUT",
        body: JSON.stringify({ status, admin_note: note || undefined }),
      }, token);
      onReviewed();
    } catch (e) {
      setActionMsg(e.message);
      setLoadingAction(null);
    }
  };

  return (
    <>
      {lightboxOpen && <Lightbox src={authUrl} onClose={() => setLightboxOpen(false)} />}
      <Card className="p-4 lg:p-5">
        <div className="flex gap-4">
          {/* Screenshot thumbnail */}
          <div className="flex-shrink-0">
            {payment.screenshot_path ? (
              <div>
                <div
                  className="w-20 h-20 lg:w-24 lg:h-24 rounded-xl overflow-hidden border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity bg-slate-100 flex items-center justify-center"
                  onClick={() => setLightboxOpen(true)}
                  title="Click to enlarge"
                >
                  {!imgError ? (
                    <>
                      {!imgLoaded && <Spinner />}
                      <img
                        src={authUrl}
                        alt="Screenshot"
                        className={`w-full h-full object-cover transition-opacity ${imgLoaded ? "opacity-100" : "opacity-0 absolute"}`}
                        onLoad={() => setImgLoaded(true)}
                        onError={() => setImgError(true)}
                      />
                    </>
                  ) : (
                    <div className="text-xs text-slate-400 text-center p-2">No image</div>
                  )}
                </div>
                {!imgError && (
                  <button onClick={() => setLightboxOpen(true)} className="text-xs text-indigo-600 hover:underline mt-1 block text-center w-full">
                    View full
                  </button>
                )}
              </div>
            ) : (
              <div className="w-20 h-20 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-slate-300 text-xs text-center p-2">
                No screenshot
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
              <div>
                <div className="font-bold text-slate-900 text-base">₹{payment.amount} → {payment.credits} credits</div>
                <div className="text-xs text-slate-500 mt-0.5">User #{payment.user_id} · {new Date(payment.created_at).toLocaleString("en-IN")}</div>
                {payment.upi_ref && (
                  <div className="text-xs text-slate-600 mt-0.5 font-mono bg-slate-50 px-2 py-0.5 rounded inline-block">
                    UTR: {payment.upi_ref}
                  </div>
                )}
              </div>
              <Badge color="yellow">Pending</Badge>
            </div>

            {actionMsg && <Alert type="error" className="mb-2 text-xs">{actionMsg}</Alert>}

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={() => review("approved")}
                disabled={loadingAction !== null}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all active:scale-95 shadow-sm"
              >
                {loadingAction === "approved" ? <Spinner /> : "✓"} Approve
              </button>
              {!showRejectBox ? (
                <button
                  onClick={() => setShowRejectBox(true)}
                  disabled={loadingAction !== null}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-all active:scale-95 shadow-sm"
                >
                  ✕ Reject
                </button>
              ) : (
                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                  <input
                    autoFocus
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="Rejection reason (optional)"
                    className="flex-1 min-w-32 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    onKeyDown={e => {
                      if (e.key === "Enter") review("rejected", rejectNote);
                      if (e.key === "Escape") setShowRejectBox(false);
                    }}
                  />
                  <button
                    onClick={() => review("rejected", rejectNote)}
                    disabled={loadingAction !== null}
                    className="px-4 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 whitespace-nowrap shadow-sm"
                  >
                    {loadingAction === "rejected" ? "…" : "Confirm Reject"}
                  </button>
                  <button onClick={() => setShowRejectBox(false)} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}

function UserRow({ user, token, onUpdated }) {
  const [adjusting, setAdjusting] = useState(false);
  const [delta, setDelta] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const adjust = async () => {
    const d = parseInt(delta);
    if (isNaN(d) || d === 0) { setMsg("Enter a non-zero number"); return; }
    setLoading(true); setMsg("");
    try {
      const r = await apiFetch(`/admin/users/${user.id}/credits`, {
        method: "PUT", body: JSON.stringify({ delta: d }),
      }, token);
      setMsg(`✅ Credits updated to ${r.credits}`);
      setDelta(""); setAdjusting(false);
      onUpdated();
    } catch (e) { setMsg(e.message); }
    setLoading(false);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold shrink-0">
            {user.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <div>
            <div className="font-semibold text-slate-900 flex items-center gap-2">
              {user.name}
              <Badge color={user.role === "admin" ? "purple" : "slate"}>{user.role}</Badge>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{user.mobile}{user.email ? ` · ${user.email}` : ""}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            {user.role === "admin" ? (
              <div className="text-sm font-bold text-purple-600">∞ Unlimited</div>
            ) : (
              <div className="text-sm font-bold text-slate-900">🎟️ {user.credits} credits</div>
            )}
            <div className="text-xs text-slate-400">Joined {new Date(user.created_at).toLocaleDateString("en-IN")}</div>
          </div>
          {user.role !== "admin" && (
            <button
              onClick={() => setAdjusting(a => !a)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-50 transition-all"
            >
              Adjust
            </button>
          )}
        </div>
      </div>
      {adjusting && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
          <input
            type="number"
            value={delta}
            onChange={e => setDelta(e.target.value)}
            placeholder="+10 or -5"
            className="w-28 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onKeyDown={e => { if (e.key === "Enter") adjust(); }}
            autoFocus
          />
          <button onClick={adjust} disabled={loading} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {loading ? "…" : "Apply"}
          </button>
          <button onClick={() => { setAdjusting(false); setMsg(""); }} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          {msg && <span className="text-xs font-medium text-emerald-600">{msg}</span>}
        </div>
      )}
    </Card>
  );
}

export default function AdminPage({ token }) {
  const [tab, setTab] = useState("payments");
  const [payments, setPayments] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [p, u, s] = await Promise.all([
        apiFetch("/admin/payments/pending", {}, token),
        apiFetch("/admin/users", {}, token),
        apiFetch("/admin/stats", {}, token),
      ]);
      setPayments(p); setUsers(u); setStats(s);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-xl">🛡️</div>
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-slate-900">Admin Panel</h2>
            <p className="text-slate-500 text-sm">Manage users, payments and platform stats</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 hover:bg-slate-50 transition-all"
        >
          🔄 Refresh
        </button>
      </div>

      {error && <Alert type="error" className="mb-5">{error}</Alert>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
          {[
            { label: "Total Users",    value: stats.total_users,      icon: "👤", color: "bg-blue-50 text-blue-700" },
            { label: "Documents",      value: stats.total_documents,   icon: "📄", color: "bg-slate-50 text-slate-700" },
            { label: "Pending",        value: stats.pending_payments,  icon: "⏳", color: stats.pending_payments > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-700" },
            { label: "Total Revenue",  value: `₹${stats.total_revenue}`, icon: "💰", color: "bg-emerald-50 text-emerald-700" },
          ].map(s => (
            <Card key={s.label} className="p-4 text-center">
              <div className="text-3xl mb-1">{s.icon}</div>
              <div className={`text-xl font-black ${s.color.split(" ")[1]}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-slate-100 rounded-xl p-1 mb-6 w-fit gap-1">
        {[
          { id: "payments", label: `Pending Payments (${payments.length})` },
          { id: "users",    label: `Users (${users.length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? "bg-white shadow text-indigo-700" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-3 text-slate-500 py-12 justify-center">
          <Spinner /> Loading…
        </div>
      ) : tab === "payments" ? (
        <div className="flex flex-col gap-3">
          {payments.length === 0 ? (
            <Card className="p-16 text-center text-slate-400">
              <div className="text-4xl mb-3">✅</div>
              <div className="font-semibold text-slate-600">No pending payments</div>
              <div className="text-sm mt-1">All payments have been reviewed</div>
            </Card>
          ) : (
            payments.map(p => (
              <PaymentCard key={p.id} payment={p} token={token} onReviewed={load} />
            ))
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {users.length === 0 ? (
            <Card className="p-12 text-center text-slate-400">No users found</Card>
          ) : (
            users.map(u => (
              <UserRow key={u.id} user={u} token={token} onUpdated={load} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
