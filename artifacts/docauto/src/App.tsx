// @ts-nocheck
import { useState, useEffect, createContext, useContext } from "react";
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

async function apiFetch(path, opts = {}, token = null) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

// ── Icons ───────────────────────────────────────────────────────────────────
const Icons = {
  Upload:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Download: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  File:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Check:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><polyline points="20 6 9 17 4 12"/></svg>,
  Logout:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Spinner:  () => <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>,
  Menu:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Close:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Credit:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Shield:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  WA:       () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
};

// ── Shared UI Components ────────────────────────────────────────────────────
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

// ── Auth Page ──────────────────────────────────────────────────────────────
function AuthPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState("signin"); // signin | register | forgot
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
      if (mode === "forgot") {
        setForgotSent(true);
        setLoading(false);
        return;
      }
      const endpoint = mode === "register" ? "/auth/register" : "/auth/login";
      const body = mode === "register"
        ? { name: form.name, mobile: form.mobile, email: form.email || undefined, password: form.password }
        : { mobile: form.mobile, password: form.password };
      const data = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
      login({ id: data.user_id, name: data.name, role: data.role, credits: data.credits }, data.access_token);
    } catch (e) { setGlobalError(e.message); }
    setLoading(false);
  };

  const handleKey = e => { if (e.key === "Enter") submit(); };

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

          <div className="flex flex-col gap-4" onKeyDown={handleKey}>
            {mode === "register" && (
              <Input label="Full Name" placeholder="e.g. Ravi Kumar" value={form.name} onChange={set("name")} error={errors.name} autoFocus />
            )}
            <Input
              label="Mobile Number"
              placeholder="10-digit mobile number"
              value={form.mobile}
              onChange={set("mobile")}
              error={errors.mobile}
              maxLength={10}
              inputMode="numeric"
              autoFocus={mode !== "register"}
            />
            {mode === "register" && (
              <Input label="Email (optional)" type="email" placeholder="you@example.com" value={form.email} onChange={set("email")} />
            )}
            {mode !== "forgot" && (
              <Input label="Password" type="password" placeholder="Minimum 6 characters" value={form.password} onChange={set("password")} error={errors.password} />
            )}
            {mode === "register" && (
              <Input label="Confirm Password" type="password" placeholder="Re-enter password" value={form.confirmPassword} onChange={set("confirmPassword")} error={errors.confirmPassword} />
            )}
            {globalError && <Alert type="error">{globalError}</Alert>}
            <Button loading={loading} onClick={submit} className="w-full justify-center" size="lg">
              {mode === "signin" ? "Sign In" : mode === "register" ? "Create Account" : "Send Reset Instructions"}
            </Button>
            {mode === "signin" && (
              <button onClick={() => { setMode("forgot"); setErrors({}); setGlobalError(""); }} className="text-sm text-center text-indigo-600 hover:underline">Forgot Password?</button>
            )}
          </div>
        </Card>

        {/* Admin quick-login */}
        {mode === "signin" && (
          <button
            onClick={() => {
              setForm(f => ({ ...f, mobile: "9999999999", password: "Admin@123" }));
              setErrors({}); setGlobalError("");
            }}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-purple-300 text-sm font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 active:scale-98 transition-all"
          >
            🛡️ Admin Login
          </button>
        )}

        <p className="text-center text-xs text-slate-400 mt-4">PAN Forms · Sale Deeds · Registration Documents · AP/Telangana</p>
      </div>
    </div>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────
function Layout({ page, setPage, children }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const nav = [
    { id: "dashboard", label: "Dashboard",        icon: "🏠" },
    { id: "upload",    label: "Upload Document",   icon: "📤" },
    { id: "documents", label: "My Documents",      icon: "📄" },
    { id: "recharge",  label: "Buy Credits",       icon: "💳" },
    ...(user?.role === "admin" ? [{ id: "admin", label: "Admin Panel", icon: "🛡️" }] : []),
  ];

  const navigate = (id) => { setPage(id); setSidebarOpen(false); };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">D</div>
          <div>
            <div className="font-bold text-slate-900">DocAuto</div>
            <div className="text-xs text-slate-400">Document Platform</div>
          </div>
        </div>
      </div>

      {/* User Info + Credits */}
      <div className="px-4 py-3 mx-3 mt-3 bg-indigo-50 rounded-xl border border-indigo-100">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">{user?.name}</div>
            {user?.role === "admin" && <div className="text-xs text-indigo-600 font-semibold flex items-center gap-1"><Icons.Shield /> Admin</div>}
          </div>
        </div>
        {user?.role !== "admin" ? (
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-slate-500">Credits</div>
            <div className={`text-sm font-bold ${(user?.credits || 0) === 0 ? "text-red-600" : "text-indigo-700"}`}>
              {user?.credits || 0} {(user?.credits || 0) === 0 ? "⚠️" : "🎟️"}
            </div>
          </div>
        ) : (
          <div className="mt-1.5 text-xs text-indigo-600 font-medium">∞ Unlimited credits</div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 flex flex-col gap-1 mt-2">
        {nav.map(item => (
          <button
            key={item.id}
            onClick={() => navigate(item.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all w-full text-left
              ${page === item.id
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Sign Out */}
      <div className="p-3 border-t border-slate-100">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all shadow-sm"
        >
          <Icons.Logout />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop sidebar */}
      <aside className="w-64 bg-white border-r border-slate-100 fixed h-full z-20 hidden lg:flex flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <span className="font-bold text-slate-900">Menu</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg text-slate-500 hover:bg-slate-100"><Icons.Close /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarContent />
            </div>
          </aside>
        </div>
      )}

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-20 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-all">
            <Icons.Menu />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">D</div>
            <span className="font-bold text-slate-900">DocAuto</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user?.role !== "admin" && (
            <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${(user?.credits || 0) === 0 ? "bg-red-100 text-red-700" : "bg-indigo-100 text-indigo-700"}`}>
              {(user?.credits || 0) === 0 ? "⚠️ 0 credits" : `🎟️ ${user?.credits}`}
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all shadow-sm"
          >
            <Icons.Logout />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="lg:ml-64 flex-1 p-4 lg:p-8 pt-20 lg:pt-8">
        {children}
      </main>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ setPage }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const actions = [
    { title: "Upload & Extract",  desc: "OCR any document — 1 credit per doc", icon: "📤", page: "upload",    color: "bg-indigo-50 border-indigo-100", iconBg: "bg-indigo-100 text-indigo-600" },
    { title: "My Documents",      desc: "View and download past documents",      icon: "📄", page: "documents", color: "bg-slate-50 border-slate-100",   iconBg: "bg-slate-100 text-slate-600" },
    { title: "Buy Credits",       desc: "Recharge from ₹10 to ₹1000",           icon: "💳", page: "recharge",  color: "bg-emerald-50 border-emerald-100", iconBg: "bg-emerald-100 text-emerald-600" },
    ...(isAdmin ? [{ title: "Admin Panel", desc: "Manage users, payments & stats", icon: "🛡️", page: "admin", color: "bg-purple-50 border-purple-100", iconBg: "bg-purple-100 text-purple-600" }] : []),
  ];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Welcome header */}
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">
          Welcome back, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-slate-500 mt-1">Process Indian legal documents with AI-powered OCR.</p>
      </div>

      {/* Admin banner */}
      {isAdmin && (
        <div className="mb-5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">🛡️</div>
            <div>
              <div className="font-bold text-lg">Administrator Account</div>
              <div className="text-purple-200 text-sm">Unlimited credits · Full platform access</div>
            </div>
          </div>
        </div>
      )}

      {/* Credits card (non-admin) */}
      {!isAdmin && (
        <Card className={`p-5 mb-5 ${(user?.credits || 0) === 0 ? "border-red-200 bg-red-50" : ""}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${(user?.credits || 0) === 0 ? "bg-red-100" : "bg-indigo-100"}`}>
                {(user?.credits || 0) === 0 ? "⚠️" : "🎟️"}
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Available Credits</div>
                <div className={`text-4xl font-black ${(user?.credits || 0) === 0 ? "text-red-600" : "text-slate-900"}`}>
                  {user?.credits || 0}
                </div>
                <div className="text-xs text-slate-400">1 credit = 1 document = ₹10</div>
              </div>
            </div>
            <Button variant="primary" onClick={() => setPage("recharge")} size="md">Buy Credits</Button>
          </div>
          {(user?.credits || 0) === 0 && (
            <div className="mt-3 pt-3 border-t border-red-200 text-sm text-red-700 font-medium">
              You have no credits. Purchase a pack to start processing documents.
            </div>
          )}
        </Card>
      )}

      {/* Action grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {actions.map(a => (
          <button
            key={a.page}
            onClick={() => setPage(a.page)}
            className={`text-left p-5 rounded-2xl border-2 hover:shadow-md transition-all group ${a.color}`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-3 ${a.iconBg}`}>{a.icon}</div>
            <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{a.title}</div>
            <div className="text-xs text-slate-500 mt-1">{a.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Upload Page ────────────────────────────────────────────────────────────
function UploadPage({ setPage }) {
  const { token, refreshUser, user } = useAuth();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [editedFields, setEditedFields] = useState({});
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const isAdmin = user?.role === "admin";

  const FIELD_LABELS = {
    full_name:         "Full Name",
    father_name:       "Father's Name",
    date_of_birth:     "Date of Birth",
    aadhar_number:     "Aadhaar Number",
    pan_number:        "PAN Number",
    mobile:            "Mobile",
    email:             "Email",
    address:           "Address",
    pincode:           "Pincode",
    village:           "Village",
    survey_number:     "Survey Number",
    sale_amount:       "Sale Amount (₹)",
    registration_date: "Registration Date",
  };

  const upload = async () => {
    if (!file) return;
    setError(""); setLoading(true); setResult(null); setGenerated(false);
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
    setGenerating(true); setError("");
    try {
      await apiFetch(`/documents/${result.id}/fields`, { method: "PUT", body: JSON.stringify({ fields: editedFields }) }, token);
      await apiFetch(`/documents/${result.id}/generate`, { method: "POST" }, token);
      setGenerated(true);
    } catch (e) { setError(e.message); }
    setGenerating(false);
  };

  const handleDrop = e => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl lg:text-2xl font-bold text-slate-900">Upload Document</h2>
        <p className="text-slate-500 text-sm mt-1">
          {isAdmin ? "Upload any document — admin processing is free." : "Upload a PDF or image to extract fields automatically. Uses 1 credit."}
        </p>
      </div>

      {!isAdmin && (user?.credits || 0) === 0 && !result && (
        <Alert type="warning" className="mb-6">
          You have no credits.{" "}
          <button onClick={() => setPage("recharge")} className="font-bold underline">Buy credits</button>{" "}
          to start processing documents.
        </Alert>
      )}

      {!result ? (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("fileInput").click()}
            className={`border-2 border-dashed rounded-2xl p-10 lg:p-14 text-center cursor-pointer transition-all ${dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50"}`}
          >
            <input id="fileInput" type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setFile(e.target.files[0])} />
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
                <div className="text-xs text-slate-400 mt-1">PDF, JPG, PNG supported</div>
              </div>
            )}
          </div>
          {error && <Alert type="error" className="mt-4">{error}</Alert>}
          <Button
            loading={loading}
            disabled={!file || (!isAdmin && (user?.credits || 0) === 0)}
            onClick={upload}
            className="mt-4 w-full justify-center"
            size="lg"
          >
            <Icons.Upload />
            {isAdmin ? "Extract Fields (Free)" : "Extract Fields (1 credit)"}
          </Button>
        </>
      ) : (
        <div>
          <Alert type="success" className="mb-5">
            OCR complete — {Object.keys(editedFields).filter(k => editedFields[k]).length} fields detected. Review and edit below, then generate your DOCX.
          </Alert>
          <Card className="p-5 mb-5">
            <h3 className="font-bold text-slate-900 mb-4">Extracted Fields</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.entries(FIELD_LABELS).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
                  <input
                    value={editedFields[key] || ""}
                    onChange={e => setEditedFields(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    placeholder={`Enter ${label.toLowerCase()}`}
                  />
                </div>
              ))}
            </div>
          </Card>
          {error && <Alert type="error" className="mb-4">{error}</Alert>}
          <div className="flex flex-wrap gap-3">
            {!generated ? (
              <Button loading={generating} onClick={generate} variant="success" size="lg">
                <Icons.File /> Generate DOCX
              </Button>
            ) : (
              <Button onClick={() => window.open(`${API}/documents/${result.id}/download?token=${token}`, "_blank")} variant="primary" size="lg">
                <Icons.Download /> Download DOCX
              </Button>
            )}
            <Button variant="secondary" onClick={() => { setResult(null); setFile(null); setError(""); }}>
              Upload Another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Documents List ─────────────────────────────────────────────────────────
function DocumentsPage() {
  const { token } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/documents/", {}, token)
      .then(setDocs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const statusBadge = s => {
    const map = { uploaded: ["slate", "Uploaded"], processed: ["blue", "Processed"], downloaded: ["green", "Generated"] };
    const [c, l] = map[s] || ["slate", s];
    return <Badge color={c}>{l}</Badge>;
  };

  if (loading) return (
    <div className="flex items-center gap-3 text-slate-500 py-12 justify-center">
      <Icons.Spinner /> Loading your documents…
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl lg:text-2xl font-bold text-slate-900">My Documents</h2>
        <p className="text-slate-500 text-sm mt-1">{docs.length} document{docs.length !== 1 ? "s" : ""} processed</p>
      </div>
      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {docs.length === 0 ? (
        <Card className="p-16 text-center text-slate-400">
          <div className="text-5xl mb-4">📄</div>
          <div className="font-semibold text-slate-600">No documents yet</div>
          <div className="text-sm mt-1">Upload your first document to get started</div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {docs.map(doc => (
            <Card key={doc.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 shrink-0">
                    <Icons.File />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 text-sm truncate">{doc.original_filename}</div>
                    <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{new Date(doc.created_at).toLocaleDateString("en-IN")}</span>
                      <span>·</span>
                      {doc.credits_used === 0 ? <span className="text-purple-600 font-medium">Admin (free)</span> : <span>{doc.credits_used} credit</span>}
                      <span>·</span>
                      {statusBadge(doc.status)}
                    </div>
                  </div>
                </div>
                {doc.output_path && (
                  <button
                    onClick={() => window.open(`${API}/documents/${doc.id}/download?token=${token}`, "_blank")}
                    className="p-2.5 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors shrink-0"
                    title="Download DOCX"
                  >
                    <Icons.Download />
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recharge / Buy Credits ─────────────────────────────────────────────────
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
    const url = URL.createObjectURL(f);
    setScreenshotPreview(url);
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

  const sendEnquiry = async () => {
    try {
      await apiFetch("/payments/bulk-enquiry", { method: "POST", body: JSON.stringify({ message: enquiryMsg }) }, token);
      setEnquirySent(true);
    } catch {}
  };

  const statusBadge = s => {
    const map = { pending: ["yellow", "Pending Approval"], approved: ["green", "Approved"], rejected: ["red", "Rejected"] };
    const [c, l] = map[s] || ["slate", s];
    return <Badge color={c}>{l}</Badge>;
  };

  if (user?.role === "admin") {
    return (
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl lg:text-2xl font-bold text-slate-900">Credits</h2>
        </div>
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

      {/* Step 1 - Select pack */}
      <div className="mb-6">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Step 1 — Choose a Pack</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {packs.map(pack => {
            const isSelected = selected?.amount === pack.amount;
            const isBestValue = pack.amount === 100;
            return (
              <button
                key={pack.amount}
                onClick={() => setSelected(pack)}
                className={`relative p-4 rounded-2xl border-2 text-left transition-all active:scale-95 ${isSelected ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100" : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50"}`}
              >
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

      {/* Step 2 - Pay via UPI */}
      <div className="mb-6">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Step 2 — Pay via UPI</div>
        <Card className="p-5">
          {/* QR Code + UPI ID side by side */}
          <div className="flex flex-col sm:flex-row items-center gap-5 mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="shrink-0 p-2 bg-white rounded-xl border border-slate-200 shadow-sm">
              <QRCodeSVG
                value={`upi://pay?pa=${UPI_ID}&pn=DocAuto&cu=INR${selected ? `&am=${selected.amount}` : ""}`}
                size={140}
                bgColor="#ffffff"
                fgColor="#1e1b4b"
                level="M"
                includeMargin={false}
              />
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Scan QR or pay to UPI ID</div>
              <div className="font-mono font-bold text-slate-900 text-base break-all">{UPI_ID}</div>
              <button onClick={copyUpi} className="text-sm text-indigo-600 hover:underline mt-2 inline-flex items-center gap-1">
                {upiCopied ? "✅ Copied!" : "📋 Copy UPI ID"}
              </button>
              <div className="mt-3 text-xs text-slate-400 flex flex-wrap gap-1 justify-center sm:justify-start">
                <span className="bg-white border border-slate-200 px-2 py-1 rounded-lg">Google Pay</span>
                <span className="bg-white border border-slate-200 px-2 py-1 rounded-lg">PhonePe</span>
                <span className="bg-white border border-slate-200 px-2 py-1 rounded-lg">Paytm</span>
                <span className="bg-white border border-slate-200 px-2 py-1 rounded-lg">BHIM</span>
              </div>
            </div>
          </div>
          {selected && (
            <div className="bg-indigo-50 rounded-xl px-4 py-3 mb-1 flex justify-between items-center border border-indigo-200">
              <span className="text-sm text-indigo-700 font-semibold">Pay exactly: {selected.credits} credits</span>
              <span className="text-xl font-black text-indigo-900">₹{selected.amount}</span>
            </div>
          )}
          {!selected && (
            <Alert type="info">Select a credit pack above to generate the exact payment QR code.</Alert>
          )}
        </Card>
      </div>

      {/* Step 3 - Submit screenshot */}
      <div className="mb-6">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Step 3 — Upload Payment Screenshot</div>
        <Card className="p-5">
          <div className="flex flex-col gap-4">
            <Input
              label="UPI Reference / UTR Number (optional but recommended)"
              placeholder="e.g. 407123456789"
              value={upiRef}
              onChange={e => setUpiRef(e.target.value)}
              hint="Found in your payment app after paying"
            />
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Payment Screenshot *</label>
              <div
                onClick={() => document.getElementById("ssInput").click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all active:scale-98"
              >
                <input id="ssInput" type="file" accept="image/*" className="hidden" onChange={handleScreenshot} />
                {screenshotPreview ? (
                  <div className="flex items-center gap-3 justify-center">
                    <img src={screenshotPreview} className="w-20 h-20 object-cover rounded-lg border border-slate-200" alt="preview" />
                    <div className="text-left">
                      <div className="text-sm font-semibold text-slate-900">{screenshot.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{(screenshot.size / 1024).toFixed(0)} KB</div>
                      <div className="text-xs text-indigo-600 mt-1">Tap to change</div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-3xl mb-2">📸</div>
                    <div className="text-sm font-medium text-slate-700">Tap to upload payment screenshot</div>
                    <div className="text-xs text-slate-400 mt-1">JPG, PNG supported</div>
                  </div>
                )}
              </div>
            </div>
            {error && <Alert type="error">{error}</Alert>}
            <Button
              loading={loading}
              disabled={!screenshot || !selected}
              onClick={submit}
              size="lg"
              className="w-full justify-center"
            >
              Submit Payment for Approval
            </Button>
            <p className="text-xs text-slate-400 text-center">Credits will be added after admin verifies your payment (usually within 30 minutes)</p>
          </div>
        </Card>
      </div>

      {success && (
        <Alert type="success" className="mb-6">
          Payment submitted successfully! We'll verify and add your credits shortly.
          <button className="block mt-2 text-sm font-semibold underline" onClick={() => { setSuccess(false); setSelected(null); setScreenshot(null); setScreenshotPreview(null); setUpiRef(""); }}>
            Submit another payment
          </button>
        </Alert>
      )}

      {/* Bulk enquiry */}
      <Card className="p-4 mb-6 border-dashed border-2 border-slate-200">
        <div className="flex items-start gap-3">
          <div className="text-green-500 mt-0.5 shrink-0"><Icons.WA /></div>
          <div className="flex-1">
            <div className="font-semibold text-slate-900 text-sm">Need 100+ documents? Get bulk pricing</div>
            <div className="text-xs text-slate-500 mb-3 mt-0.5">Contact us for custom pricing on large volumes.</div>
            {!enquirySent ? (
              <div className="flex gap-2">
                <input
                  value={enquiryMsg}
                  onChange={e => setEnquiryMsg(e.target.value)}
                  placeholder="Describe your requirement…"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Button onClick={sendEnquiry} variant="secondary" size="sm" className="whitespace-nowrap">WhatsApp Us</Button>
              </div>
            ) : (
              <div className="text-xs text-emerald-600 font-semibold">✅ Enquiry sent! We'll contact you on WhatsApp shortly.</div>
            )}
          </div>
        </div>
      </Card>

      {/* Payment history */}
      {payments.length > 0 && (
        <div>
          <h3 className="font-bold text-slate-900 mb-3">Payment History</h3>
          <div className="flex flex-col gap-2">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between py-3 px-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                <div>
                  <div className="font-semibold text-slate-900 text-sm">₹{p.amount} → {p.credits} credits</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {new Date(p.created_at).toLocaleDateString("en-IN")}
                    {p.upi_ref && <span className="ml-2 font-mono">UTR: {p.upi_ref}</span>}
                  </div>
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
  const pages = {
    dashboard: <Dashboard setPage={setPage} />,
    upload:    <UploadPage setPage={setPage} />,
    documents: <DocumentsPage />,
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
