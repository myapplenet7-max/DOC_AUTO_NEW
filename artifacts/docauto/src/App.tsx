// @ts-nocheck
import { useState, useEffect, createContext, useContext, useRef, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
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
  const logout = () => {
    localStorage.removeItem("docauto_token");
    localStorage.removeItem("docauto_user");
    setUser(null);
  };
  const refreshUser = async () => {
    const t = localStorage.getItem("docauto_token");
    if (!t) return;
    try {
      const r = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
      if (r.ok) {
        const u = await r.json();
        setUser(u);
        localStorage.setItem("docauto_user", JSON.stringify(u));
      }
    } catch {}
  };
  const token = localStorage.getItem("docauto_token");
  return <AuthContext.Provider value={{ user, token, login, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

async function apiFetch(path, opts: any = {}, token: string | null = null, _retry = true) {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { ...opts, headers });

  // Safe JSON parse — server sometimes returns plain-text on errors
  let data: any;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try { data = await res.json(); }
    catch { data = { detail: `Server error (${res.status})` }; }
  } else {
    // Non-JSON body (plain text / HTML from proxy or 500)
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      // Retry once on transient 500
      if (_retry && res.status >= 500) {
        await new Promise(r => setTimeout(r, 800));
        return apiFetch(path, opts, token, false);
      }
      throw new Error(
        text.startsWith("{") ? JSON.parse(text)?.detail :
        text.length < 200 ? text :
        `Server error (${res.status}). Please try again.`
      );
    }
    try { data = JSON.parse(text); }
    catch { throw new Error("Unexpected response from server. Please try again."); }
  }

  if (!res.ok) {
    const msg = data?.detail || data?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

// ── Icons ───────────────────────────────────────────────────────────────────
const Icons = {
  Upload:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Download:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  File:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Check:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><polyline points="20 6 9 17 4 12"/></svg>,
  Logout:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Spinner:   () => <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>,
  Menu:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Close:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Credit:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Shield:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  WA:        () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
  Template:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="9"/></svg>,
  Edit:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Trash:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  Search:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Eye:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Plus:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Save:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  Ai:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 8v4l3 3"/></svg>,
};

// ── Shared UI Components ─────────────────────────────────────────────────────
function Button({ children, onClick, variant = "primary", loading, disabled, className = "", type = "button", size = "md" }) {
  const base = "inline-flex items-center gap-2 rounded-lg font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm", lg: "px-6 py-3 text-base" };
  const variants = {
    primary:   "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500 shadow-sm",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-400 shadow-sm",
    danger:    "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-sm",
    success:   "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500 shadow-sm",
    ghost:     "text-slate-600 hover:bg-slate-100 focus:ring-slate-400",
    warning:   "bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400 shadow-sm",
    purple:    "bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500 shadow-sm",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {loading ? <Icons.Spinner /> : children}
    </button>
  );
}

function Input({ label, error, hint, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-semibold text-slate-700">{label}</label>}
      <input {...props} className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${error ? "border-red-400 bg-red-50" : "border-slate-300"}`} />
      {hint && !error && <span className="text-xs text-slate-400">{hint}</span>}
      {error && <span className="text-xs text-red-500 font-medium">⚠ {error}</span>}
    </div>
  );
}

function Textarea({ label, error, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-semibold text-slate-700">{label}</label>}
      <textarea {...props} className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none ${error ? "border-red-400 bg-red-50" : "border-slate-300"}`} />
      {error && <span className="text-xs text-red-500 font-medium">⚠ {error}</span>}
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-semibold text-slate-700">{label}</label>}
      <select {...props} className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
        {children}
      </select>
    </div>
  );
}

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>{children}</div>;
}

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

function Alert({ type = "info", children, className = "" }) {
  const styles = {
    info:    "bg-indigo-50 text-indigo-800 border-indigo-200",
    success: "bg-emerald-50 text-emerald-800 border-emerald-200",
    error:   "bg-red-50 text-red-800 border-red-200",
    warning: "bg-amber-50 text-amber-800 border-amber-200",
  };
  const icons = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" };
  return (
    <div className={`px-4 py-3 rounded-xl border text-sm flex gap-2 items-start ${styles[type]} ${className}`}>
      <span className="shrink-0 mt-0.5">{icons[type]}</span>
      <div>{children}</div>
    </div>
  );
}

function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center flex-1">
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1.5 rounded-full transition-all ${
            i < current ? "bg-emerald-100 text-emerald-700" :
            i === current ? "bg-indigo-600 text-white shadow" :
            "bg-slate-100 text-slate-400"
          }`}>
            {i < current ? "✓" : <span className="w-4 h-4 flex items-center justify-center">{i + 1}</span>}
            <span className="hidden sm:inline">{step}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-1 ${i < current ? "bg-emerald-300" : "bg-slate-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

const CATEGORY_ICONS = {
  "Affidavit":              "📜",
  "Sale Deed":              "🏠",
  "Agricultural Sale Deed": "🌾",
  "Court Documents":        "⚖️",
  "Agreements":             "🤝",
  "Rental Agreements":      "🔑",
  "GPA":                    "📋",
  "Will":                   "📝",
  "Gift Deed":              "🎁",
  "Legal Notices":          "📢",
  "Certificates":           "🎓",
  "Government Forms":       "🏛️",
  "Custom Templates":       "📄",
};

const CATEGORIES = Object.keys(CATEGORY_ICONS);

const CONFIDENCE_COLOR = (c) => c >= 0.95 ? "green" : c >= 0.85 ? "blue" : "yellow";

// ── Auth Page ──────────────────────────────────────────────────────────────
function AuthPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ name: "", mobile: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (mode === "register" && !form.name.trim()) errs.name = "Name is required";
    if (!form.mobile.match(/^\d{10}$/)) errs.mobile = "Enter a valid 10-digit mobile number";
    if (mode !== "forgot") {
      if (form.password.length < 6) errs.password = "Password must be at least 6 characters";
      if (mode === "register" && form.password !== form.confirmPassword) errs.confirmPassword = "Passwords do not match";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setGlobalError(""); setLoading(true);
    try {
      if (mode === "forgot") { setForgotSent(true); setLoading(false); return; }
      const endpoint = mode === "register" ? "/auth/register" : "/auth/login";
      const body = mode === "register"
        ? { name: form.name, mobile: form.mobile, email: form.email || undefined, password: form.password }
        : { mobile: form.mobile, password: form.password };
      const data = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
      login({ id: data.user_id, name: data.name, role: data.role, credits: data.credits }, data.access_token);
    } catch (e) { setGlobalError(e.message); }
    setLoading(false);
  };

  if (forgotSent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">📱</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Reset Request Sent</h2>
          <p className="text-slate-500 text-sm mb-6">Contact support via WhatsApp at <strong>9014860890</strong> to reset your password.</p>
          <Button variant="secondary" onClick={() => { setForgotSent(false); setMode("signin"); }} className="w-full justify-center">Back to Sign In</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-lg mb-4 text-white text-2xl">📋</div>
          <h1 className="text-3xl font-bold text-slate-900">DocAuto</h1>
          <p className="text-slate-500 text-sm mt-1">Indian Document Automation Platform</p>
        </div>
        <Card className="p-6 shadow-lg">
          {mode !== "forgot" && (
            <div className="flex bg-slate-100 rounded-xl p-1 mb-6 gap-1">
              <button onClick={() => { setMode("signin"); setErrors({}); setGlobalError(""); }} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === "signin" ? "bg-white shadow text-indigo-700" : "text-slate-500 hover:text-slate-700"}`}>Sign In</button>
              <button onClick={() => { setMode("register"); setErrors({}); setGlobalError(""); }} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === "register" ? "bg-white shadow text-indigo-700" : "text-slate-500 hover:text-slate-700"}`}>Register</button>
            </div>
          )}
          {mode === "forgot" && (
            <div className="mb-5">
              <button onClick={() => { setMode("signin"); setErrors({}); setGlobalError(""); }} className="text-sm text-indigo-600 hover:underline flex items-center gap-1">← Back to Sign In</button>
              <h2 className="text-lg font-bold text-slate-900 mt-2">Forgot Password</h2>
              <p className="text-sm text-slate-500 mt-1">Enter your mobile number to get reset instructions.</p>
            </div>
          )}
          <div className="flex flex-col gap-4" onKeyDown={e => { if (e.key === "Enter") submit(); }}>
            {mode === "register" && <Input label="Full Name" placeholder="e.g. Ravi Kumar" value={form.name} onChange={set("name")} error={errors.name} autoFocus />}
            <Input label="Mobile Number" placeholder="10-digit mobile number" value={form.mobile} onChange={set("mobile")} error={errors.mobile} maxLength={10} inputMode="numeric" autoFocus={mode !== "register"} />
            {mode === "register" && <Input label="Email (optional)" type="email" placeholder="you@example.com" value={form.email} onChange={set("email")} />}
            {mode !== "forgot" && <Input label="Password" type="password" placeholder="Minimum 6 characters" value={form.password} onChange={set("password")} error={errors.password} />}
            {mode === "register" && <Input label="Confirm Password" type="password" placeholder="Re-enter password" value={form.confirmPassword} onChange={set("confirmPassword")} error={errors.confirmPassword} />}
            {globalError && <Alert type="error">{globalError}</Alert>}
            <Button loading={loading} onClick={submit} className="w-full justify-center" size="lg">
              {mode === "signin" ? "Sign In" : mode === "register" ? "Create Account" : "Send Reset Instructions"}
            </Button>
            {mode === "signin" && <button onClick={() => { setMode("forgot"); setErrors({}); setGlobalError(""); }} className="text-sm text-center text-indigo-600 hover:underline">Forgot Password?</button>}
          </div>
        </Card>
        {mode === "signin" && (
          <a href="/?admin" className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-purple-300 text-sm font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 transition-all text-center">
            🛡️ Admin Portal
          </a>
        )}
        <p className="text-center text-xs text-slate-400 mt-4">Affidavits · Sale Deeds · Court Documents · AP/Telangana</p>
      </div>
    </div>
  );
}

// ── Layout ──────────────────────────────────────────────────────────────────
function Layout({ page, setPage, children }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const nav = [
    { id: "dashboard",  label: "Dashboard",       icon: "🏠" },
    { id: "upload",     label: "Upload & Extract", icon: "📤" },
    { id: "templates",  label: "Template Library", icon: "📚" },
    { id: "documents",  label: "My Documents",     icon: "📄" },
    { id: "resume",     label: "Resume Builder",   icon: "📝" },
    { id: "recharge",   label: "Buy Credits",      icon: "💳" },
    ...(user?.role === "admin" ? [{ id: "admin", label: "Admin Panel", icon: "🛡️" }] : []),
  ];

  const navigate = (id) => { setPage(id); setSidebarOpen(false); };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">D</div>
          <div>
            <div className="font-bold text-slate-900">DocAuto</div>
            <div className="text-xs text-slate-400">Document Platform</div>
          </div>
        </div>
      </div>
      <div className="px-4 py-3 mx-3 mt-3 bg-indigo-50 rounded-xl border border-indigo-100">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">{user?.name?.charAt(0)?.toUpperCase() || "U"}</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">{user?.name}</div>
            {user?.role === "admin" && <div className="text-xs text-indigo-600 font-semibold flex items-center gap-1"><Icons.Shield /> Admin</div>}
          </div>
        </div>
        {user?.role !== "admin" ? (
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-slate-500">Credits</div>
            <div className={`text-sm font-bold ${(user?.credits || 0) === 0 ? "text-red-600" : "text-indigo-700"}`}>{user?.credits || 0} {(user?.credits || 0) === 0 ? "⚠️" : "🎟️"}</div>
          </div>
        ) : (
          <div className="mt-1.5 text-xs text-indigo-600 font-medium">∞ Unlimited credits</div>
        )}
      </div>
      <nav className="flex-1 p-3 flex flex-col gap-1 mt-2">
        {nav.map(item => (
          <button key={item.id} onClick={() => navigate(item.id)} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all w-full text-left ${page === item.id ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-100">
        <button onClick={logout} className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all shadow-sm">
          <Icons.Logout /> Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 bg-white border-r border-slate-100 fixed h-full z-20 hidden lg:flex flex-col"><SidebarContent /></aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <span className="font-bold text-slate-900">Menu</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg text-slate-500 hover:bg-slate-100"><Icons.Close /></button>
            </div>
            <div className="flex-1 overflow-y-auto"><SidebarContent /></div>
          </aside>
        </div>
      )}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-20 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"><Icons.Menu /></button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">D</div>
            <span className="font-bold text-slate-900">DocAuto</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user?.role !== "admin" && (
            <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${(user?.credits || 0) === 0 ? "bg-red-100 text-red-700" : "bg-indigo-100 text-indigo-700"}`}>
              {(user?.credits || 0) === 0 ? "⚠️ 0" : `🎟️ ${user?.credits}`}
            </div>
          )}
          <button onClick={logout} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-all shadow-sm">
            <Icons.Logout /><span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
      <main className="lg:ml-64 flex-1 p-4 lg:p-8 pt-20 lg:pt-8">{children}</main>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ setPage }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const actions = [
    { title: "Upload & Extract",  desc: "OCR any document — PDF, DOCX, Image",  icon: "📤", page: "upload",    color: "bg-indigo-50 border-indigo-100",   iconBg: "bg-indigo-100 text-indigo-600" },
    { title: "Template Library",  desc: "Browse, save & reuse document templates", icon: "📚", page: "templates", color: "bg-purple-50 border-purple-100", iconBg: "bg-purple-100 text-purple-600" },
    { title: "Resume Builder",    desc: "Create professional resumes — Fresher, Experienced, Creative", icon: "📝", page: "resume", color: "bg-rose-50 border-rose-100", iconBg: "bg-rose-100 text-rose-600" },
    { title: "My Documents",      desc: "View and download past documents",       icon: "📄", page: "documents", color: "bg-slate-50 border-slate-100",     iconBg: "bg-slate-100 text-slate-600" },
    { title: "Buy Credits",       desc: "Recharge from ₹10 to ₹1000",            icon: "💳", page: "recharge",  color: "bg-emerald-50 border-emerald-100", iconBg: "bg-emerald-100 text-emerald-600" },
    ...(isAdmin ? [{ title: "Admin Panel", desc: "Manage users, payments & stats", icon: "🛡️", page: "admin", color: "bg-amber-50 border-amber-100", iconBg: "bg-amber-100 text-amber-600" }] : []),
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Welcome back, {user?.name?.split(" ")[0]} 👋</h1>
        <p className="text-slate-500 mt-1">AI-powered document automation for Telugu & English documents.</p>
      </div>
      {isAdmin && (
        <div className="mb-5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">🛡️</div>
            <div><div className="font-bold text-lg">Administrator Account</div><div className="text-purple-200 text-sm">Unlimited credits · Full platform access</div></div>
          </div>
        </div>
      )}
      {!isAdmin && (
        <Card className={`p-5 mb-5 ${(user?.credits || 0) === 0 ? "border-red-200 bg-red-50" : ""}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${(user?.credits || 0) === 0 ? "bg-red-100" : "bg-indigo-100"}`}>{(user?.credits || 0) === 0 ? "⚠️" : "🎟️"}</div>
              <div>
                <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Available Credits</div>
                <div className={`text-4xl font-black ${(user?.credits || 0) === 0 ? "text-red-600" : "text-slate-900"}`}>{user?.credits || 0}</div>
                <div className="text-xs text-slate-400">1 credit = 1 document = ₹10</div>
              </div>
            </div>
            <Button variant="primary" onClick={() => setPage("recharge")} size="md">Buy Credits</Button>
          </div>
        </Card>
      )}
      <div className="mb-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100">
        <div className="text-sm font-semibold text-indigo-900 mb-2">✨ Supported Documents</div>
        <div className="flex flex-wrap gap-2">
          {["Affidavits", "Sale Deeds", "Court Documents", "GPA", "Rental Agreements", "Certificates", "Government Forms", "Legal Notices"].map(t => (
            <span key={t} className="px-2.5 py-1 bg-white border border-indigo-100 rounded-lg text-xs font-medium text-indigo-700 shadow-sm">{t}</span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {actions.map(a => (
          <button key={a.page} onClick={() => setPage(a.page)} className={`text-left p-5 rounded-2xl border-2 hover:shadow-md transition-all group ${a.color}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-3 ${a.iconBg}`}>{a.icon}</div>
            <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{a.title}</div>
            <div className="text-xs text-slate-500 mt-1">{a.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Upload Page (multi-step) ─────────────────────────────────────────────────
const FIELD_LABELS = {
  full_name:           "Full Name",
  father_name:         "Father's Name",
  husband_name:        "Husband's Name",
  deponent_name:       "Deponent Name",
  advocate_name:       "Advocate Name",
  date_of_birth:       "Date of Birth",
  aadhar_number:       "Aadhaar Number",
  pan_number:          "PAN Number",
  mobile:              "Mobile",
  email:               "Email",
  address:             "Address",
  pincode:             "Pincode",
  village:             "Village",
  mandal:              "Mandal",
  district:            "District",
  state:               "State",
  survey_number:       "Survey Number",
  door_number:         "Door Number",
  plot_number:         "Plot Number",
  court_case_number:   "Court Case Number",
  registration_number: "Registration Number",
  boundaries:          "Boundaries",
  property_details:    "Property Details",
  sale_amount:         "Sale Amount (₹)",
  registration_date:   "Registration Date",
};

// ── Three-panel comparison component ────────────────────────────────────────
function ComparisonPanel({ docId, token, showOutput = false, children }) {
  const [activeTab, setActiveTab] = useState("form");
  const tabs = [
    { id: "original", label: "📄 Original" },
    { id: "template", label: "🔵 Template" },
    { id: "form",     label: showOutput ? "✅ Output" : "✏️ Fill Form" },
  ];

  const iframeSrc = (type) => `${API}/documents/${docId}/${type}?token=${token}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Mobile tabs */}
      <div className="flex lg:hidden bg-slate-100 rounded-xl p-1 gap-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === t.id ? "bg-white shadow text-indigo-700" : "text-slate-500"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Three-column layout — desktop */}
      <div className="hidden lg:grid lg:grid-cols-3 gap-3" style={{ height: "64vh" }}>
        {/* Left — Original */}
        <div className="flex flex-col rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-3 py-2 bg-slate-700 text-white text-xs font-bold flex items-center gap-2 shrink-0">
            <span>📄</span> Original Document
          </div>
          <iframe src={iframeSrc("preview-original")} className="flex-1 w-full bg-white" style={{ border: "none" }} title="Original" />
        </div>

        {/* Center — Template */}
        <div className="flex flex-col rounded-xl border border-blue-200 overflow-hidden shadow-sm">
          <div className="px-3 py-2 bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shrink-0">
            <span>🔵</span> Template
            <span className="ml-auto text-blue-300 font-normal" style={{ fontSize: "10px" }}>{"{{placeholders}} highlighted"}</span>
          </div>
          <iframe src={iframeSrc("preview-template")} className="flex-1 w-full bg-white" style={{ border: "none" }} title="Template" />
        </div>

        {/* Right — Form or Output */}
        <div className="flex flex-col rounded-xl border border-emerald-200 overflow-hidden shadow-sm">
          <div className={`px-3 py-2 text-white text-xs font-bold flex items-center gap-2 shrink-0 ${showOutput ? "bg-emerald-700" : "bg-indigo-700"}`}>
            <span>{showOutput ? "✅" : "✏️"}</span>
            {showOutput ? "Generated Output" : "Fill In Values"}
          </div>
          <div className="flex-1 overflow-y-auto bg-white">
            {showOutput
              ? <iframe src={iframeSrc("preview-output")} className="w-full h-full" style={{ border: "none", minHeight: "100%" }} title="Output" />
              : children
            }
          </div>
        </div>
      </div>

      {/* Single-column mobile view */}
      <div className="lg:hidden rounded-xl border overflow-hidden" style={{ height: "60vh" }}>
        {activeTab === "original" && (
          <iframe src={iframeSrc("preview-original")} className="w-full h-full bg-white" style={{ border: "none" }} title="Original" />
        )}
        {activeTab === "template" && (
          <iframe src={iframeSrc("preview-template")} className="w-full h-full bg-white" style={{ border: "none" }} title="Template" />
        )}
        {activeTab === "form" && (
          showOutput
            ? <iframe src={iframeSrc("preview-output")} className="w-full h-full bg-white" style={{ border: "none" }} title="Output" />
            : <div className="h-full overflow-y-auto bg-white">{children}</div>
        )}
      </div>
    </div>
  );
}

// ── Interactive text view with text-selection → variable conversion ──────────
function InteractiveDocText({ rawText, placeholders, onAddPlaceholder }) {
  const containerRef = useRef(null);
  const [selInfo, setSelInfo] = useState(null); // { text, top, left }
  const [varName, setVarName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const inputRef = useRef(null);

  // Build the "template text" view: replace approved values with {{TOKEN}} marks
  const buildDisplayHtml = () => {
    let display = rawText;
    const sorted = [...placeholders]
      .filter(p => p.approved && p.value && p.placeholder)
      .sort((a, b) => b.value.length - a.value.length);
    for (const ph of sorted) {
      display = display.split(ph.value).join(`\x00PH:${ph.placeholder}\x00`);
    }
    return display;
  };

  const displayText = buildDisplayHtml();

  const renderLine = (line, lineIdx) => {
    const parts = line.split('\x00');
    return (
      <p key={lineIdx} className="leading-relaxed">
        {parts.map((part, i) => {
          if (part.startsWith('PH:')) {
            const name = part.slice(3);
            return (
              <mark key={i} className="bg-blue-100 text-blue-800 px-1 rounded font-mono text-xs font-bold not-italic border border-blue-200">
                {`{{${name}}}`}
              </mark>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </p>
    );
  };

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { setSelInfo(null); return; }
    const selected = sel.toString().trim();
    if (!selected || selected.length < 2) return;
    if (!containerRef.current?.contains(sel.anchorNode)) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const top = rect.bottom - containerRect.top + 6;
    const left = Math.max(0, rect.left - containerRect.left);

    // Auto-suggest var name from selection
    const suggested = selected
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 30);

    setSelInfo({ text: selected, top, left });
    setVarName(suggested || "VARIABLE_NAME");
    setShowForm(false);
  };

  const handleSave = () => {
    if (!selInfo || !varName.trim()) return;
    onAddPlaceholder(selInfo.text, varName.trim().toUpperCase().replace(/\s+/g, '_'));
    setSelInfo(null); setShowForm(false); setVarName("");
    window.getSelection()?.removeAllRanges();
  };

  useEffect(() => {
    if (showForm && inputRef.current) inputRef.current.focus();
  }, [showForm]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className="text-sm leading-7 text-slate-700 whitespace-pre-wrap font-sans select-text p-4 rounded-xl bg-slate-50 border border-slate-200 max-h-72 overflow-y-auto"
        style={{ userSelect: "text" }}
      >
        {displayText.split('\n').map((line, i) => renderLine(line, i))}
      </div>

      {selInfo && (
        <div
          className="absolute z-20 bg-slate-900 text-white rounded-xl shadow-2xl p-3 text-xs"
          style={{ top: selInfo.top, left: Math.min(selInfo.left, 200), minWidth: 240, maxWidth: 320 }}
        >
          <div className="mb-2 text-slate-300 truncate">
            Selected: <span className="text-white font-medium">"{selInfo.text.slice(0, 35)}{selInfo.text.length > 35 ? "…" : ""}"</span>
          </div>
          {!showForm ? (
            <div className="flex gap-2">
              <button
                onClick={() => setShowForm(true)}
                className="flex-1 bg-indigo-500 hover:bg-indigo-400 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              >
                Convert to Variable →
              </button>
              <button onClick={() => setSelInfo(null)} className="text-slate-400 hover:text-white px-2">✕</button>
            </div>
          ) : (
            <div>
              <div className="text-slate-300 mb-1">Variable name:</div>
              <input
                ref={inputRef}
                value={varName}
                onChange={e => setVarName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setSelInfo(null); }}
                className="w-full px-2 py-1 rounded-lg text-slate-900 text-xs font-mono mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="e.g. CHILD_NAME"
              />
              <div className="flex gap-2">
                <button onClick={handleSave} className="flex-1 bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors">
                  ✓ Save as {`{{${varName || "NAME"}}}`}
                </button>
                <button onClick={() => setSelInfo(null)} className="text-slate-400 hover:text-white px-2">✕</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UploadPage({ setPage }) {
  const { token, refreshUser, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [placeholders, setPlaceholders] = useState([]);
  const [rawText, setRawText] = useState("");
  const [docType, setDocType] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [fillValues, setFillValues] = useState({});
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState("Custom Templates");
  const [templateDesc, setTemplateDesc] = useState("");
  const [hasFormatTemplate, setHasFormatTemplate] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualText, setManualText] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [inputMode, setInputMode] = useState<"file" | "text">("file");
  const [pastedText, setPastedText] = useState("");
  const STEPS = ["Upload", "Review Variables", "Fill & Generate", "Download"];

  const upload = async () => {
    if (!file) return;
    setError(""); setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await apiFetch("/documents/upload", { method: "POST", body: fd }, token);
      setResult(data);
      const phData = await apiFetch(`/documents/${data.id}/placeholders`, {}, token);
      setPlaceholders(phData.placeholders || []);
      const extractedRaw = phData.raw_text || "";
      setRawText(extractedRaw);
      setDocType(phData.doc_type || null);
      setTemplateName(file.name.replace(/\.[^.]+$/, ""));
      await refreshUser();
      setStep(1);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const submitText = async () => {
    if (!pastedText.trim()) return;
    setError(""); setLoading(true);
    try {
      const data = await apiFetch("/documents/from-text", {
        method: "POST",
        body: JSON.stringify({ text: pastedText.trim(), filename: "pasted_document.txt" }),
      }, token);
      setResult(data);
      const phData = await apiFetch(`/documents/${data.id}/placeholders`, {}, token);
      setPlaceholders(phData.placeholders || []);
      setRawText(phData.raw_text || "");
      setDocType(phData.doc_type || null);
      setTemplateName("Pasted Document");
      await refreshUser();
      setStep(1);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const rescan = async () => {
    if (!result) return;
    setScanning(true); setScanMsg(""); setError("");
    try {
      const currentApproved = placeholders.filter(p => p.approved);
      const data = await apiFetch(`/documents/${result.id}/rescan`, {
        method: "POST",
        body: JSON.stringify({ existing_placeholders: currentApproved }),
      }, token);
      const newPhs = (data.new_placeholders || []).map(p => ({ ...p, approved: false }));
      if (newPhs.length === 0) {
        setScanMsg("No additional variables found.");
      } else {
        setPlaceholders(prev => {
          // Deduplicate: skip any returned placeholder whose name already exists
          const existingNames = new Set(prev.map(p => p.placeholder?.toUpperCase()));
          const truly_new = newPhs.filter(p => !existingNames.has(p.placeholder?.toUpperCase()));
          if (truly_new.length === 0) {
            setScanMsg("No additional variables found.");
            return prev;
          }
          setScanMsg(`Found ${truly_new.length} more possible variable${truly_new.length === 1 ? "" : "s"} — review below.`);
          return [...prev, ...truly_new];
        });
      }
    } catch (e) { setError(e.message); }
    setScanning(false);
  };

  const addCustomPlaceholder = (text, key) => {
    // Don't add duplicates
    if (placeholders.some(p => p.value === text || p.placeholder === key)) return;
    const newPh = {
      key: key.toLowerCase(),
      placeholder: key,
      value: text,
      confidence: 1.0,
      category: "Manual",
      approved: true,
    };
    setPlaceholders(prev => [...prev, newPh]);
  };

  const addManualVariable = () => {
    if (!manualText.trim() || !manualKey.trim()) return;
    addCustomPlaceholder(manualText.trim(), manualKey.trim().toUpperCase().replace(/\s+/g, "_"));
    setManualText(""); setManualKey(""); setShowManualAdd(false);
  };

  const approveAndContinue = async () => {
    setLoading(true); setError("");
    try {
      const approved = placeholders.filter(p => p.approved);
      const res = await apiFetch(`/documents/${result.id}/approve-placeholders`, {
        method: "POST",
        body: JSON.stringify({ approved_placeholders: approved }),
      }, token);
      setHasFormatTemplate(res.has_format_preserved_template || false);
      // Pre-fill the values with detected values as defaults
      const defaults = {};
      approved.forEach(ph => { defaults[ph.placeholder] = ph.value || ""; });
      setFillValues(defaults);
      setStep(2);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const generate = async () => {
    setGenerating(true); setError("");
    try {
      await apiFetch(`/documents/${result.id}/fields`, {
        method: "PUT",
        body: JSON.stringify({ fields: fillValues }),
      }, token);
      await apiFetch(`/documents/${result.id}/generate`, { method: "POST" }, token);
      setGenerated(true);
      setStep(3);
    } catch (e) { setError(e.message); }
    setGenerating(false);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      await apiFetch(`/documents/${result.id}/save-template`, {
        method: "POST",
        body: JSON.stringify({ name: templateName, category: templateCategory, description: templateDesc }),
      }, token);
      setTemplateSaved(true); setShowSaveModal(false);
    } catch (e) { setError(e.message); }
    setSavingTemplate(false);
  };

  const resetAll = () => {
    setStep(0); setFile(null); setResult(null); setFillValues({});
    setPlaceholders([]); setRawText(""); setDocType(null);
    setGenerated(false); setTemplateSaved(false); setError("");
    setShowSaveModal(false); setHasFormatTemplate(false);
    setScanMsg(""); setShowManualAdd(false); setPastedText(""); setInputMode("file");
  };

  const togglePlaceholder = (idx) => {
    setPlaceholders(prev => prev.map((p, i) => i === idx ? { ...p, approved: !p.approved } : p));
  };

  const updatePlaceholderName = (idx, name) => {
    setPlaceholders(prev => prev.map((p, i) => i === idx ? { ...p, placeholder: name.toUpperCase().replace(/[^A-Z0-9_]/g, '_') } : p));
  };

  const removePlaceholder = (idx) => {
    setPlaceholders(prev => prev.filter((_, i) => i !== idx));
  };

  const approvedPhs = placeholders.filter(p => p.approved);
  const suggestedPhs = placeholders.filter(p => !p.approved);
  const isWideStep = step === 2 || step === 3;

  return (
    <div className={isWideStep ? "w-full max-w-none" : "max-w-2xl mx-auto"}>
      <div className="mb-5">
        <h2 className="text-xl lg:text-2xl font-bold text-slate-900">Upload & Extract</h2>
        <p className="text-slate-500 text-sm mt-1">Format-preserving document automation for Telugu & English legal documents.</p>
      </div>

      <StepIndicator steps={STEPS} current={step} />

      {/* ── Step 0 — Upload ─────────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="max-w-2xl mx-auto">
          {!isAdmin && (user?.credits || 0) === 0 && (
            <Alert type="warning" className="mb-4">You have no credits. <button onClick={() => setPage("recharge")} className="font-bold underline">Buy credits</button> to process documents.</Alert>
          )}

          {/* Mode tabs */}
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 mb-5 gap-1">
            <button
              onClick={() => { setInputMode("file"); setError(""); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${inputMode === "file" ? "bg-white shadow text-indigo-700 border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}
            >
              📎 Upload File
            </button>
            <button
              onClick={() => { setInputMode("text"); setError(""); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${inputMode === "text" ? "bg-white shadow text-indigo-700 border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}
            >
              📋 Paste Text
            </button>
          </div>

          {inputMode === "file" ? (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
                onClick={() => document.getElementById("fileInput").click()}
                className={`border-2 border-dashed rounded-2xl p-10 lg:p-14 text-center cursor-pointer transition-all ${dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50"}`}
              >
                <input id="fileInput" type="file" accept=".txt,.docx" className="hidden" onChange={e => setFile(e.target.files[0])} />
                <div className="text-4xl mb-3">📎</div>
                {file ? (
                  <div>
                    <div className="font-semibold text-slate-900">{file.name}</div>
                    <div className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(1)} KB</div>
                    <button onClick={e => { e.stopPropagation(); setFile(null); }} className="mt-2 text-xs text-red-500 hover:underline">Remove</button>
                  </div>
                ) : (
                  <div>
                    <div className="font-semibold text-slate-700">Drop file here or tap to browse</div>
                    <div className="text-xs text-slate-400 mt-1">TXT · DOCX</div>
                    <div className="text-xs text-indigo-500 mt-2 font-medium">Telugu &amp; English · Format preserved</div>
                  </div>
                )}
              </div>
              {error && <Alert type="error" className="mt-4">{error}</Alert>}
              <Button loading={loading} disabled={!file || (!isAdmin && (user?.credits || 0) === 0)} onClick={upload} className="mt-4 w-full justify-center" size="lg">
                <Icons.Ai />{isAdmin ? "Extract & Detect Variables (Free)" : "Extract & Detect Variables (1 credit)"}
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 pt-4 pb-2 border-b border-slate-100">
                  <div className="text-sm font-semibold text-slate-700">Paste your document text below</div>
                  <div className="text-xs text-slate-400 mt-0.5">Works great for image scans — type or paste the text from your document, then let DocAuto detect variables automatically.</div>
                </div>
                <textarea
                  value={pastedText}
                  onChange={e => setPastedText(e.target.value)}
                  placeholder={"E.g.:\n\nI, RAVI KUMAR, S/O NARAYANA, aged 35 years, residing at H.No. 5-123, MG Road, Vijayawada, Krishna District, Andhra Pradesh, do hereby solemnly affirm...\n\n(Telugu text supported too)"}
                  className="w-full h-56 px-4 py-3 text-sm text-slate-800 font-mono resize-none outline-none placeholder-slate-300"
                  spellCheck={false}
                />
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400">{pastedText.length} characters</span>
                  {pastedText.length > 0 && (
                    <button onClick={() => setPastedText("")} className="text-xs text-red-400 hover:text-red-600">Clear</button>
                  )}
                </div>
              </div>
              {error && <Alert type="error" className="mt-4">{error}</Alert>}
              <Button loading={loading} disabled={!pastedText.trim() || (!isAdmin && (user?.credits || 0) === 0)} onClick={submitText} className="mt-4 w-full justify-center" size="lg">
                <Icons.Ai />{isAdmin ? "Detect Variables from Text (Free)" : "Detect Variables from Text (1 credit)"}
              </Button>
              <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="text-amber-500 mt-0.5">💡</span>
                <p className="text-xs text-amber-700">Use this tab to paste text directly from any source. DocAuto will detect variables and generate a DOCX output.</p>
              </div>
            </>
          )}

          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Supported:</span> TXT (.txt) · Word (.docx)
            &nbsp;·&nbsp;
            <span className="font-semibold text-slate-700">Not supported:</span> JPG · JPEG · PNG · PDF · Scanned images
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              ["🔒", "Format Preserved", "DOCX layout kept 95–100% intact"],
              ["🤖", "Type-Aware AI", "Detects doc type, extracts only relevant fields"],
              ["✏️", "Manual Select", "Tap any text to convert it to a variable"],
            ].map(([icon, title, desc]) => (
              <div key={title} className="p-3 bg-white rounded-xl border border-slate-100">
                <div className="text-2xl mb-1">{icon}</div>
                <div className="text-xs font-bold text-slate-700">{title}</div>
                <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 1 — Review & Refine Variables ──────────────────────────────── */}
      {step === 1 && (
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Document type badge */}
          {docType && (
            <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl">
              <span className="text-2xl">{docType.emoji || "📄"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-900">
                  {docType.display}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {Math.round((docType.confidence || 0) * 100)}% confidence
                  </span>
                </div>
                <div className="text-xs text-slate-500">Document type detected — only relevant fields are suggested</div>
              </div>
              <Badge color="blue">{docType.type?.replace(/_/g, ' ')}</Badge>
            </div>
          )}

          {/* Interactive text view */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Document Preview</div>
              <div className="text-xs text-indigo-600 font-medium">💡 Select any text → Convert to Variable</div>
            </div>
            <InteractiveDocText
              rawText={rawText}
              placeholders={placeholders}
              onAddPlaceholder={addCustomPlaceholder}
            />
          </div>

          {/* Confirmed variables */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Detected Variables ({approvedPhs.length})
              </div>
              <button
                onClick={rescan}
                disabled={scanning}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 border border-indigo-200 rounded-lg px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 transition-colors"
              >
                {scanning ? "🔄 Scanning…" : "🔄 Scan Again for Missing"}
              </button>
            </div>

            {scanMsg && (
              <div className={`text-xs px-3 py-2 rounded-lg mb-2 ${scanMsg.includes("No additional") ? "bg-slate-100 text-slate-600" : "bg-indigo-50 text-indigo-700 font-medium"}`}>
                {scanMsg}
              </div>
            )}

            {approvedPhs.length === 0 ? (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <div className="text-xs font-semibold text-amber-800 mb-1">
                  {placeholders.length === 0
                    ? "No template variables detected automatically"
                    : "No variables approved yet"}
                </div>
                <div className="text-xs text-amber-700 leading-relaxed">
                  {placeholders.length === 0
                    ? rawText && rawText.length > 10
                      ? "The document text was extracted but no variable patterns (names, dates, IDs, amounts) were found. Try: select text above to mark it as a variable, or use + Add Variable Manually below."
                      : "No text was extracted from this file. If it's a scanned image, try adjusting the preprocessing sliders for better contrast, then re-upload."
                    : "Select text above to approve it as a variable, check suggestions below, or add manually."}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {approvedPhs.map((ph) => {
                  const idx = placeholders.indexOf(ph);
                  return (
                    <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50">
                      <span className="text-emerald-500 text-sm">✓</span>
                      <div className="flex-1 min-w-0">
                        <input
                          value={ph.placeholder}
                          onChange={e => updatePlaceholderName(idx, e.target.value)}
                          className="font-mono text-xs px-2 py-0.5 rounded bg-white border border-emerald-200 text-emerald-800 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-400 w-full"
                        />
                        <div className="text-xs text-slate-500 mt-0.5 truncate">
                          {ph.category === "Manual" ? "👆 Manually added:" : "Detected:"} <span className="text-slate-700">{ph.value}</span>
                        </div>
                      </div>
                      <button onClick={() => togglePlaceholder(idx)} className="text-slate-300 hover:text-red-400 text-sm px-1" title="Remove">✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* AI Suggestions (not yet approved) */}
          {suggestedPhs.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                AI Suggestions — Tap to add ({suggestedPhs.length})
              </div>
              <div className="space-y-2">
                {suggestedPhs.map((ph) => {
                  const idx = placeholders.indexOf(ph);
                  return (
                    <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-slate-300 bg-white hover:bg-slate-50 transition-colors">
                      <button
                        onClick={() => togglePlaceholder(idx)}
                        className="w-5 h-5 rounded border-2 border-slate-300 hover:border-indigo-400 flex items-center justify-center shrink-0 transition-colors"
                        title="Approve this variable"
                      >
                        <span className="text-xs text-slate-400">+</span>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-indigo-700 font-bold">{`{{${ph.placeholder}}}`}</span>
                          <Badge color={CONFIDENCE_COLOR(ph.confidence)} className="text-xs">{ph.category}</Badge>
                        </div>
                        <div className="text-xs text-slate-500 truncate mt-0.5">{ph.value}</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => togglePlaceholder(idx)}
                          className="text-xs bg-indigo-500 text-white px-2 py-1 rounded-lg hover:bg-indigo-600 transition-colors font-medium"
                        >
                          Add
                        </button>
                        <button onClick={() => removePlaceholder(idx)} className="text-slate-300 hover:text-red-400 text-sm px-1">✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manual add variable */}
          <div className="border border-dashed border-slate-300 rounded-xl p-3">
            {!showManualAdd ? (
              <button
                onClick={() => setShowManualAdd(true)}
                className="w-full text-sm text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-2 py-1 transition-colors"
              >
                <span className="text-lg">+</span> Add Variable Manually
              </button>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-600 mb-1">Add Variable Manually</div>
                <input
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Exact text from document (e.g. BUDDEBAIGARI DADAVALLI)"
                />
                <input
                  value={manualKey}
                  onChange={e => setManualKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Variable name (e.g. CHILD_NAME)"
                  onKeyDown={e => { if (e.key === "Enter") addManualVariable(); }}
                />
                <div className="flex gap-2">
                  <Button onClick={addManualVariable} disabled={!manualText.trim() || !manualKey.trim()} variant="primary" size="sm">
                    Add {manualKey ? `{{${manualKey}}}` : "Variable"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowManualAdd(false); setManualText(""); setManualKey(""); }}>Cancel</Button>
                </div>
              </div>
            )}
          </div>

          {error && <Alert type="error">{error}</Alert>}
          <div className="flex gap-3 flex-wrap pt-2">
            <Button loading={loading} onClick={approveAndContinue} variant="primary" size="lg">
              Confirm {approvedPhs.length} Variable{approvedPhs.length !== 1 ? "s" : ""} & Fill Form →
            </Button>
            <Button variant="ghost" onClick={() => setStep(0)}>← Back</Button>
          </div>
        </div>
      )}

      {/* ── Step 2 — Three-panel: Original | Template | Fill Form ───────────── */}
      {step === 2 && (
        <div>
          {hasFormatTemplate && (
            <div className="mb-3 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
              ✅ Format-preserved template created — the output will match your original document layout at 95–100% fidelity
            </div>
          )}
          <div className="mb-3 text-xs text-slate-500 hidden lg:flex items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block"></span> Original — your uploaded file</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span> Template — <span className="text-blue-700 font-mono text-xs">{"{{PLACEHOLDERS}}"}</span> highlighted</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block"></span> Fill in only the {approvedPhs.length} detected field{approvedPhs.length !== 1 ? "s" : ""}</span>
          </div>

          <ComparisonPanel docId={result.id} token={token} showOutput={false}>
            <div className="p-4 space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                Fill in Values — {approvedPhs.length} field{approvedPhs.length !== 1 ? "s" : ""}
              </div>
              {approvedPhs.length === 0 ? (
                <div className="text-sm text-slate-500 p-3 bg-slate-50 rounded-xl">
                  No variables were approved. <button onClick={() => setStep(1)} className="text-indigo-600 underline">← Go back</button> and approve at least one.
                </div>
              ) : (
                approvedPhs.map((ph) => (
                  <div key={ph.placeholder}>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      {ph.placeholder.replace(/_/g, ' ')}
                      {ph.category && <span className="ml-2 text-slate-400 font-normal">({ph.category})</span>}
                    </label>
                    <input
                      value={fillValues[ph.placeholder] ?? ph.value ?? ""}
                      onChange={e => setFillValues(f => ({ ...f, [ph.placeholder]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      placeholder={ph.value || ph.placeholder.replace(/_/g, ' ').toLowerCase()}
                    />
                  </div>
                ))
              )}
            </div>
          </ComparisonPanel>

          {error && <Alert type="error" className="mt-4">{error}</Alert>}
          <div className="flex flex-wrap gap-3 mt-4">
            <Button loading={generating} onClick={generate} variant="success" size="lg">
              <Icons.File /> Generate Format-Preserved DOCX
            </Button>
            <Button variant="ghost" onClick={() => setStep(1)}>← Back to Variables</Button>
          </div>
        </div>
      )}

      {/* ── Step 3 — Three-panel: Original | Template | Output ──────────────── */}
      {step === 3 && (
        <div>
          <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">🎉 Document Generated!</h3>
              <p className="text-sm text-slate-500 mt-0.5">Compare original, template, and filled output below before downloading.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => window.open(`${API}/documents/${result.id}/download?token=${token}`, "_blank")} variant="primary">
                <Icons.Download /> Download DOCX
              </Button>
              {!templateSaved && (
                <Button onClick={() => setShowSaveModal(true)} variant="purple">
                  <Icons.Save /> Save Template
                </Button>
              )}
              <Button variant="secondary" onClick={resetAll} size="sm">New Document</Button>
            </div>
          </div>

          {templateSaved && (
            <Alert type="success" className="mb-3">
              Template saved! <button onClick={() => setPage("templates")} className="font-bold underline ml-1">View Library</button>
            </Alert>
          )}

          <div className="mb-3 text-xs text-slate-500 hidden lg:flex items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block"></span> Original document</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span> Template with placeholders</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Generated output — verify layout matches</span>
          </div>

          <ComparisonPanel docId={result.id} token={token} showOutput={true} />

          {showSaveModal && (
            <Card className="p-5 border-2 border-purple-200 mt-4">
              <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Icons.Save /> Save to Template Library
              </h4>
              <div className="space-y-3">
                <Input label="Template Name *" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. Birth Affidavit" />
                <Select label="Category" value={templateCategory} onChange={e => setTemplateCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
                </Select>
                <Input label="Description (optional)" value={templateDesc} onChange={e => setTemplateDesc(e.target.value)} placeholder="Brief description" />
              </div>
              <div className="flex gap-3 mt-4">
                <Button loading={savingTemplate} onClick={saveTemplate} variant="purple" disabled={!templateName.trim()}>
                  <Icons.Save /> Save Template
                </Button>
                <Button variant="ghost" onClick={() => setShowSaveModal(false)}>Cancel</Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── Template Fill Form Component ─────────────────────────────────────────────
const FIELD_TYPE_META = {
  date:     { icon: "📅", color: "bg-blue-50 text-blue-700 border-blue-200",    badge: "Date" },
  tel:      { icon: "📱", color: "bg-green-50 text-green-700 border-green-200",  badge: "Phone" },
  email:    { icon: "✉️",  color: "bg-purple-50 text-purple-700 border-purple-200", badge: "Email" },
  currency: { icon: "₹",  color: "bg-amber-50 text-amber-700 border-amber-200",  badge: "Amount" },
  textarea: { icon: "📝", color: "bg-orange-50 text-orange-700 border-orange-200", badge: "Text Area" },
  text:     { icon: "🔤", color: "bg-slate-50 text-slate-600 border-slate-200",  badge: "Text" },
};

function LivePreview({ templateContent, fillFields }) {
  const rendered = useMemo(() => {
    if (!templateContent) return "";
    // Replace filled placeholders inline, leave unfilled as highlighted chips
    const escaped = templateContent.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escaped.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
      const val = fillFields[key];
      if (val && val.trim()) {
        return `<span class="inline-block bg-emerald-100 text-emerald-800 border border-emerald-300 rounded px-1.5 py-0.5 font-semibold text-xs mx-0.5">${val.replace(/</g,"&lt;")}</span>`;
      }
      return `<span class="inline-block bg-amber-100 text-amber-700 border border-amber-300 rounded px-1.5 py-0.5 font-mono text-xs mx-0.5">{{${key}}}</span>`;
    });
  }, [templateContent, fillFields]);

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Live Preview</span>
        <span className="text-xs text-slate-400">— filled values shown in green</span>
      </div>
      <div
        className="p-4 text-xs text-slate-700 leading-relaxed overflow-y-auto max-h-52 whitespace-pre-wrap font-sans"
        dangerouslySetInnerHTML={{ __html: rendered.substring(0, 2000) + (rendered.length > 2000 ? "…" : "") }}
      />
    </div>
  );
}

function TemplateFillForm({ schema, fillFields, setFillFields, filling, filled, templateContent, onGenerate, onDownload, onReset }) {
  const fields = schema?.fields || [];
  const filledCount = fields.filter(f => fillFields[f.key] && fillFields[f.key].trim()).length;
  const progress = fields.length > 0 ? Math.round((filledCount / fields.length) * 100) : 0;
  const allFilled = filledCount === fields.length;

  return (
    <div className="space-y-4">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fill Placeholders</span>
          <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">{fields.length} field{fields.length !== 1 ? "s" : ""}</span>
        </div>
        <span className={`text-xs font-bold ${allFilled ? "text-emerald-600" : "text-amber-600"}`}>
          {filledCount}/{fields.length} filled
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${allFilled ? "bg-emerald-500" : "bg-indigo-500"}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Field cards */}
      <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
        {fields.map((f, idx) => {
          const meta = FIELD_TYPE_META[f.type] || FIELD_TYPE_META.text;
          const hasValue = fillFields[f.key] && fillFields[f.key].trim();
          return (
            <div
              key={f.key}
              className={`border rounded-xl p-3 transition-all ${hasValue ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-xs font-bold shrink-0">{idx + 1}</span>
                <code className="flex-1 text-xs font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                  {`{{${f.key}}}`}
                </code>
                <span className={`text-xs font-semibold border rounded px-1.5 py-0.5 ${meta.color}`}>
                  {meta.icon} {meta.badge}
                </span>
                {hasValue && <span className="text-emerald-500 text-sm">✓</span>}
              </div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">{f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}</label>
              {f.type === "textarea" ? (
                <textarea
                  rows={2}
                  value={fillFields[f.key] || ""}
                  onChange={e => setFillFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={`Enter ${f.label.toLowerCase()}…`}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white"
                />
              ) : (
                <input
                  type={f.type === "date" ? "date" : f.type === "tel" ? "tel" : f.type === "email" ? "email" : "text"}
                  value={fillFields[f.key] || ""}
                  onChange={e => setFillFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={`Enter ${f.label.toLowerCase()}…`}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Live preview */}
      {templateContent && <LivePreview templateContent={templateContent} fillFields={fillFields} />}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 pt-1 border-t border-slate-100">
        {!filled ? (
          <>
            <Button loading={filling} onClick={onGenerate} variant="success" className={!allFilled ? "opacity-80" : ""}>
              <Icons.File /> {allFilled ? "Generate Filled DOCX" : `Generate DOCX (${fields.length - filledCount} empty)`}
            </Button>
            {!allFilled && (
              <span className="self-center text-xs text-amber-600">⚠ Empty fields will be marked in red</span>
            )}
          </>
        ) : (
          <>
            <Button onClick={onDownload} variant="primary">
              <Icons.Download /> Download Filled DOCX
            </Button>
            <Button variant="ghost" onClick={onReset}>
              ✏️ Fill Again
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Template Library Page ────────────────────────────────────────────────────
function TemplateLibraryPage({ setPage }) {
  const { token } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [sortBy, setSortBy] = useState("recent"); // recent | most_used | favorites
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState(null);
  const [fillFields, setFillFields] = useState({});
  const [fillSchema, setFillSchema] = useState(null);
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCat, setEditCat] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [newTemplateMode, setNewTemplateMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("Custom Templates");
  const [newDesc, setNewDesc] = useState("");
  const [newContent, setNewContent] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterCat) params.set("category", filterCat);
      const data = await apiFetch(`/templates/?${params}`, {}, token);
      setTemplates(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, filterCat]);

  const sortedTemplates = [...templates].sort((a, b) => {
    if (sortBy === "most_used") return b.use_count - a.use_count;
    if (sortBy === "favorites") return (b.is_favorite ? 1 : 0) - (a.is_favorite ? 1 : 0);
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const openTemplate = async (tmpl) => {
    setSelected(tmpl);
    setFilled(false);
    setFillFields({});
    setEditMode(false);
    try {
      const data = await apiFetch(`/templates/${tmpl.id}/fields`, {}, token);
      const schema = data.field_schema ? JSON.parse(data.field_schema) : null;
      setFillSchema(schema);
      const initial = {};
      (schema?.fields || []).forEach(f => { initial[f.key] = ""; });
      setFillFields(initial);
    } catch {}
  };

  const fillAndDownload = async () => {
    setFilling(true);
    setError("");
    try {
      await apiFetch(`/templates/${selected.id}/fill`, {
        method: "POST",
        body: JSON.stringify({ fields: fillFields }),
      }, token);
      setFilled(true);
    } catch (e) { setError(e.message); }
    setFilling(false);
  };

  const deleteTemplate = async (id) => {
    try {
      await apiFetch(`/templates/${id}`, { method: "DELETE" }, token);
      if (selected?.id === id) setSelected(null);
      setDeleteConfirm(null);
      load();
    } catch (e) { setError(e.message); }
  };

  const duplicateTemplate = async (tmpl) => {
    setDuplicating(true);
    try {
      const copy = await apiFetch(`/templates/${tmpl.id}/duplicate`, { method: "POST" }, token);
      setSuccess(`"${copy.name}" created.`);
      setTimeout(() => setSuccess(""), 3000);
      load();
    } catch (e) { setError(e.message); }
    setDuplicating(false);
  };

  const toggleFavorite = async (tmpl) => {
    try {
      const r = await apiFetch(`/templates/${tmpl.id}/favorite`, { method: "PATCH" }, token);
      setTemplates(prev => prev.map(t => t.id === tmpl.id ? { ...t, is_favorite: r.is_favorite } : t));
      if (selected?.id === tmpl.id) setSelected(s => ({ ...s, is_favorite: r.is_favorite }));
    } catch (e) { setError(e.message); }
  };

  const startEdit = (tmpl) => {
    setEditMode(true);
    setEditName(tmpl.name);
    setEditCat(tmpl.category || "Custom Templates");
    setEditDesc(tmpl.description || "");
    setEditContent(tmpl.template_content);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const updated = await apiFetch(`/templates/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editName, category: editCat, description: editDesc, template_content: editContent }),
      }, token);
      setSelected(updated);
      setEditMode(false);
      load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const createTemplate = async () => {
    if (!newName.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/templates/", {
        method: "POST",
        body: JSON.stringify({ name: newName, category: newCat, description: newDesc, template_content: newContent }),
      }, token);
      setNewTemplateMode(false);
      setNewName(""); setNewCat("Custom Templates"); setNewDesc(""); setNewContent("");
      load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const PLACEHOLDER_HINT = `Example:\n\nI, {{FULL_NAME}}, S/o {{FATHER_NAME}},\nresident of {{ADDRESS}}, {{VILLAGE}},\n{{MANDAL}} Mandal, {{DISTRICT}} District,\ndo hereby solemnly affirm that...`;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-slate-900">📚 Template Library</h2>
          <p className="text-slate-500 text-sm mt-1">{templates.length} template{templates.length !== 1 ? "s" : ""} · reusable, unlimited fills</p>
        </div>
        <Button onClick={() => { setNewTemplateMode(true); setSelected(null); }} variant="primary">
          <Icons.Plus /> New Template
        </Button>
      </div>

      {/* Filters + Sort */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icons.Search /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…" className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="recent">Recent</option>
          <option value="most_used">Most Used</option>
          <option value="favorites">⭐ Favorites</option>
        </select>
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {success && <Alert type="success" className="mb-4">{success}</Alert>}

      {/* New template form */}
      {newTemplateMode && (
        <Card className="p-5 mb-5 border-2 border-indigo-200">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><Icons.Plus /> Create New Template</h3>
          <div className="space-y-3">
            <Input label="Template Name *" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Birth Affidavit - Standard" />
            <Select label="Category" value={newCat} onChange={e => setNewCat(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
            </Select>
            <Input label="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Brief description of this template" />
            <Textarea
              label="Template Content * (use {{FIELD_NAME}} for placeholders)"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              rows={10}
              placeholder={PLACEHOLDER_HINT}
            />
          </div>
          <div className="flex gap-3 mt-4">
            <Button loading={saving} onClick={createTemplate} variant="primary" disabled={!newName.trim() || !newContent.trim()}>
              <Icons.Save /> Save Template
            </Button>
            <Button variant="ghost" onClick={() => setNewTemplateMode(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Template list */}
        <div className="lg:col-span-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400"><Icons.Spinner /></div>
          ) : sortedTemplates.length === 0 ? (
            <Card className="p-10 text-center text-slate-400">
              <div className="text-4xl mb-3">📚</div>
              <div className="font-semibold text-slate-600">No templates yet</div>
              <div className="text-sm mt-1">Upload documents and save templates, or create one manually.</div>
            </Card>
          ) : (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {sortedTemplates.map(t => (
                <button
                  key={t.id}
                  onClick={() => openTemplate(t)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all ${selected?.id === t.id ? "border-indigo-400 bg-indigo-50 shadow-sm" : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="text-xl shrink-0 mt-0.5">{CATEGORY_ICONS[t.category] || "📄"}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-semibold text-slate-900 text-sm truncate">{t.name}</span>
                        {t.is_favorite && <span className="text-amber-400 text-xs">⭐</span>}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{t.category}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {t.use_count > 0 && (
                          <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                            Used {t.use_count}×
                          </span>
                        )}
                        {t.source_doc_id && (
                          <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">AI</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Template detail / fill */}
        <div className="lg:col-span-2">
          {!selected && !newTemplateMode && (
            <Card className="p-12 text-center text-slate-400 flex flex-col items-center justify-center min-h-[300px]">
              <div className="text-5xl mb-4">📋</div>
              <div className="font-semibold text-slate-500">Select a template to fill and download</div>
              <div className="text-sm mt-1">Templates can be reused unlimited times</div>
            </Card>
          )}

          {selected && (
            <Card className="p-5">
              {editMode ? (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <button onClick={() => setEditMode(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                    </button>
                    <h3 className="font-bold text-slate-900">Edit Template</h3>
                  </div>
                  <div className="space-y-3">
                    <Input label="Name" value={editName} onChange={e => setEditName(e.target.value)} />
                    <Select label="Category" value={editCat} onChange={e => setEditCat(e.target.value)}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
                    </Select>
                    <Input label="Description" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                    <Textarea label="Template Content (use {{FIELD_NAME}} for placeholders)" value={editContent} onChange={e => setEditContent(e.target.value)} rows={14} />
                  </div>
                  <div className="flex gap-3 mt-4">
                    <Button loading={saving} onClick={saveEdit} variant="primary"><Icons.Save /> Save Changes</Button>
                    <Button variant="ghost" onClick={() => setEditMode(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div>
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-4 gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xl">{CATEGORY_ICONS[selected.category]}</span>
                        <h3 className="font-bold text-slate-900 text-base lg:text-lg">{selected.name}</h3>
                        {selected.is_favorite && <span className="text-amber-400">⭐</span>}
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                        <span>{selected.category}</span>
                        <span>·</span>
                        <span className="font-semibold text-indigo-600">Used {selected.use_count} time{selected.use_count !== 1 ? "s" : ""}</span>
                        {selected.source_doc_id && <Badge color="teal">AI Generated</Badge>}
                      </div>
                      {selected.description && <div className="text-sm text-slate-500 mt-1">{selected.description}</div>}
                    </div>
                    {/* Action buttons */}
                    <div className="flex gap-1 shrink-0">
                      <button title={selected.is_favorite ? "Remove from favorites" : "Add to favorites"} onClick={() => toggleFavorite(selected)} className={`p-2 rounded-lg transition-colors ${selected.is_favorite ? "text-amber-400 hover:bg-amber-50" : "text-slate-300 hover:text-amber-400 hover:bg-amber-50"}`}>⭐</button>
                      <button title="Edit template" onClick={() => startEdit(selected)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Icons.Edit /></button>
                      <button title="Duplicate template" disabled={duplicating} onClick={() => duplicateTemplate(selected)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                      </button>
                      <button title="Delete template" onClick={() => setDeleteConfirm(selected.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Icons.Trash /></button>
                    </div>
                  </div>

                  {deleteConfirm === selected.id && (
                    <Alert type="error" className="mb-4">
                      <div className="font-semibold mb-2">Delete "{selected.name}"? This cannot be undone.</div>
                      <div className="flex gap-2">
                        <Button variant="danger" size="sm" onClick={() => deleteTemplate(selected.id)}>Yes, Delete</Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                      </div>
                    </Alert>
                  )}

                  {/* Quick actions bar */}
                  <div className="flex gap-2 mb-5 flex-wrap border-t border-slate-100 pt-4">
                    <button
                      onClick={() => window.open(`${API}/templates/${selected.id}/download-template?token=${token}`, "_blank")}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <Icons.Download /> Download Template DOCX
                    </button>
                  </div>

                  {/* Fill form */}
                  {fillSchema?.fields?.length > 0 ? (
                    <TemplateFillForm
                      schema={fillSchema}
                      fillFields={fillFields}
                      setFillFields={setFillFields}
                      filling={filling}
                      filled={filled}
                      templateContent={selected.template_content}
                      onGenerate={fillAndDownload}
                      onDownload={() => window.open(`${API}/templates/${selected.id}/download-filled?token=${token}`, "_blank")}
                      onReset={() => { setFilled(false); const init={}; (fillSchema?.fields||[]).forEach(f=>{init[f.key]="";}); setFillFields(init); }}
                    />
                  ) : (
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Template Preview</div>
                      <pre className="text-xs text-slate-600 bg-slate-50 rounded-xl p-4 overflow-auto max-h-64 whitespace-pre-wrap font-sans border border-slate-100">{selected.template_content?.substring(0, 800)}{selected.template_content?.length > 800 ? "…" : ""}</pre>
                      <div className="mt-3 text-sm text-slate-400">No variable placeholders detected. Download as-is or edit to add fields.</div>
                      <Button onClick={() => window.open(`${API}/templates/${selected.id}/download-template?token=${token}`, "_blank")} variant="secondary" className="mt-3">
                        <Icons.Download /> Download Template
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Documents List ───────────────────────────────────────────────────────────
function DocumentsPage({ setPage }) {
  const { token } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [creatingTemplate, setCreatingTemplate] = useState(null);
  const [searchDoc, setSearchDoc] = useState("");

  const load = () => {
    setLoading(true);
    apiFetch("/documents/", {}, token)
      .then(setDocs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const statusBadge = s => {
    const map = {
      uploaded:   ["slate",  "Uploaded"],
      processed:  ["blue",   "Processed"],
      downloaded: ["green",  "Generated"],
    };
    const [c, l] = map[s] || ["slate", s];
    return <Badge color={c}>{l}</Badge>;
  };

  const deleteDoc = async (id) => {
    try {
      await apiFetch(`/documents/${id}`, { method: "DELETE" }, token);
      setDeleteConfirm(null);
      if (expanded === id) setExpanded(null);
      setDocs(prev => prev.filter(d => d.id !== id));
      setSuccess("Document deleted.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError(e.message); }
  };

  const createTemplate = async (doc) => {
    setCreatingTemplate(doc.id);
    setError("");
    try {
      const r = await apiFetch(`/documents/${doc.id}/create-template`, { method: "POST" }, token);
      if (r.already_existed) {
        setSuccess(`Template already exists: "${r.name}"`);
      } else {
        setSuccess(`Template saved to library: "${r.name}"`);
      }
      setTimeout(() => setSuccess(""), 4000);
      load();
    } catch (e) { setError(e.message); }
    setCreatingTemplate(null);
  };

  const filtered = docs.filter(d =>
    !searchDoc || d.original_filename.toLowerCase().includes(searchDoc.toLowerCase()) ||
    (d.doc_type || "").toLowerCase().includes(searchDoc.toLowerCase())
  );

  if (loading) return <div className="flex items-center gap-3 text-slate-500 py-12 justify-center"><Icons.Spinner /> Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-slate-900">📂 My Documents</h2>
          <p className="text-slate-500 text-sm mt-1">{docs.length} document{docs.length !== 1 ? "s" : ""} processed</p>
        </div>
        <Button onClick={() => setPage("upload")} variant="primary"><Icons.Upload /> Upload New</Button>
      </div>

      {/* Search */}
      {docs.length > 3 && (
        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icons.Search /></span>
          <input value={searchDoc} onChange={e => setSearchDoc(e.target.value)} placeholder="Search by filename or type…" className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      )}

      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {success && <Alert type="success" className="mb-4">{success}</Alert>}

      {filtered.length === 0 ? (
        <Card className="p-16 text-center text-slate-400">
          <div className="text-5xl mb-4">📄</div>
          <div className="font-semibold text-slate-600">{docs.length === 0 ? "No documents yet" : "No documents match your search"}</div>
          <div className="text-sm mt-1">{docs.length === 0 ? "Upload your first document to get started" : "Try a different search term"}</div>
          {docs.length === 0 && <Button onClick={() => setPage("upload")} variant="primary" className="mt-5"><Icons.Upload /> Upload Document</Button>}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(doc => {
            const isExpanded = expanded === doc.id;
            const hasOutput = !!doc.output_path;
            const hasTemplate = !!doc.template_content;
            const docTypeLabel = doc.doc_type || "Document";

            return (
              <Card key={doc.id} className={`overflow-hidden transition-all ${isExpanded ? "shadow-md" : ""}`}>
                {/* Main row */}
                <div
                  className="p-4 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : doc.id)}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${hasOutput ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                    <Icons.File />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 text-sm truncate">{doc.original_filename}</div>
                    <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{new Date(doc.created_at).toLocaleDateString("en-IN")}</span>
                      <span>·</span>
                      <span className="text-slate-500">{docTypeLabel}</span>
                      <span>·</span>
                      {doc.credits_used === 0 ? <span className="text-purple-600 font-medium">Admin</span> : <span>{doc.credits_used} credit{doc.credits_used !== 1 ? "s" : ""}</span>}
                      <span>·</span>
                      {statusBadge(doc.status)}
                    </div>
                  </div>
                  {/* Quick download */}
                  {hasOutput && (
                    <button
                      onClick={e => { e.stopPropagation(); window.open(`${API}/documents/${doc.id}/download?token=${token}`, "_blank"); }}
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors shrink-0"
                      title="Download DOCX"
                    >
                      <Icons.Download />
                    </button>
                  )}
                  <span className={`text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><polyline points="6 9 12 15 18 9"/></svg>
                  </span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4">
                    {/* Three file states */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      {/* Original */}
                      <div className="bg-white rounded-xl p-3 border border-slate-200">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">📥 Original</div>
                        <div className="text-xs text-slate-600 truncate mb-2">{doc.original_filename}</div>
                        <a
                          href={`${API}/documents/${doc.id}/preview-original?token=${token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                        >
                          <Icons.Eye /> Preview
                        </a>
                      </div>

                      {/* Template */}
                      <div className={`bg-white rounded-xl p-3 border ${hasTemplate ? "border-purple-200" : "border-slate-200"}`}>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">📋 Template</div>
                        {hasTemplate ? (
                          <>
                            <div className="text-xs text-emerald-600 font-semibold mb-2">✓ Ready</div>
                            <a
                              href={`${API}/documents/${doc.id}/preview-template?token=${token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                            >
                              <Icons.Eye /> Preview
                            </a>
                          </>
                        ) : (
                          <div className="text-xs text-slate-400">Not created yet</div>
                        )}
                      </div>

                      {/* Output */}
                      <div className={`bg-white rounded-xl p-3 border ${hasOutput ? "border-emerald-200" : "border-slate-200"}`}>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">📄 Output</div>
                        {hasOutput ? (
                          <>
                            <div className="text-xs text-emerald-600 font-semibold mb-2">✓ Generated</div>
                            <a
                              href={`${API}/documents/${doc.id}/preview-output?token=${token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                            >
                              <Icons.Eye /> Preview
                            </a>
                          </>
                        ) : (
                          <div className="text-xs text-slate-400">Not generated yet</div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      {hasOutput && (
                        <button
                          onClick={() => window.open(`${API}/documents/${doc.id}/download?token=${token}`, "_blank")}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          <Icons.Download /> Download DOCX
                        </button>
                      )}
                      {hasTemplate && (
                        <button
                          disabled={creatingTemplate === doc.id}
                          onClick={() => createTemplate(doc)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                        >
                          <Icons.Template />
                          {creatingTemplate === doc.id ? "Saving…" : "Save to Library"}
                        </button>
                      )}
                      {hasTemplate && (
                        <button
                          disabled={creatingTemplate === doc.id}
                          onClick={async () => {
                            setCreatingTemplate(doc.id);
                            try {
                              await apiFetch(`/documents/${doc.id}/create-template`, { method: "POST" }, token);
                            } catch {}
                            setCreatingTemplate(null);
                            setPage("templates");
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          {creatingTemplate === doc.id ? "Saving…" : "🔄 Reuse Template"}
                        </button>
                      )}
                      {!hasOutput && (
                        <button
                          onClick={() => setPage("upload")}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                        >
                          <Icons.Upload /> Continue Processing
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteConfirm(doc.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors ml-auto"
                      >
                        <Icons.Trash /> Delete
                      </button>
                    </div>

                    {deleteConfirm === doc.id && (
                      <Alert type="error" className="mt-3">
                        <div className="font-semibold mb-2">Delete "{doc.original_filename}"? This cannot be undone.</div>
                        <div className="flex gap-2">
                          <Button variant="danger" size="sm" onClick={() => deleteDoc(doc.id)}>Yes, Delete</Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                        </div>
                      </Alert>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Recharge / Buy Credits ───────────────────────────────────────────────────
function RechargePage() {
  const { token, refreshUser, user } = useAuth();
  const [packs, setPacks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [upiRef, setUpiRef] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [payments, setPayments] = useState([]);
  const [enquiryMsg, setEnquiryMsg] = useState("");
  const [enquirySent, setEnquirySent] = useState(false);
  const [upiCopied, setUpiCopied] = useState(false);

  const UPI_ID = "9014860890@kotak811";

  useEffect(() => {
    apiFetch("/payments/packs", {}, token).then(setPacks).catch(() => {});
    apiFetch("/payments/my", {}, token).then(setPayments).catch(() => {});
  }, [success]);

  const handleScreenshot = e => {
    const f = e.target.files[0];
    if (!f) return;
    setScreenshot(f);
    setScreenshotPreview(URL.createObjectURL(f));
  };

  const copyUpi = async () => {
    try { await navigator.clipboard.writeText(UPI_ID); setUpiCopied(true); setTimeout(() => setUpiCopied(false), 2000); } catch {}
  };

  const submit = async () => {
    if (!screenshot || !selected) { setError("Please select a pack and upload a payment screenshot."); return; }
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

  const statusBadge = s => {
    const map = { pending: ["yellow", "Pending"], approved: ["green", "Approved"], rejected: ["red", "Rejected"] };
    const [c, l] = map[s] || ["slate", s];
    return <Badge color={c}>{l}</Badge>;
  };

  if (user?.role === "admin") {
    return (
      <div className="max-w-xl mx-auto">
        <div className="mb-6"><h2 className="text-xl lg:text-2xl font-bold text-slate-900">Credits</h2></div>
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-6 text-white text-center">
          <div className="text-4xl mb-2">∞</div>
          <div className="font-bold text-xl">Unlimited Credits</div>
          <div className="text-purple-200 text-sm mt-1">Admin accounts have no credit limits</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl lg:text-2xl font-bold text-slate-900">Buy Credits</h2>
        <p className="text-slate-500 text-sm mt-1">1 credit = 1 document. Buy more, save more.</p>
      </div>

      <div className="mb-6">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Step 1 — Choose a Pack</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {packs.map(pack => {
            const isSelected = selected?.amount === pack.amount;
            const isBestValue = pack.amount === 100;
            return (
              <button key={pack.amount} onClick={() => setSelected(pack)} className={`relative p-4 rounded-2xl border-2 text-left transition-all active:scale-95 ${isSelected ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100" : "border-slate-200 bg-white hover:border-indigo-300"}`}>
                {isBestValue && <span className="absolute -top-2.5 left-2 bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">Best Value</span>}
                <div className="text-2xl font-black text-slate-900">₹{pack.amount}</div>
                <div className="text-sm font-bold text-indigo-600 mt-0.5">{pack.credits} credits</div>
                <div className="text-xs text-slate-400 mt-1">₹{pack.per_doc}/doc</div>
                {isSelected && <div className="absolute top-2 right-2 text-indigo-600"><Icons.Check /></div>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-6">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Step 2 — Pay via UPI</div>
        <Card className="p-5">
          <div className="flex flex-col sm:flex-row items-center gap-5 mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="shrink-0 p-2 bg-white rounded-xl border border-slate-200 shadow-sm">
              <QRCodeSVG value={`upi://pay?pa=${UPI_ID}&pn=DocAuto&cu=INR${selected ? `&am=${selected.amount}` : ""}`} size={130} bgColor="#ffffff" fgColor="#1e1b4b" level="M" />
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="text-xs text-slate-500 font-semibold uppercase mb-1">UPI ID</div>
              <div className="font-mono font-bold text-slate-900 text-base break-all">{UPI_ID}</div>
              <button onClick={copyUpi} className="text-sm text-indigo-600 hover:underline mt-2">{upiCopied ? "✅ Copied!" : "📋 Copy UPI ID"}</button>
              <div className="mt-3 text-xs text-slate-400 flex flex-wrap gap-1">
                {["Google Pay", "PhonePe", "Paytm", "BHIM"].map(a => <span key={a} className="bg-white border border-slate-200 px-2 py-1 rounded-lg">{a}</span>)}
              </div>
            </div>
          </div>
          {selected && <div className="bg-indigo-50 rounded-xl px-4 py-3 flex justify-between items-center border border-indigo-200"><span className="text-sm text-indigo-700 font-semibold">{selected.credits} credits</span><span className="text-xl font-black text-indigo-900">₹{selected.amount}</span></div>}
          {!selected && <Alert type="info">Select a pack above to generate the exact QR code.</Alert>}
        </Card>
      </div>

      <div className="mb-6">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Step 3 — Upload Payment Screenshot</div>
        <Card className="p-5">
          <div className="flex flex-col gap-4">
            <Input label="UPI Reference / UTR Number (optional)" placeholder="e.g. 407123456789" value={upiRef} onChange={e => setUpiRef(e.target.value)} hint="Found in your payment app" />
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Payment Screenshot *</label>
              <div onClick={() => document.getElementById("ssInput").click()} className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all">
                <input id="ssInput" type="file" accept="image/*" className="hidden" onChange={handleScreenshot} />
                {screenshotPreview ? (
                  <div className="flex items-center gap-3 justify-center">
                    <img src={screenshotPreview} className="w-20 h-20 object-cover rounded-lg border border-slate-200" alt="preview" />
                    <div className="text-left"><div className="text-sm font-semibold text-slate-900">{screenshot.name}</div><div className="text-xs text-indigo-600 mt-1">Tap to change</div></div>
                  </div>
                ) : (
                  <div><div className="text-3xl mb-2">📸</div><div className="text-sm font-medium text-slate-700">Tap to upload screenshot</div></div>
                )}
              </div>
            </div>
            {error && <Alert type="error">{error}</Alert>}
            <Button loading={loading} disabled={!screenshot || !selected} onClick={submit} size="lg" className="w-full justify-center">Submit Payment for Approval</Button>
            <p className="text-xs text-slate-400 text-center">Credits added after admin verifies (usually within 30 min)</p>
          </div>
        </Card>
      </div>

      {success && (
        <Alert type="success" className="mb-6">
          Payment submitted! We'll verify and add your credits shortly.
          <button className="block mt-2 text-sm font-semibold underline" onClick={() => { setSuccess(false); setSelected(null); setScreenshot(null); setScreenshotPreview(null); setUpiRef(""); }}>Submit another</button>
        </Alert>
      )}

      {payments.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">My Payment History</div>
          <div className="flex flex-col gap-2">
            {payments.slice(0, 5).map(p => (
              <Card key={p.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">₹{p.amount} → {p.credits} credits</div>
                    <div className="text-xs text-slate-400">{new Date(p.created_at).toLocaleDateString("en-IN")}</div>
                  </div>
                  {statusBadge(p.status)}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card className="p-4 border-dashed border-2 border-slate-200">
        <div className="flex items-start gap-3">
          <div className="text-green-500 mt-0.5 shrink-0"><Icons.WA /></div>
          <div className="flex-1">
            <div className="font-semibold text-slate-900 text-sm">Need 100+ documents? Get bulk pricing</div>
            <div className="text-xs text-slate-500 mb-3 mt-0.5">Contact us for custom pricing.</div>
            {!enquirySent ? (
              <div className="flex gap-2">
                <input value={enquiryMsg} onChange={e => setEnquiryMsg(e.target.value)} placeholder="Describe your requirement…" className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <Button onClick={async () => { try { await apiFetch("/payments/bulk-enquiry", { method: "POST", body: JSON.stringify({ message: enquiryMsg }) }, token); setEnquirySent(true); } catch {} }} variant="secondary" size="sm">WhatsApp</Button>
              </div>
            ) : (
              <Alert type="success">Enquiry sent! We'll contact you on WhatsApp.</Alert>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Resume Builder ───────────────────────────────────────────────────────────
const RESUME_TYPES = [
  { id: "fresher",     label: "Fresher / Student",    icon: "🎓", desc: "Perfect for fresh graduates — education, projects, skills", color: "bg-blue-50 border-blue-200 hover:border-blue-400" },
  { id: "experienced", label: "Experienced Professional", icon: "💼", desc: "Multi-section with work history, achievements & certifications", color: "bg-emerald-50 border-emerald-200 hover:border-emerald-400" },
  { id: "creative",    label: "Creative / Designer",   icon: "🎨", desc: "Bold layout with portfolio link and highlighted skills", color: "bg-purple-50 border-purple-200 hover:border-purple-400" },
];

const EMPTY_FORM = () => ({
  personal: { name: "", phone: "", email: "", location: "", linkedin: "", portfolio: "" },
  summary: "",
  education: [{ institution: "", degree: "", field: "", year: "", grade: "" }],
  experience: [{ company: "", title: "", start: "", end: "", current: false, description: "" }],
  skillsText: "",
  certifications: [{ name: "", issuer: "", year: "" }],
  projects: [{ name: "", description: "", tech: "", url: "" }],
  achievementsText: "",
});

function arrAdd(arr, template) { return [...arr, { ...template }]; }
function arrRemove(arr, idx)   { return arr.filter((_, i) => i !== idx); }
function arrUpdate(arr, idx, key, val) {
  return arr.map((item, i) => i === idx ? { ...item, [key]: val } : item);
}

function ResumePage() {
  const { token, user, refreshUser } = useAuth();
  const [view, setView] = useState("list");       // list | typeSelect | edit | preview
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [resumeId, setResumeId] = useState(null);
  const [resumeType, setResumeType] = useState("fresher");
  const [versionName, setVersionName] = useState("My Resume");
  const [form, setForm] = useState(EMPTY_FORM());
  const [step, setStep] = useState(0);           // 0 personal | 1 education | 2 expOrProj | 3 skills | 4 preview
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const clearMsgs = () => { setError(""); setSuccess(""); };

  const loadVersions = () => {
    setLoadingVersions(true);
    apiFetch("/resumes/", {}, token)
      .then(setVersions)
      .catch(e => setError(e.message))
      .finally(() => setLoadingVersions(false));
  };
  useEffect(() => { loadVersions(); }, []);

  const formToJson = () => {
    const skills = form.skillsText.split(",").map(s => s.trim()).filter(Boolean);
    const achievements = form.achievementsText.split("\n").map(s => s.trim()).filter(Boolean);
    return JSON.stringify({
      type: resumeType,
      personal: form.personal,
      summary: form.summary,
      education: form.education,
      experience: form.experience,
      skills,
      certifications: form.certifications,
      projects: form.projects,
      achievements,
    });
  };

  const loadFormFromJson = (json, type) => {
    try {
      const d = JSON.parse(json);
      setForm({
        personal:         d.personal || { name: "", phone: "", email: "", location: "", linkedin: "", portfolio: "" },
        summary:          d.summary || "",
        education:        d.education?.length ? d.education : [{ institution: "", degree: "", field: "", year: "", grade: "" }],
        experience:       d.experience?.length ? d.experience : [{ company: "", title: "", start: "", end: "", current: false, description: "" }],
        skillsText:       Array.isArray(d.skills) ? d.skills.join(", ") : (d.skills || ""),
        certifications:   d.certifications?.length ? d.certifications : [{ name: "", issuer: "", year: "" }],
        projects:         d.projects?.length ? d.projects : [{ name: "", description: "", tech: "", url: "" }],
        achievementsText: Array.isArray(d.achievements) ? d.achievements.join("\n") : (d.achievements || ""),
      });
      setResumeType(type || d.type || "fresher");
    } catch {}
  };

  const startNew = (type) => {
    setResumeType(type);
    setVersionName("My Resume");
    setForm(EMPTY_FORM());
    setForm(f => ({ ...f, personal: { ...f.personal, name: user?.name || "" } }));
    setResumeId(null);
    setStep(0);
    setPreviewReady(false);
    setDownloadReady(false);
    clearMsgs();
    setView("edit");
  };

  const editVersion = (r) => {
    setResumeId(r.id);
    setVersionName(r.version_name);
    setPreviewReady(!!r.preview_path);
    setDownloadReady(!!r.output_path);
    loadFormFromJson(r.data_json || "{}", r.resume_type);
    setStep(0);
    clearMsgs();
    setView("edit");
  };

  const saveAndContinue = async () => {
    clearMsgs(); setSaving(true);
    try {
      const data_json = formToJson();
      if (!resumeId) {
        const r = await apiFetch("/resumes/", { method: "POST", body: JSON.stringify({ resume_type: resumeType, version_name: versionName, data_json }) }, token);
        setResumeId(r.id);
        setSuccess("Saved!");
      } else {
        await apiFetch(`/resumes/${resumeId}`, { method: "PUT", body: JSON.stringify({ version_name: versionName, data_json }) }, token);
        setPreviewReady(false); setDownloadReady(false);
        setSuccess("Saved!");
      }
      setTimeout(() => setSuccess(""), 2000);
      if (step < 4) setStep(s => s + 1);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const saveOnly = async () => {
    clearMsgs(); setSaving(true);
    try {
      const data_json = formToJson();
      if (!resumeId) {
        const r = await apiFetch("/resumes/", { method: "POST", body: JSON.stringify({ resume_type: resumeType, version_name: versionName, data_json }) }, token);
        setResumeId(r.id);
      } else {
        await apiFetch(`/resumes/${resumeId}`, { method: "PUT", body: JSON.stringify({ version_name: versionName, data_json }) }, token);
        setPreviewReady(false); setDownloadReady(false);
      }
      setSuccess("Draft saved."); setTimeout(() => setSuccess(""), 2000);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const generatePreview = async () => {
    if (!resumeId) { setError("Save your details first."); return; }
    clearMsgs(); setGenerating(true);
    try {
      const data_json = formToJson();
      await apiFetch(`/resumes/${resumeId}`, { method: "PUT", body: JSON.stringify({ data_json }) }, token);
      await apiFetch(`/resumes/${resumeId}/preview`, { method: "POST" }, token);
      setPreviewReady(true);
      setSuccess("Preview ready! Click to download the watermarked preview.");
    } catch (e) { setError(e.message); }
    setGenerating(false);
  };

  const generateDownload = async () => {
    if (!resumeId) { setError("Save your details first."); return; }
    clearMsgs(); setDownloading(true);
    try {
      const data_json = formToJson();
      await apiFetch(`/resumes/${resumeId}`, { method: "PUT", body: JSON.stringify({ data_json }) }, token);
      const r = await apiFetch(`/resumes/${resumeId}/download`, { method: "POST" }, token);
      setDownloadReady(true);
      if (r.credits_used > 0) {
        setSuccess(`Resume generated! ${r.credits_used} credit deducted.`);
        refreshUser && refreshUser();
      } else {
        setSuccess("Resume generated successfully!");
      }
    } catch (e) { setError(e.message); }
    setDownloading(false);
  };

  const deleteVersion = async (id) => {
    try {
      await apiFetch(`/resumes/${id}`, { method: "DELETE" }, token);
      setDeleteConfirm(null);
      loadVersions();
    } catch (e) { setError(e.message); }
  };

  const goBack = () => { setView("list"); loadVersions(); clearMsgs(); };

  const setP = (key) => (e) => setForm(f => ({ ...f, personal: { ...f.personal, [key]: e.target.value } }));

  const STEPS = ["Personal", resumeType === "experienced" ? "Education" : "Education", resumeType !== "fresher" ? "Experience" : "Projects", "Skills", "Preview"];

  // ── Render: List ────────────────────────────────────────────────────────────
  if (view === "list") {
    const typeColor = { fresher: "text-blue-600 bg-blue-50", experienced: "text-emerald-600 bg-emerald-50", creative: "text-purple-600 bg-purple-50" };
    const typeIcon  = { fresher: "🎓", experienced: "💼", creative: "🎨" };
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-slate-900">📝 Resume Builder</h2>
            <p className="text-slate-500 text-sm mt-1">Create professional resumes — Fresher, Experienced, or Creative</p>
          </div>
          <Button onClick={() => setView("typeSelect")} variant="primary"><span>＋</span> New Resume</Button>
        </div>
        {error && <Alert type="error" className="mb-4">{error}</Alert>}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <Card className="p-6 max-w-sm w-full">
              <div className="text-lg font-bold text-slate-900 mb-2">Delete Resume?</div>
              <p className="text-sm text-slate-600 mb-4">Delete <strong>"{deleteConfirm.version_name}"</strong>? This cannot be undone.</p>
              <div className="flex gap-3">
                <Button onClick={() => deleteVersion(deleteConfirm.id)} variant="danger" className="flex-1">Delete</Button>
                <Button onClick={() => setDeleteConfirm(null)} variant="outline" className="flex-1">Cancel</Button>
              </div>
            </Card>
          </div>
        )}
        {loadingVersions ? (
          <div className="flex items-center gap-3 text-slate-500 py-12 justify-center"><Icons.Spinner /> Loading…</div>
        ) : versions.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="text-5xl mb-4">📝</div>
            <div className="font-semibold text-slate-700 text-lg">No resumes yet</div>
            <p className="text-slate-500 text-sm mt-2 mb-6">Build your first professional resume in minutes</p>
            <Button onClick={() => setView("typeSelect")} variant="primary" size="lg">Create Your Resume</Button>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {versions.map(r => (
              <Card key={r.id} className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">{typeIcon[r.resume_type] || "📝"}</div>
                    <div>
                      <div className="font-bold text-slate-900">{r.version_name}</div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor[r.resume_type] || "text-slate-600 bg-slate-50"}`}>
                          {r.resume_type}
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.status === "generated" ? "text-emerald-600 bg-emerald-50" : "text-amber-600 bg-amber-50"}`}>
                          {r.status}
                        </span>
                        <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString("en-IN")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.output_path && (
                      <a href={`/api/resumes/${r.id}/download-file?token=${token}`} download
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-all">
                        ⬇ Download
                      </a>
                    )}
                    <Button onClick={() => editVersion(r)} variant="outline" size="sm">✏️ Edit</Button>
                    <Button onClick={() => setDeleteConfirm(r)} variant="danger" size="sm">🗑</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render: Type Selection ───────────────────────────────────────────────────
  if (view === "typeSelect") {
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={() => setView("list")} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6 font-medium">← Back</button>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Choose Resume Type</h2>
        <p className="text-slate-500 text-sm mb-6">Pick the template that best fits your profile</p>
        {error && <Alert type="error" className="mb-4">{error}</Alert>}
        <div className="flex flex-col gap-4">
          {RESUME_TYPES.map(t => (
            <button key={t.id} onClick={() => startNew(t.id)}
              className={`text-left p-5 rounded-2xl border-2 transition-all group ${t.color}`}>
              <div className="flex items-center gap-4">
                <div className="text-4xl">{t.icon}</div>
                <div>
                  <div className="font-bold text-slate-900 text-base group-hover:text-indigo-700 transition-colors">{t.label}</div>
                  <div className="text-sm text-slate-500 mt-0.5">{t.desc}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Render: Edit ──────────────────────────────────────────────────────────────
  const isExperienced = resumeType === "experienced";
  const isFresher     = resumeType === "fresher";

  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const labelCls = "text-xs font-semibold text-slate-600 mb-1 block";
  const Field = ({ label, value, onChange, placeholder = "", type = "text", className = "" }) => (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} className={inputCls} />
    </div>
  );
  const Textarea = ({ label, value, onChange, placeholder = "", rows = 3 }) => (
    <div>
      <label className={labelCls}>{label}</label>
      <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} className={inputCls + " resize-none"} />
    </div>
  );

  const renderStep = () => {
    if (step === 0) return (
      <div className="space-y-4">
        <h3 className="font-bold text-slate-900 text-base">Personal Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name *" value={form.personal.name} onChange={e => setP("name")(e)} placeholder="e.g. Ravi Kumar" />
          <Field label="Phone Number" value={form.personal.phone} onChange={e => setP("phone")(e)} placeholder="e.g. +91 9876543210" />
          <Field label="Email Address" type="email" value={form.personal.email} onChange={e => setP("email")(e)} placeholder="you@example.com" />
          <Field label="Location / City" value={form.personal.location} onChange={e => setP("location")(e)} placeholder="e.g. Hyderabad, Telangana" />
          <Field label="LinkedIn URL" value={form.personal.linkedin} onChange={e => setP("linkedin")(e)} placeholder="linkedin.com/in/yourname" />
          <Field label={resumeType === "creative" ? "Portfolio / Website" : "Portfolio (optional)"} value={form.personal.portfolio} onChange={e => setP("portfolio")(e)} placeholder="yourwebsite.com" />
        </div>
        <Textarea label="Professional Summary / Objective" value={form.summary}
          onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
          placeholder={isFresher ? "Brief objective statement e.g. Motivated B.Tech graduate seeking opportunities in software development…" : "Brief professional summary highlighting your key strengths and experience…"}
          rows={3} />
      </div>
    );

    if (step === 1) return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-base">Education</h3>
          <Button size="sm" variant="outline" onClick={() => setForm(f => ({ ...f, education: arrAdd(f.education, { institution: "", degree: "", field: "", year: "", grade: "" }) }))}>+ Add</Button>
        </div>
        {form.education.map((edu, i) => (
          <Card key={i} className="p-4 relative">
            {form.education.length > 1 && (
              <button onClick={() => setForm(f => ({ ...f, education: arrRemove(f.education, i) }))}
                className="absolute top-3 right-3 text-slate-300 hover:text-red-500 text-lg font-bold transition-colors">×</button>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Institution / University *" value={edu.institution}
                onChange={e => setForm(f => ({ ...f, education: arrUpdate(f.education, i, "institution", e.target.value) }))}
                placeholder="e.g. Osmania University" className="sm:col-span-2" />
              <Field label="Degree" value={edu.degree}
                onChange={e => setForm(f => ({ ...f, education: arrUpdate(f.education, i, "degree", e.target.value) }))}
                placeholder="e.g. B.Tech, MBA, B.Com" />
              <Field label="Field of Study" value={edu.field}
                onChange={e => setForm(f => ({ ...f, education: arrUpdate(f.education, i, "field", e.target.value) }))}
                placeholder="e.g. Computer Science" />
              <Field label="Year of Passing" value={edu.year}
                onChange={e => setForm(f => ({ ...f, education: arrUpdate(f.education, i, "year", e.target.value) }))}
                placeholder="e.g. 2023" />
              <Field label="Grade / CGPA / Percentage" value={edu.grade}
                onChange={e => setForm(f => ({ ...f, education: arrUpdate(f.education, i, "grade", e.target.value) }))}
                placeholder="e.g. 8.5 CGPA / 78%" />
            </div>
          </Card>
        ))}
      </div>
    );

    if (step === 2 && !isFresher) return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-base">Work Experience</h3>
          <Button size="sm" variant="outline" onClick={() => setForm(f => ({ ...f, experience: arrAdd(f.experience, { company: "", title: "", start: "", end: "", current: false, description: "" }) }))}>+ Add</Button>
        </div>
        {form.experience.map((exp, i) => (
          <Card key={i} className="p-4 relative">
            {form.experience.length > 1 && (
              <button onClick={() => setForm(f => ({ ...f, experience: arrRemove(f.experience, i) }))}
                className="absolute top-3 right-3 text-slate-300 hover:text-red-500 text-lg font-bold transition-colors">×</button>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Job Title *" value={exp.title}
                onChange={e => setForm(f => ({ ...f, experience: arrUpdate(f.experience, i, "title", e.target.value) }))}
                placeholder="e.g. Software Engineer" />
              <Field label="Company *" value={exp.company}
                onChange={e => setForm(f => ({ ...f, experience: arrUpdate(f.experience, i, "company", e.target.value) }))}
                placeholder="e.g. Infosys Limited" />
              <Field label="Start Date" value={exp.start}
                onChange={e => setForm(f => ({ ...f, experience: arrUpdate(f.experience, i, "start", e.target.value) }))}
                placeholder="e.g. Jan 2022" />
              <Field label="End Date" value={exp.end}
                onChange={e => setForm(f => ({ ...f, experience: arrUpdate(f.experience, i, "end", e.target.value) }))}
                placeholder="e.g. Dec 2023 or Present" />
              <div className="sm:col-span-2 flex items-center gap-2">
                <input type="checkbox" checked={exp.current} id={`cur-${i}`}
                  onChange={e => setForm(f => ({ ...f, experience: arrUpdate(f.experience, i, "current", e.target.checked) }))}
                  className="rounded text-indigo-600 w-4 h-4" />
                <label htmlFor={`cur-${i}`} className="text-sm text-slate-600">Currently working here</label>
              </div>
              <div className="sm:col-span-2">
                <Textarea label="Key Responsibilities / Achievements" value={exp.description}
                  onChange={e => setForm(f => ({ ...f, experience: arrUpdate(f.experience, i, "description", e.target.value) }))}
                  placeholder="• Led a team of 5 developers to build X feature&#10;• Reduced page load time by 40%&#10;• Managed end-to-end deployment pipeline"
                  rows={3} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );

    if (step === 2 && isFresher) return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-base">Projects</h3>
          <Button size="sm" variant="outline" onClick={() => setForm(f => ({ ...f, projects: arrAdd(f.projects, { name: "", description: "", tech: "", url: "" }) }))}>+ Add</Button>
        </div>
        {form.projects.map((proj, i) => (
          <Card key={i} className="p-4 relative">
            {form.projects.length > 1 && (
              <button onClick={() => setForm(f => ({ ...f, projects: arrRemove(f.projects, i) }))}
                className="absolute top-3 right-3 text-slate-300 hover:text-red-500 text-lg font-bold transition-colors">×</button>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Project Name *" value={proj.name}
                onChange={e => setForm(f => ({ ...f, projects: arrUpdate(f.projects, i, "name", e.target.value) }))}
                placeholder="e.g. E-Commerce Website" />
              <Field label="Technologies Used" value={proj.tech}
                onChange={e => setForm(f => ({ ...f, projects: arrUpdate(f.projects, i, "tech", e.target.value) }))}
                placeholder="e.g. React, Node.js, MongoDB" />
              <Field label="Project URL / GitHub" value={proj.url}
                onChange={e => setForm(f => ({ ...f, projects: arrUpdate(f.projects, i, "url", e.target.value) }))}
                placeholder="github.com/yourname/project" className="sm:col-span-2" />
              <div className="sm:col-span-2">
                <Textarea label="Project Description" value={proj.description}
                  onChange={e => setForm(f => ({ ...f, projects: arrUpdate(f.projects, i, "description", e.target.value) }))}
                  placeholder="Brief description of what the project does, your role and key features…"
                  rows={2} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );

    if (step === 3) return (
      <div className="space-y-5">
        <div>
          <h3 className="font-bold text-slate-900 text-base mb-3">Skills & Certifications</h3>
          <div>
            <label className={labelCls}>Skills (comma-separated) *</label>
            <input value={form.skillsText}
              onChange={e => setForm(f => ({ ...f, skillsText: e.target.value }))}
              placeholder="e.g. JavaScript, Python, SQL, Communication, Problem Solving"
              className={inputCls} />
            <p className="text-xs text-slate-400 mt-1">Separate skills with commas</p>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-bold text-slate-900">Certifications</label>
            <Button size="sm" variant="outline" onClick={() => setForm(f => ({ ...f, certifications: arrAdd(f.certifications, { name: "", issuer: "", year: "" }) }))}>+ Add</Button>
          </div>
          {form.certifications.map((cert, i) => (
            <div key={i} className="grid grid-cols-3 gap-3 mb-3 items-start">
              <input value={cert.name} onChange={e => setForm(f => ({ ...f, certifications: arrUpdate(f.certifications, i, "name", e.target.value) }))}
                placeholder="Certificate name" className={inputCls} />
              <input value={cert.issuer} onChange={e => setForm(f => ({ ...f, certifications: arrUpdate(f.certifications, i, "issuer", e.target.value) }))}
                placeholder="Issuer (e.g. Google)" className={inputCls} />
              <div className="flex gap-2">
                <input value={cert.year} onChange={e => setForm(f => ({ ...f, certifications: arrUpdate(f.certifications, i, "year", e.target.value) }))}
                  placeholder="Year" className={inputCls} />
                {form.certifications.length > 1 && (
                  <button onClick={() => setForm(f => ({ ...f, certifications: arrRemove(f.certifications, i) }))}
                    className="text-slate-300 hover:text-red-500 text-lg font-bold px-1 transition-colors">×</button>
                )}
              </div>
            </div>
          ))}
        </div>
        {isExperienced && (
          <div>
            <label className={labelCls}>Achievements (one per line)</label>
            <textarea value={form.achievementsText}
              onChange={e => setForm(f => ({ ...f, achievementsText: e.target.value }))}
              placeholder="Best Employee of the Quarter – Q3 2023&#10;Published paper in IEEE journal&#10;Won internal hackathon among 200+ participants"
              rows={3} className={inputCls + " resize-none"} />
          </div>
        )}
        {!isExperienced && resumeType === "creative" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-slate-900">Projects / Portfolio</label>
              <Button size="sm" variant="outline" onClick={() => setForm(f => ({ ...f, projects: arrAdd(f.projects, { name: "", description: "", tech: "", url: "" }) }))}>+ Add</Button>
            </div>
            {form.projects.map((proj, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 p-3 bg-slate-50 rounded-xl">
                <input value={proj.name} onChange={e => setForm(f => ({ ...f, projects: arrUpdate(f.projects, i, "name", e.target.value) }))}
                  placeholder="Project name" className={inputCls} />
                <input value={proj.url} onChange={e => setForm(f => ({ ...f, projects: arrUpdate(f.projects, i, "url", e.target.value) }))}
                  placeholder="URL / link" className={inputCls} />
                <input value={proj.tech} onChange={e => setForm(f => ({ ...f, projects: arrUpdate(f.projects, i, "tech", e.target.value) }))}
                  placeholder="Tools / stack" className={inputCls} />
                {form.projects.length > 1 && (
                  <button onClick={() => setForm(f => ({ ...f, projects: arrRemove(f.projects, i) }))}
                    className="text-xs text-red-500 hover:text-red-700 font-semibold text-left">Remove</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );

    if (step === 4) return (
      <div className="space-y-5">
        <h3 className="font-bold text-slate-900 text-base">Preview & Download</h3>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">💡 How it works</p>
          <ul className="space-y-1 text-xs text-blue-700">
            <li>🔍 <strong>Preview</strong> — Free watermarked DOCX to check layout (no credit deducted)</li>
            <li>⬇️ <strong>Download</strong> — Clean final DOCX without watermark (1 credit deducted)</li>
          </ul>
        </div>
        {error && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-5 text-center flex flex-col gap-3">
            <div className="text-4xl">🔍</div>
            <div className="font-bold text-slate-900">Preview (Free)</div>
            <p className="text-xs text-slate-500">Watermarked preview to check formatting</p>
            <Button onClick={generatePreview} loading={generating} disabled={generating || downloading} variant="outline" className="w-full justify-center">
              {generating ? "Generating…" : "Generate Preview"}
            </Button>
            {previewReady && resumeId && (
              <a href={`/api/resumes/${resumeId}/preview-file?token=${token}`} download
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all">
                📥 Download Preview
              </a>
            )}
          </Card>
          <Card className={`p-5 text-center flex flex-col gap-3 ${(user?.credits || 0) === 0 && user?.role !== "admin" ? "opacity-60" : ""}`}>
            <div className="text-4xl">⬇️</div>
            <div className="font-bold text-slate-900">Download Final</div>
            <p className="text-xs text-slate-500">{user?.role === "admin" ? "Free (admin account)" : "1 credit deducted"}</p>
            {(user?.credits || 0) === 0 && user?.role !== "admin" ? (
              <div className="text-xs text-red-600 font-semibold">⚠️ No credits. Please recharge.</div>
            ) : (
              <Button onClick={generateDownload} loading={downloading} disabled={generating || downloading} variant="primary" className="w-full justify-center">
                {downloading ? "Generating…" : "Generate & Download"}
              </Button>
            )}
            {downloadReady && resumeId && (
              <a href={`/api/resumes/${resumeId}/download-file?token=${token}`} download
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-all">
                📥 Download Final Resume
              </a>
            )}
          </Card>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 font-medium">← My Resumes</button>
        <div className="flex-1" />
        <input value={versionName} onChange={e => setVersionName(e.target.value)}
          className="text-sm font-semibold border border-slate-200 rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-44 bg-white"
          placeholder="Version name" />
        <Button onClick={saveOnly} loading={saving} variant="outline" size="sm">💾 Save</Button>
      </div>

      {/* Step indicators */}
      <div className="flex gap-1 mb-6">
        {STEPS.map((s, i) => (
          <button key={i} onClick={() => setStep(i)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${step === i ? "bg-indigo-600 text-white" : i < step ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"}`}>
            {s}
          </button>
        ))}
      </div>

      <Card className="p-5">
        {renderStep()}
        {error && step !== 4 && <Alert type="error" className="mt-4">{error}</Alert>}
        {success && step !== 4 && <Alert type="success" className="mt-4">{success}</Alert>}
        <div className="flex justify-between mt-6 pt-4 border-t border-slate-100">
          <Button onClick={() => setStep(s => Math.max(0, s - 1))} variant="outline" disabled={step === 0}>← Back</Button>
          {step < 4 ? (
            <Button onClick={saveAndContinue} loading={saving} variant="primary">
              {saving ? "Saving…" : step === 3 ? "Save & Preview →" : "Save & Next →"}
            </Button>
          ) : (
            <Button onClick={goBack} variant="outline">Back to My Resumes</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Admin Login ──────────────────────────────────────────────────────────────
function AdminLoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ mobile: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      const data = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ mobile: form.mobile, password: form.password }) });
      if (data.role !== "admin") { setError("Not an admin account."); setLoading(false); return; }
      login({ id: data.user_id, name: data.name, role: data.role, credits: data.credits }, data.access_token);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-600 rounded-2xl shadow-lg mb-4 text-white text-2xl">🛡️</div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Portal</h1>
          <p className="text-slate-500 text-sm mt-1">DocAuto Administration</p>
        </div>
        <Card className="p-6 shadow-lg">
          <div className="flex flex-col gap-4" onKeyDown={e => { if (e.key === "Enter") submit(); }}>
            <Input label="Mobile Number" placeholder="Admin mobile number" value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} maxLength={10} inputMode="numeric" autoFocus />
            <Input label="Password" type="password" placeholder="Admin password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            {error && <Alert type="error">{error}</Alert>}
            <Button loading={loading} onClick={submit} className="w-full justify-center" size="lg">Sign In as Admin</Button>
          </div>
        </Card>
        <div className="text-center mt-4">
          <a href="/" className="text-sm text-indigo-600 hover:underline">← Back to user login</a>
        </div>
      </div>
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────
function AppInner() {
  const { user, token } = useAuth();
  const [page, setPage] = useState(() => {
    const hash = window.location.hash;
    if (hash === "#admin") return "admin";
    return "dashboard";
  });

  const isAdminRoute = window.location.search.includes("admin") || window.location.hash === "#admin" || window.location.pathname.endsWith("/admin");

  if (!user) {
    if (isAdminRoute) return <AdminLoginPage />;
    return <AuthPage />;
  }

  if (isAdminRoute && user.role === "admin" && page !== "admin") {
    setPage("admin");
  }

  const pages = {
    dashboard: <Dashboard setPage={setPage} />,
    upload:    <UploadPage setPage={setPage} />,
    templates: <TemplateLibraryPage setPage={setPage} />,
    documents: <DocumentsPage setPage={setPage} />,
    resume:    <ResumePage />,
    recharge:  <RechargePage />,
    admin:     <AdminPage token={token} />,
  };

  return (
    <Layout page={page} setPage={setPage}>
      {pages[page] || pages.dashboard}
    </Layout>
  );
}

export default function App() {
  return <AuthProvider><AppInner /></AuthProvider>;
}
