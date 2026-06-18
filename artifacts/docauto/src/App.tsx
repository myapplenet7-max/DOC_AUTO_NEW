// @ts-nocheck
import { useState, useEffect, createContext, useContext } from "react";
import AdminPage from "./AdminPage";

const AuthContext = createContext(null);
const API = "/api";

function useAuth() { return useContext(AuthContext); }

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem("docauto_user")); } catch { return null; } });
  const login = (userData, accessToken) => {
    localStorage.setItem("docauto_token", accessToken);
    localStorage.setItem("docauto_user", JSON.stringify(userData));
    setUser(userData);
  };
  const logout = () => { localStorage.removeItem("docauto_token"); localStorage.removeItem("docauto_user"); setUser(null); };
  const refreshUser = async () => {
    const t = localStorage.getItem("docauto_token");
    if (!t) return;
    try { const r = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${t}` } }); if (r.ok) { const u = await r.json(); setUser(u); localStorage.setItem("docauto_user", JSON.stringify(u)); } } catch {}
  };
  const token = localStorage.getItem("docauto_token");
  return <AuthContext.Provider value={{ user, token, login, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

async function apiFetch(path, opts = {}, token = null) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

const Icons = {
  Upload:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Download:() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  File:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Check:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><polyline points="20 6 9 17 4 12"/></svg>,
  Logout:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Spinner: () => <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>,
  WA:      () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
};

function Button({ children, onClick, variant = "primary", loading, disabled, className = "", type = "button" }) {
  const base = "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = { primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500", secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 focus:ring-slate-400", danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500", success: "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500", ghost: "text-slate-600 hover:bg-slate-100 focus:ring-slate-400" };
  return <button type={type} onClick={onClick} disabled={disabled || loading} className={`${base} ${variants[variant]} ${className}`}>{loading ? <Icons.Spinner /> : children}</button>;
}

function Input({ label, error, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
      <input {...props} className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${error ? "border-red-400" : "border-slate-200"}`} />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

function Card({ children, className = "" }) { return <div className={`bg-white rounded-xl border border-slate-100 shadow-sm ${className}`}>{children}</div>; }
function Badge({ children, color = "slate" }) {
  const colors = { slate: "bg-slate-100 text-slate-700", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", yellow: "bg-amber-50 text-amber-700", blue: "bg-indigo-50 text-indigo-700" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>{children}</span>;
}
function Alert({ type = "info", children, className = "" }) {
  const styles = { info: "bg-indigo-50 text-indigo-800 border-indigo-200", success: "bg-emerald-50 text-emerald-800 border-emerald-200", error: "bg-red-50 text-red-800 border-red-200", warning: "bg-amber-50 text-amber-800 border-amber-200" };
  return <div className={`px-4 py-3 rounded-lg border text-sm ${styles[type]} ${className}`}>{children}</div>;
}

// ── Auth Page ──────────────────────────────────────────────────────────────
function AuthPage() {
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: "", mobile: "", email: "", password: "" });
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    setError(""); setLoading(true);
    try {
      const endpoint = isRegister ? "/auth/register" : "/auth/login";
      const body = isRegister ? { name: form.name, mobile: form.mobile, email: form.email || undefined, password: form.password } : { mobile: form.mobile, password: form.password };
      const data = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
      login({ id: data.user_id, name: data.name, role: data.role, credits: data.credits }, data.access_token);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl shadow-lg mb-4 text-white"><Icons.File /></div>
          <h1 className="text-2xl font-bold text-slate-900">DocAuto</h1>
          <p className="text-slate-500 text-sm mt-1">Indian Document Automation · ₹10 per document</p>
        </div>
        <Card className="p-6">
          <div className="flex bg-slate-100 rounded-lg p-1 mb-6">
            <button onClick={() => setIsRegister(false)} className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${!isRegister ? "bg-white shadow text-slate-900" : "text-slate-500"}`}>Sign In</button>
            <button onClick={() => setIsRegister(true)} className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${isRegister ? "bg-white shadow text-slate-900" : "text-slate-500"}`}>Register</button>
          </div>
          <div className="flex flex-col gap-4">
            {isRegister && <Input label="Full Name" placeholder="Your name" value={form.name} onChange={set("name")} />}
            <Input label="Mobile Number" placeholder="10-digit mobile" value={form.mobile} onChange={set("mobile")} />
            {isRegister && <Input label="Email (optional)" type="email" placeholder="email@example.com" value={form.email} onChange={set("email")} />}
            <Input label="Password" type="password" placeholder="••••••••" value={form.password} onChange={set("password")} />
            {error && <Alert type="error">{error}</Alert>}
            <Button loading={loading} onClick={submit} className="w-full justify-center">{isRegister ? "Create Account" : "Sign In"}</Button>
          </div>
        </Card>
        <p className="text-center text-xs text-slate-400 mt-4">PAN Forms · Sale Deeds · Registration Documents · AP/Telangana</p>
      </div>
    </div>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────
function Layout({ page, setPage, children }) {
  const { user, logout } = useAuth();
  const nav = [
    { id: "dashboard", label: "Dashboard", icon: "🏠" },
    { id: "upload",    label: "Upload Document", icon: "📤" },
    { id: "documents", label: "My Documents", icon: "📄" },
    { id: "recharge",  label: "Buy Credits", icon: "🎟️" },
    ...(user?.role === "admin" ? [{ id: "admin", label: "Admin Panel", icon: "🛡️" }] : []),
  ];
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-60 bg-white border-r border-slate-100 flex flex-col fixed h-full z-10">
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">D</div>
            <div><div className="font-semibold text-slate-900 text-sm">DocAuto</div><div className="text-xs text-slate-400">Document Platform</div></div>
          </div>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-1">
          {nav.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full text-left ${page === item.id ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-100">
          <div className="px-3 py-2 mb-1">
            <div className="text-sm font-medium text-slate-700">{user?.name}</div>
            <div className="text-xs text-slate-400 flex items-center gap-1">🎟️ {user?.credits || 0} credit{user?.credits !== 1 ? "s" : ""}</div>
          </div>
          <button onClick={logout} className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg w-full transition-all"><Icons.Logout /> Sign Out</button>
        </div>
      </aside>
      <main className="ml-60 flex-1 p-8">{children}</main>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ setPage }) {
  const { user } = useAuth();
  const actions = [
    { title: "Upload & Extract", desc: "OCR any document — 1 credit per doc", icon: "📤", page: "upload", color: "bg-indigo-50 text-indigo-600" },
    { title: "My Documents",    desc: "View and download past documents",      icon: "📄", page: "documents", color: "bg-slate-50 text-slate-600" },
    { title: "Buy Credits",     desc: "Recharge from ₹10 to ₹1000",           icon: "🎟️", page: "recharge",  color: "bg-emerald-50 text-emerald-600" },
  ];
  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Welcome, {user?.name?.split(" ")[0]} 👋</h1>
        <p className="text-slate-500 mt-1">Process Indian legal documents with OCR. ₹10 per document.</p>
      </div>
      <Card className="p-5 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 text-xl">🎟️</div>
          <div>
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Available Credits</div>
            <div className="text-3xl font-bold text-slate-900">{user?.credits || 0}</div>
            <div className="text-xs text-slate-400">1 credit = 1 document</div>
          </div>
        </div>
        <Button variant="secondary" onClick={() => setPage("recharge")}>Buy Credits</Button>
      </Card>
      {(user?.credits || 0) === 0 && <Alert type="warning" className="mb-6">You have no credits. Buy a pack to start processing documents.</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {actions.map(a => (
          <button key={a.page} onClick={() => setPage(a.page)} className="text-left p-5 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all group">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 ${a.color}`}>{a.icon}</div>
            <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">{a.title}</div>
            <div className="text-xs text-slate-500 mt-1">{a.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Upload Page ────────────────────────────────────────────────────────────
function UploadPage({ setPage }) {
  const { token, refreshUser } = useAuth();
  const [file, setFile] = useState(null); const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false); const [result, setResult] = useState(null);
  const [error, setError] = useState(""); const [editedFields, setEditedFields] = useState({});
  const [generating, setGenerating] = useState(false); const [generated, setGenerated] = useState(false);

  const FIELD_LABELS = { full_name: "Full Name", father_name: "Father's Name", date_of_birth: "Date of Birth", aadhar_number: "Aadhaar Number", pan_number: "PAN Number", mobile: "Mobile", email: "Email", address: "Address", pincode: "Pincode", village: "Village", survey_number: "Survey Number", sale_amount: "Sale Amount (₹)", registration_date: "Registration Date" };

  const upload = async () => {
    if (!file) return; setError(""); setLoading(true); setResult(null); setGenerated(false);
    try {
      const fd = new FormData(); fd.append("file", file);
      const data = await apiFetch("/documents/upload", { method: "POST", body: fd }, token);
      const fields = JSON.parse(data.extracted_fields || "{}");
      setResult(data);
      setEditedFields(Object.fromEntries(Object.entries(fields).filter(([k]) => k !== "raw_text")));
      await refreshUser();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const generate = async () => {
    setGenerating(true);
    try {
      await apiFetch(`/documents/${result.id}/fields`, { method: "PUT", body: JSON.stringify({ fields: editedFields }) }, token);
      await apiFetch(`/documents/${result.id}/generate`, { method: "POST" }, token);
      setGenerated(true);
    } catch (e) { setError(e.message); }
    setGenerating(false);
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold text-slate-900 mb-1">Upload Document</h2>
      <p className="text-slate-500 text-sm mb-6">Upload a PDF or image — we extract the fields automatically. Uses 1 credit.</p>
      {!result ? (
        <>
          <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }} onClick={() => document.getElementById("fileInput").click()} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"}`}>
            <input id="fileInput" type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setFile(e.target.files[0])} />
            <div className="text-3xl mb-3">📎</div>
            {file ? <div><div className="font-semibold text-slate-900">{file.name}</div><div className="text-xs text-slate-400 mt-1">{(file.size/1024).toFixed(1)} KB</div></div> : <div><div className="font-medium text-slate-700">Drop file here or click to browse</div><div className="text-xs text-slate-400 mt-1">PDF, JPG, PNG supported</div></div>}
          </div>
          {error && <Alert type="error" className="mt-4">{error}</Alert>}
          <Button loading={loading} disabled={!file} onClick={upload} className="mt-4"><Icons.Upload /> Extract Fields (1 credit)</Button>
        </>
      ) : (
        <div>
          <Alert type="success" className="mb-4">✅ OCR complete — {Object.keys(editedFields).filter(k => editedFields[k]).length} fields detected. Edit below, then generate.</Alert>
          <Card className="p-5 mb-4">
            <h3 className="font-semibold text-slate-900 mb-4">Extracted Fields</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.entries(FIELD_LABELS).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
                  <input value={editedFields[key] || ""} onChange={e => setEditedFields(f => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder={`Enter ${label.toLowerCase()}`} />
                </div>
              ))}
            </div>
          </Card>
          {error && <Alert type="error" className="mb-4">{error}</Alert>}
          <div className="flex gap-3">
            {!generated ? <Button loading={generating} onClick={generate} variant="success"><Icons.File /> Generate DOCX</Button> : <Button onClick={() => window.open(`${API}/documents/${result.id}/download?token=${token}`, "_blank")} variant="primary"><Icons.Download /> Download DOCX</Button>}
            <Button variant="secondary" onClick={() => { setResult(null); setFile(null); }}>Upload Another</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Documents List ─────────────────────────────────────────────────────────
function DocumentsPage() {
  const { token } = useAuth();
  const [docs, setDocs] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { apiFetch("/documents/", {}, token).then(setDocs).catch(() => {}).finally(() => setLoading(false)); }, []);
  const statusBadge = s => { const map = { uploaded: ["slate","Uploaded"], processed: ["blue","Processed"], downloaded: ["green","Generated"] }; const [c,l] = map[s]||["slate",s]; return <Badge color={c}>{l}</Badge>; };
  if (loading) return <div className="flex items-center gap-2 text-slate-500"><Icons.Spinner /> Loading…</div>;
  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold text-slate-900 mb-6">My Documents</h2>
      {docs.length === 0 ? <Card className="p-12 text-center text-slate-400"><div className="text-4xl mb-3">📄</div><div className="font-medium">No documents yet</div></Card> : (
        <div className="flex flex-col gap-3">
          {docs.map(doc => (
            <Card key={doc.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500"><Icons.File /></div>
                <div>
                  <div className="font-medium text-slate-900 text-sm">{doc.original_filename}</div>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">{new Date(doc.created_at).toLocaleDateString("en-IN")}<span>·</span>1 credit<span>·</span>{statusBadge(doc.status)}</div>
                </div>
              </div>
              {doc.output_path && <button onClick={() => window.open(`${API}/documents/${doc.id}/download?token=${token}`, "_blank")} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Icons.Download /></button>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recharge / Buy Credits ─────────────────────────────────────────────────
function RechargePage() {
  const { token, refreshUser } = useAuth();
  const [packs, setPacks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [upiRef, setUpiRef] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [payments, setPayments] = useState([]);
  const [enquiryMsg, setEnquiryMsg] = useState("");
  const [enquirySent, setEnquirySent] = useState(false);

  useEffect(() => {
    apiFetch("/payments/packs", {}, token).then(setPacks).catch(() => {});
    apiFetch("/payments/my", {}, token).then(setPayments).catch(() => {});
  }, [success]);

  const submit = async () => {
    if (!screenshot || !selected) return;
    setError(""); setLoading(true);
    try {
      const fd = new FormData();
      fd.append("amount", selected.amount);
      fd.append("credits", selected.credits);
      if (upiRef) fd.append("upi_ref", upiRef);
      fd.append("screenshot", screenshot);
      await apiFetch("/payments/submit", { method: "POST", body: fd }, token);
      setSuccess(true); await refreshUser();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const sendEnquiry = async () => {
    try {
      await apiFetch("/payments/bulk-enquiry", { method: "POST", body: JSON.stringify({ message: enquiryMsg }) }, token);
      setEnquirySent(true);
    } catch {}
  };

  const statusBadge = s => { const map = { pending: ["yellow","Pending"], approved: ["green","Approved"], rejected: ["red","Rejected"] }; const [c,l] = map[s]||["slate",s]; return <Badge color={c}>{l}</Badge>; };

  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold text-slate-900 mb-1">Buy Credits</h2>
      <p className="text-slate-500 text-sm mb-6">1 credit = 1 document = ₹10. Buy more, save more.</p>
      <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-3">
        {packs.map(pack => {
          const isSelected = selected?.amount === pack.amount;
          const isBestValue = pack.amount === 100;
          return (
            <button key={pack.amount} onClick={() => setSelected(pack)} className={`relative p-4 rounded-xl border-2 text-left transition-all ${isSelected ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-300"}`}>
              {isBestValue && <span className="absolute -top-2 left-3 bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">Best Value</span>}
              <div className="text-xl font-bold text-slate-900">₹{pack.amount}</div>
              <div className="text-sm font-semibold text-indigo-600 mt-0.5">{pack.credits} credits</div>
              <div className="text-xs text-slate-400 mt-1">₹{pack.per_doc}/doc</div>
              {isSelected && <div className="absolute top-2 right-2 text-indigo-600"><Icons.Check /></div>}
            </button>
          );
        })}
      </div>
      <Card className="p-4 mb-6 border-dashed border-2 border-slate-200">
        <div className="flex items-start gap-3">
          <div className="text-green-500 mt-0.5"><Icons.WA /></div>
          <div className="flex-1">
            <div className="font-semibold text-slate-900 text-sm">Need 100+ documents?</div>
            <div className="text-xs text-slate-500 mb-2">Contact us for custom bulk pricing.</div>
            {!enquirySent ? (
              <div className="flex gap-2">
                <input value={enquiryMsg} onChange={e => setEnquiryMsg(e.target.value)} placeholder="Your requirement (optional)" className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <Button onClick={sendEnquiry} variant="secondary" className="text-xs px-3 py-1.5 whitespace-nowrap">WhatsApp Us</Button>
              </div>
            ) : (
              <div className="text-xs text-emerald-600 font-medium">✅ Enquiry sent! We'll contact you shortly.</div>
            )}
          </div>
        </div>
      </Card>
      {success ? (
        <Alert type="success">
          ✅ Payment submitted! We'll verify and add your credits shortly.
          <button className="block mt-2 text-sm underline" onClick={() => { setSuccess(false); setSelected(null); setScreenshot(null); setUpiRef(""); }}>Buy another pack</button>
        </Alert>
      ) : (
        <Card className="p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Pay via UPI</h3>
          <div className="bg-slate-50 rounded-xl p-4 mb-4 flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-3xl">📱</div>
            <div>
              <div className="text-xs text-slate-500 mb-1">UPI ID</div>
              <div className="font-mono font-bold text-slate-900">docauto@upi</div>
              <div className="text-xs text-slate-400 mt-1">Pay, then upload screenshot below</div>
            </div>
          </div>
          {!selected && <Alert type="info" className="mb-4">Select a credit pack above first.</Alert>}
          {selected && (
            <div className="bg-indigo-50 rounded-lg px-4 py-2 mb-4 flex justify-between items-center">
              <span className="text-sm text-indigo-700 font-medium">Selected: {selected.credits} credits</span>
              <span className="text-sm font-bold text-indigo-900">₹{selected.amount}</span>
            </div>
          )}
          <div className="flex flex-col gap-4">
            <Input label="UPI Reference / UTR (optional)" placeholder="e.g. 407123456789" value={upiRef} onChange={e => setUpiRef(e.target.value)} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Screenshot *</label>
              <div onClick={() => document.getElementById("ssInput").click()} className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center cursor-pointer hover:border-indigo-300 transition-all">
                <input id="ssInput" type="file" accept="image/*" className="hidden" onChange={e => setScreenshot(e.target.files[0])} />
                {screenshot ? <div className="text-sm font-medium text-slate-900">📸 {screenshot.name}</div> : <div className="text-sm text-slate-400">Tap to upload payment screenshot</div>}
              </div>
            </div>
            {error && <Alert type="error">{error}</Alert>}
            <Button loading={loading} disabled={!screenshot || !selected} onClick={submit}>Submit Payment</Button>
          </div>
        </Card>
      )}
      {payments.length > 0 && (
        <div className="mt-8">
          <h3 className="font-semibold text-slate-900 mb-3">Payment History</h3>
          <div className="flex flex-col gap-2">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between py-3 px-4 bg-white rounded-lg border border-slate-100">
                <div>
                  <div className="font-medium text-slate-900 text-sm">₹{p.amount} → {p.credits} credits</div>
                  <div className="text-xs text-slate-400">{new Date(p.created_at).toLocaleDateString("en-IN")}</div>
                </div>
                {statusBadge(p.status)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
function AppInner() {
  const { user, token } = useAuth();
  const [page, setPage] = useState("dashboard");
  if (!user) return <AuthPage />;
  const pages = { dashboard: <Dashboard setPage={setPage} />, upload: <UploadPage setPage={setPage} />, documents: <DocumentsPage />, recharge: <RechargePage />, admin: <AdminPage token={token} /> };
  return <Layout page={page} setPage={setPage}>{pages[page] || pages.dashboard}</Layout>;
}

export default function App() {
  return <AuthProvider><AppInner /></AuthProvider>;
}
