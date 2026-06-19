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

const Spinner = () => (
  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
  </svg>
);

function Badge({ children, color = "slate" }) {
  const colors = {
    slate:  "bg-slate-100 text-slate-700",
    green:  "bg-emerald-50 text-emerald-700 border border-emerald-200",
    red:    "bg-red-50 text-red-700 border border-red-200",
    yellow: "bg-amber-50 text-amber-700 border border-amber-200",
    blue:   "bg-indigo-50 text-indigo-700 border border-indigo-200",
    purple: "bg-purple-50 text-purple-700 border border-purple-200",
    teal:   "bg-teal-50 text-teal-700 border border-teal-200",
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[color]}`}>{children}</span>;
}

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>{children}</div>;
}

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
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white text-sm bg-white/10 px-3 py-1.5 rounded-lg">✕ Close (Esc)</button>
        <img src={src} alt="Payment screenshot" className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]" />
      </div>
    </div>
  );
}

// ── Payments Tab ──────────────────────────────────────────────────────────────
function PaymentCard({ payment, token, onReviewed }) {
  const [loadingAction, setLoadingAction] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const authUrl = `${API}/admin/payments/screenshot/${payment.id}?token=${token}`;

  const review = async (status, note = "") => {
    setLoadingAction(status); setActionMsg("");
    try {
      await apiFetch(`/admin/payments/${payment.id}/review`, {
        method: "PUT", body: JSON.stringify({ status, admin_note: note || undefined }),
      }, token);
      onReviewed();
    } catch (e) { setActionMsg(e.message); setLoadingAction(null); }
  };

  return (
    <>
      {lightboxOpen && <Lightbox src={authUrl} onClose={() => setLightboxOpen(false)} />}
      <Card className="p-4 lg:p-5">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            {payment.screenshot_path ? (
              <div>
                <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-xl overflow-hidden border border-slate-200 cursor-pointer hover:opacity-90 bg-slate-100 flex items-center justify-center"
                  onClick={() => setLightboxOpen(true)}>
                  {!imgError ? (
                    <>
                      {!imgLoaded && <Spinner />}
                      <img src={authUrl} alt="Screenshot"
                        className={`w-full h-full object-cover transition-opacity ${imgLoaded ? "opacity-100" : "opacity-0 absolute"}`}
                        onLoad={() => setImgLoaded(true)} onError={() => setImgError(true)} />
                    </>
                  ) : <div className="text-xs text-slate-400 text-center p-2">No image</div>}
                </div>
                {!imgError && <button onClick={() => setLightboxOpen(true)} className="text-xs text-indigo-600 hover:underline mt-1 block text-center w-full">View full</button>}
              </div>
            ) : (
              <div className="w-20 h-20 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-slate-300 text-xs text-center p-2">No screenshot</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
              <div>
                <div className="font-bold text-slate-900 text-base">₹{payment.amount} → {payment.credits} credits</div>
                <div className="text-xs text-slate-500 mt-0.5">User #{payment.user_id} · {new Date(payment.created_at).toLocaleString("en-IN")}</div>
                {payment.upi_ref && <div className="text-xs text-slate-600 mt-0.5 font-mono bg-slate-50 px-2 py-0.5 rounded inline-block">UTR: {payment.upi_ref}</div>}
              </div>
              <Badge color="yellow">Pending</Badge>
            </div>
            {actionMsg && <Alert type="error" className="mb-2 text-xs">{actionMsg}</Alert>}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button onClick={() => review("approved")} disabled={loadingAction !== null}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all active:scale-95 shadow-sm">
                {loadingAction === "approved" ? <Spinner /> : "✓"} Approve
              </button>
              {!showRejectBox ? (
                <button onClick={() => setShowRejectBox(true)} disabled={loadingAction !== null}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-all active:scale-95 shadow-sm">
                  ✕ Reject
                </button>
              ) : (
                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                  <input autoFocus value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                    placeholder="Rejection reason (optional)"
                    className="flex-1 min-w-32 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    onKeyDown={e => { if (e.key === "Enter") review("rejected", rejectNote); if (e.key === "Escape") setShowRejectBox(false); }} />
                  <button onClick={() => review("rejected", rejectNote)} disabled={loadingAction !== null}
                    className="px-4 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 whitespace-nowrap shadow-sm">
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

// ── Users Tab ─────────────────────────────────────────────────────────────────
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
      const r = await apiFetch(`/admin/users/${user.id}/credits`, { method: "PUT", body: JSON.stringify({ delta: d }) }, token);
      setMsg(`✅ Credits updated to ${r.credits}`);
      setDelta(""); setAdjusting(false); onUpdated();
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
              {!user.is_active && <Badge color="red">Inactive</Badge>}
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
            <button onClick={() => setAdjusting(a => !a)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-50 transition-all">
              Adjust
            </button>
          )}
        </div>
      </div>
      {adjusting && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
          <input type="number" value={delta} onChange={e => setDelta(e.target.value)}
            placeholder="+10 or -5"
            className="w-28 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onKeyDown={e => { if (e.key === "Enter") adjust(); }} autoFocus />
          <button onClick={adjust} disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {loading ? "…" : "Apply"}
          </button>
          <button onClick={() => { setAdjusting(false); setMsg(""); }} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          {msg && <span className="text-xs font-medium text-emerald-600">{msg}</span>}
        </div>
      )}
    </Card>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────
function DocumentsTab({ token }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    apiFetch("/admin/documents", {}, token)
      .then(setDocs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = docs.filter(d =>
    !search ||
    d.original_filename.toLowerCase().includes(search.toLowerCase()) ||
    d.user_name.toLowerCase().includes(search.toLowerCase()) ||
    (d.doc_type || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center gap-3 text-slate-500 py-12 justify-center"><Spinner /> Loading all documents…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-sm text-slate-500">{docs.length} total documents across all users</p>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by filename, user, or type…"
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64" />
      </div>
      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-slate-400">
          <div className="text-4xl mb-2">📄</div>
          <div className="font-semibold">{docs.length === 0 ? "No documents uploaded yet" : "No documents match your search"}</div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["#", "User", "Filename", "Type", "Status", "Credits", "Date", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-slate-400 text-xs">#{doc.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{doc.user_name}</div>
                    <div className="text-xs text-slate-400">{doc.user_mobile}</div>
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <div className="truncate font-medium text-slate-700" title={doc.original_filename}>{doc.original_filename}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{doc.doc_type || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge color={doc.status === "downloaded" ? "green" : doc.status === "processed" ? "blue" : "slate"}>
                      {doc.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-center">{doc.credits_used}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {doc.created_at ? new Date(doc.created_at).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {doc.has_output ? (
                      <a href={`${API}/admin/documents/${doc.id}/download?token=${token}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-all"
                        download>
                        ⬇ Download
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">No output</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Templates Tab ─────────────────────────────────────────────────────────────
function TemplatesTab({ token }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = () => {
    setLoading(true);
    apiFetch("/admin/templates", {}, token)
      .then(setTemplates)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const deleteTemplate = async (id) => {
    setDeleting(id);
    try {
      await apiFetch(`/admin/templates/${id}`, { method: "DELETE" }, token);
      setTemplates(prev => prev.filter(t => t.id !== id));
      setConfirmDelete(null);
    } catch (e) { setError(e.message); }
    setDeleting(null);
  };

  const filtered = templates.filter(t =>
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.user_name.toLowerCase().includes(search.toLowerCase()) ||
    (t.category || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center gap-3 text-slate-500 py-12 justify-center"><Spinner /> Loading templates…</div>;

  return (
    <div>
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="p-6 max-w-sm w-full">
            <div className="text-lg font-bold text-slate-900 mb-2">Delete Template?</div>
            <p className="text-sm text-slate-600 mb-4">This will permanently delete <strong>"{confirmDelete.name}"</strong>. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => deleteTemplate(confirmDelete.id)} disabled={deleting === confirmDelete.id}
                className="flex-1 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                {deleting === confirmDelete.id ? "Deleting…" : "Delete"}
              </button>
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 rounded-xl text-sm font-semibold border border-slate-200 hover:bg-slate-50">Cancel</button>
            </div>
          </Card>
        </div>
      )}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-sm text-slate-500">{templates.length} total templates across all users</p>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, user, or category…"
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64" />
      </div>
      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-slate-400">
          <div className="text-4xl mb-2">📚</div>
          <div className="font-semibold">{templates.length === 0 ? "No templates created yet" : "No templates match your search"}</div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["#", "Name", "Category", "Creator", "Uses", "Date", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-slate-400 text-xs">#{t.id}</td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <div className="font-medium text-slate-800 truncate" title={t.name}>{t.name}</div>
                    {t.description && <div className="text-xs text-slate-400 truncate">{t.description}</div>}
                  </td>
                  <td className="px-4 py-3"><Badge color="blue">{t.category || "Custom"}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-700">{t.user_name}</div>
                    <div className="text-xs text-slate-400">{t.user_mobile}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-center font-semibold">{t.use_count}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {t.created_at ? new Date(t.created_at).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setConfirmDelete(t)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all">
                      🗑 Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Resumes Tab ───────────────────────────────────────────────────────────────
function ResumesTab({ token }) {
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    apiFetch("/admin/resumes", {}, token)
      .then(setResumes)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = resumes.filter(r =>
    !search ||
    r.user_name.toLowerCase().includes(search.toLowerCase()) ||
    r.version_name.toLowerCase().includes(search.toLowerCase()) ||
    r.resume_type.toLowerCase().includes(search.toLowerCase())
  );

  const typeColor = { fresher: "blue", experienced: "green", creative: "purple" };
  const typeIcon  = { fresher: "🎓", experienced: "💼", creative: "🎨" };

  if (loading) return <div className="flex items-center gap-3 text-slate-500 py-12 justify-center"><Spinner /> Loading resumes…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-sm text-slate-500">{resumes.length} total resumes across all users</p>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by user, version, or type…"
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64" />
      </div>
      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-slate-400">
          <div className="text-4xl mb-2">📝</div>
          <div className="font-semibold">{resumes.length === 0 ? "No resumes generated yet" : "No resumes match your search"}</div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["#", "User", "Version Name", "Type", "Status", "Date", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-slate-400 text-xs">#{r.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{r.user_name}</div>
                    <div className="text-xs text-slate-400">{r.user_mobile}</div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">{r.version_name}</td>
                  <td className="px-4 py-3">
                    <Badge color={typeColor[r.resume_type] || "slate"}>
                      {typeIcon[r.resume_type]} {r.resume_type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={r.status === "generated" ? "green" : "yellow"}>{r.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.has_output ? (
                      <a href={`${API}/admin/resumes/${r.id}/download-file?token=${token}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-all"
                        download>
                        ⬇ Download
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">No file</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────
function SettingsPanel({ token }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/admin/settings", {}, token).then(setSettings).catch(e => setError(e.message));
  }, []);

  const update = (key, value) => setSettings(s => ({ ...s, [key]: value }));

  const save = async () => {
    setSaving(true); setMsg(""); setError("");
    try {
      await apiFetch("/admin/settings", { method: "PUT", body: JSON.stringify(settings) }, token);
      setMsg("Settings saved successfully.");
      setTimeout(() => setMsg(""), 3000);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  if (!settings) return <div className="flex justify-center py-12 text-slate-400"><Spinner /></div>;

  const field = (label, key, type = "text", hint = "") => (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      {type === "toggle" ? (
        <button onClick={() => update(key, settings[key] === "true" ? "false" : "true")}
          className={`w-12 h-6 rounded-full transition-colors relative ${settings[key] === "true" ? "bg-indigo-600" : "bg-slate-300"}`}>
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings[key] === "true" ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
      ) : (
        <input type={type} value={settings[key] || ""} onChange={e => update(key, e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-xs" />
      )}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );

  return (
    <div className="max-w-2xl space-y-6">
      {error && <Alert type="error">{error}</Alert>}
      {msg && <Alert type="success">{msg}</Alert>}
      <Card className="p-5">
        <h3 className="font-bold text-slate-900 mb-4">💳 Credit Settings</h3>
        <div className="space-y-4">
          {field("Starting Credits (new users)", "starting_credits", "number", "Credits given to each new user on registration")}
          {field("Document Download Cost (credits)", "doc_cost_credits", "number", "Credits deducted per generated document")}
          {field("Resume Download Cost (credits)", "resume_cost_credits", "number", "Credits deducted per resume download")}
          {field("UPI ID", "upi_id", "text", "UPI ID shown to users for payment")}
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="font-bold text-slate-900 mb-4">📝 Resume Settings</h3>
        <div className="space-y-4">
          {field("Enabled Resume Types", "resume_types_enabled", "text", "Comma-separated: fresher,experienced,creative")}
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="font-bold text-slate-900 mb-4">🔒 Preview & Watermark</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-700">Preview Watermark</div>
              <div className="text-xs text-slate-400">Show watermark on document previews</div>
            </div>
            {field("", "preview_watermark_enabled", "toggle")}
          </div>
          {settings.preview_watermark_enabled === "true" && field("Watermark Text", "preview_watermark_text", "text")}
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="font-bold text-slate-900 mb-4">🤖 Similarity Thresholds</h3>
        <div className="space-y-4">
          {field("Auto-Reuse Threshold (%)", "similarity_auto_reuse", "number", "Above this % — automatically reuse existing template")}
          {field("Ask User Threshold (%)", "similarity_ask_user", "number", "Between this % and auto-reuse — ask user to confirm reuse")}
        </div>
        <div className="mt-3 bg-slate-50 rounded-xl p-3 text-xs text-slate-500 space-y-1">
          <div>• <strong>{settings.similarity_auto_reuse}%+</strong> → Automatic reuse</div>
          <div>• <strong>{settings.similarity_ask_user}%–{settings.similarity_auto_reuse}%</strong> → Ask user</div>
          <div>• <strong>Below {settings.similarity_ask_user}%</strong> → Fresh analysis</div>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="font-bold text-slate-900 mb-4">📤 Upload Settings</h3>
        {field("Max Upload Size (MB)", "max_upload_mb", "number")}
      </Card>
      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
        {saving ? <Spinner /> : "💾"} {saving ? "Saving…" : "Save All Settings"}
      </button>
    </div>
  );
}

// ── Main AdminPage ─────────────────────────────────────────────────────────────
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
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const TABS = [
    { id: "payments",  label: `💳 Payments${payments.length > 0 ? ` (${payments.length})` : ""}` },
    { id: "users",     label: `👥 Users${users.length > 0 ? ` (${users.length})` : ""}` },
    { id: "documents", label: "📄 Documents" },
    { id: "templates", label: "📚 Templates" },
    { id: "resumes",   label: "📝 Resumes" },
    { id: "settings",  label: "⚙️ Settings" },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-xl">🛡️</div>
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-slate-900">Admin Panel</h2>
            <p className="text-slate-500 text-sm">Manage platform users, payments, documents and resumes</p>
          </div>
        </div>
        {tab !== "settings" && tab !== "documents" && tab !== "templates" && tab !== "resumes" && (
          <button onClick={load}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 hover:bg-slate-50 transition-all">
            🔄 Refresh
          </button>
        )}
      </div>

      {error && <Alert type="error" className="mb-5">{error}</Alert>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Users",     value: stats.total_users,      icon: "👤", color: "text-blue-700" },
            { label: "Documents", value: stats.total_documents,  icon: "📄", color: "text-slate-700" },
            { label: "Templates", value: stats.total_templates,  icon: "📚", color: "text-purple-700" },
            { label: "Resumes",   value: stats.total_resumes,    icon: "📝", color: "text-rose-700" },
            { label: "Pending",   value: stats.pending_payments, icon: "⏳", color: "text-amber-700" },
            { label: "Revenue",   value: `₹${stats.total_revenue}`, icon: "💰", color: "text-emerald-700" },
          ].map(s => (
            <Card key={s.label} className="p-3 text-center">
              <div className="text-xl mb-0.5">{s.icon}</div>
              <div className={`text-lg font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-slate-100 rounded-xl p-1 mb-6 gap-1 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${tab === t.id ? "bg-white shadow text-indigo-700" : "text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "settings" ? (
        <SettingsPanel token={token} />
      ) : tab === "documents" ? (
        <DocumentsTab token={token} />
      ) : tab === "templates" ? (
        <TemplatesTab token={token} />
      ) : tab === "resumes" ? (
        <ResumesTab token={token} />
      ) : loading ? (
        <div className="flex items-center gap-3 text-slate-500 py-12 justify-center"><Spinner /> Loading…</div>
      ) : tab === "payments" ? (
        <div className="flex flex-col gap-3">
          {payments.length === 0 ? (
            <Card className="p-16 text-center text-slate-400">
              <div className="text-4xl mb-3">✅</div>
              <div className="font-semibold text-slate-600">No pending payments</div>
              <div className="text-sm mt-1">All payments have been reviewed</div>
            </Card>
          ) : (
            payments.map(p => <PaymentCard key={p.id} payment={p} token={token} onReviewed={load} />)
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {users.length === 0 ? (
            <Card className="p-12 text-center text-slate-400">No users found</Card>
          ) : (
            users.map(u => <UserRow key={u.id} user={u} token={token} onUpdated={load} />)
          )}
        </div>
      )}
    </div>
  );
}
