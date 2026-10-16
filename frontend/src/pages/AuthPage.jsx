import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import axios from "axios";
import { Eye, EyeOff, Briefcase, Users, ArrowLeft, CheckCircle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HERO_BG = "https://images.unsplash.com/photo-1693478501743-799eefbc0ecd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA4Mzl8MHwxfHNlYXJjaHwxfHxjb25zdHJ1Y3Rpb24lMjBzaXRlJTIwdGVhbSUyMHdvcmtpbmd8ZW58MHx8fHwxNzczMzk4OTM5fDA&ixlib=rb-4.1.0&q=85";

const passwordError = (pw) => {
  if (pw.length < 8 || pw.length > 72) return "Password must be 8-72 characters long";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw) || !/[^A-Za-z0-9]/.test(pw))
    return "Password must include upper and lower case letters, a number and a symbol";
  return null;
};

export default function AuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const [mode, setMode] = useState(params.get("mode") || "login");
  const [role, setRole] = useState(params.get("role") || "crew");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const [trades, setTrades] = useState([]);

  const [form, setForm] = useState({
    email: "", password: "", name: "", phone: "",
    company_name: "", referral_code_used: "", trade: ""
  });

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [loginMessage, setLoginMessage] = useState("");

  // Check for reset token in URL
  useEffect(() => {
    const oauthError = params.get("error");
    const oauthMsg = { oauth_forbidden: "This account can't use Google sign-in. Use email and password.", oauth_failed: "Google sign-in failed. Please try again." }[oauthError];
    if (oauthMsg) setTimeout(() => toast.error(oauthMsg, { id: "oauth-error" }), 0);
    const token = params.get("token");
    if (token && params.get("mode") === "reset") {
      setResetToken(token);
      setResetMode(true);
    }
    // Fetch trades from backend
    axios.get(`${API}/public/trades`).then(r => setTrades(r.data || [])).catch(() => {});
    // Fetch CMS login message
    axios.get(`${API}/public/settings`).then(r => {
      if (r.data?.login_message) setLoginMessage(r.data.login_message);
    }).catch(() => {});
  }, []);

  const handleGoogleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/auth/callback";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return toast.error("Enter your email address");
    setLoading(true);
    try {
      await axios.post(`${API}/auth/forgot-password`, { email: forgotEmail });
      setForgotSent(true);
      toast.success("Reset link sent! Check your inbox.");
    } catch {
      toast.error("Failed to send reset link. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    const pwError = passwordError(newPassword);
    if (pwError) return toast.error(pwError);
    setLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password`, { token: resetToken, new_password: newPassword });
      setResetDone(true);
      toast.success("Password reset! You can now log in.");
      setTimeout(() => { setResetMode(false); setMode("login"); }, 2000);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reset failed. Link may be expired.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mode === "register" && !agreedToTerms) {
      return toast.error("You must agree to the Terms and Conditions to register.");
    }
    setLoading(true);
    try {
      if (mode === "login") {
        const user = await login(form.email, form.password);
        toast.success(`Welcome back, ${user.name}!`);
        if (user.role === "crew") navigate("/crew/dashboard");
        else if (user.role === "contractor") navigate("/contractor/dashboard");
        else navigate("/admin/dashboard");
      } else {
        if (!form.name.trim()) { toast.error("Name is required"); return; }
        const pwError = passwordError(form.password);
        if (pwError) { toast.error(pwError); return; }
        const payload = { ...form, role, agreed_to_terms: agreedToTerms };
        if (role !== "contractor") delete payload.company_name;
        if (role !== "crew") delete payload.trade;
        const user = await register(payload);
        toast.success(`Welcome to TheDayLaborers, ${user.name}! Your 30-day trial has started.`);
        if (user.role === "crew") navigate("/crew/dashboard");
        else navigate("/contractor/dashboard");
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || "Something went wrong. Please try again.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Reset Password Mode ────────────────────────────────────────────────────
  if (resetMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#020617] p-6" style={{ fontFamily: "Inter, sans-serif" }}>
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-9 h-9 bg-[#0000FF] rounded-xl flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <span className="font-extrabold text-[#050A30] dark:text-white text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>TheDayLaborers</span>
          </div>
          {resetDone ? (
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-extrabold text-[#050A30] dark:text-white mb-2">Password Updated!</h2>
              <p className="text-slate-500 mb-4">Redirecting to login...</p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-extrabold text-[#050A30] dark:text-white mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>Set New Password</h2>
              <p className="text-slate-500 mb-6 text-sm">Enter your new password below.</p>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white pr-10"
                      placeholder="8+ chars, Aa, 1 & symbol" required data-testid="reset-password-input"
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-[#0000FF] text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60"
                  data-testid="reset-submit-btn">
                  {loading ? "Updating..." : "Reset Password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Forgot Password Mode ───────────────────────────────────────────────────
  if (forgotMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#020617] p-6" style={{ fontFamily: "Inter, sans-serif" }}>
        <div className="w-full max-w-md">
          <button onClick={() => setForgotMode(false)} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm mb-8">
            <ArrowLeft className="w-4 h-4" /> Back to login
          </button>
          {forgotSent ? (
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-extrabold text-[#050A30] dark:text-white mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>Check Your Email</h2>
              <p className="text-slate-500 mb-2">We sent a reset link to <strong>{forgotEmail}</strong></p>
              <p className="text-slate-400 text-sm">The link expires in 2 hours.</p>
              <button onClick={() => setForgotMode(false)} className="mt-6 text-[#0000FF] font-semibold hover:underline text-sm">
                Back to login
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-extrabold text-[#050A30] dark:text-white mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>Forgot Password?</h2>
              <p className="text-slate-500 mb-6 text-sm">Enter your email and we'll send you a reset link.</p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Email Address</label>
                  <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                    placeholder="john@example.com" required data-testid="forgot-email-input" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-[#0000FF] text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60"
                  data-testid="forgot-submit-btn">
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Main Login / Register ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden"
        style={{ backgroundImage: `linear-gradient(135deg, rgba(5,10,48,0.95) 0%, rgba(0,0,255,0.3) 100%), url(${HERO_BG})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="absolute inset-0 flex flex-col justify-between p-12">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#0000FF] rounded-xl flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-white font-extrabold text-xl" style={{ fontFamily: "Manrope, sans-serif" }}>TheDayLaborers</div>
              <div className="text-[#7EC8E3] text-xs">A Blue Collar ME Company</div>
            </div>
          </Link>
          <div>
            <h2 className="text-4xl font-extrabold text-white mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Your work.<br />Your terms.</h2>
            <p className="text-slate-300 text-lg mb-8">Real-time workforce marketplace for blue collar professionals.</p>
            <div className="space-y-3">
              {["30-day free trial", "Live job map", "Instant payouts", "AI job matching"].map(f => (
                <div key={f} className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-[#7EC8E3]" />
                  <span className="text-slate-200">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 lg:w-1/2 bg-white dark:bg-[#020617] flex items-center justify-center p-6 sm:p-12 overflow-y-auto">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm mb-8">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>

          {/* Mode Toggle */}
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-6">
            <button onClick={() => setMode("login")}
              className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${mode === "login" ? "bg-[#0000FF] text-white shadow-md" : "text-slate-500 dark:text-slate-400"}`}
              data-testid="auth-login-tab">Log In</button>
            <button onClick={() => setMode("register")}
              className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${mode === "register" ? "bg-[#0000FF] text-white shadow-md" : "text-slate-500 dark:text-slate-400"}`}
              data-testid="auth-register-tab">Sign Up</button>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#050A30] dark:text-white mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mb-5 text-sm">
            {mode === "login" ? "Sign in to your TheDayLaborers account" : "Join thousands of workers and contractors"}
          </p>

          {/* CMS Login Message */}
          {loginMessage && mode === "login" && (
            <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-xl p-3 mb-4 text-sm text-blue-700 dark:text-blue-300" data-testid="login-message">
              {loginMessage}
            </div>
          )}

          {/* Google OAuth Button */}
          <button onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 border-2 border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 font-semibold text-sm text-[#050A30] dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors mb-4"
            data-testid="google-login-btn">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            <span className="text-xs text-slate-400 font-medium">or</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          </div>

          {/* Role Selector */}
          {mode === "register" && (
            <div className="flex gap-3 mb-5">
              <button onClick={() => setRole("crew")}
                className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 font-bold text-sm transition-all ${role === "crew" ? "border-[#0000FF] bg-blue-50 dark:bg-blue-950 text-[#0000FF]" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300"}`}
                data-testid="role-crew-btn">
                <Users className="w-5 h-5" /> Crew Member
              </button>
              <button onClick={() => setRole("contractor")}
                className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 font-bold text-sm transition-all ${role === "contractor" ? "border-[#0000FF] bg-blue-50 dark:bg-blue-950 text-[#0000FF]" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300"}`}
                data-testid="role-contractor-btn">
                <Briefcase className="w-5 h-5" /> Contractor
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Full Name *</label>
                <input type="text" value={form.name} onChange={e => update("name", e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  placeholder="John Smith" required data-testid="reg-name-input" />
              </div>
            )}
            {mode === "register" && role === "contractor" && (
              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Company Name</label>
                <input type="text" value={form.company_name} onChange={e => update("company_name", e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  placeholder="Smith Construction LLC" data-testid="reg-company-input" />
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Email Address *</label>
              <input type="email" value={form.email} onChange={e => update("email", e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                placeholder="john@example.com" required data-testid="auth-email-input" />
            </div>
            {mode === "register" && (
              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Phone Number</label>
                <input type="tel" value={form.phone} onChange={e => update("phone", e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  placeholder="+1 (555) 000-0000" data-testid="reg-phone-input" />
              </div>
            )}
            {mode === "register" && role === "crew" && (
              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Primary Trade</label>
                <select value={form.trade} onChange={e => update("trade", e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="reg-trade-select">
                  <option value="">Select a trade</option>
                  {trades.length > 0
                    ? trades.map(t => <option key={t.id} value={t.name}>{t.name}</option>)
                    : ["Carpentry","Electrical","Plumbing","Painting","General Labor","HVAC","Roofing","Masonry"].map(t => <option key={t} value={t}>{t}</option>)
                  }
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Password *</label>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={form.password} onChange={e => update("password", e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white pr-10"
                  placeholder="8+ chars, Aa, 1 & symbol" required data-testid="auth-password-input" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === "login" && (
                <button type="button" onClick={() => setForgotMode(true)}
                  className="text-xs text-[#0000FF] hover:underline mt-1 float-right font-semibold"
                  data-testid="forgot-password-link">
                  Forgot password?
                </button>
              )}
            </div>
            {mode === "register" && (
              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Referral Code (optional)</label>
                <input type="text" value={form.referral_code_used} onChange={e => update("referral_code_used", e.target.value.toUpperCase())}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  placeholder="ABC12345" data-testid="reg-referral-input" />
              </div>
            )}

            {/* Terms Checkbox (register only) */}
            {mode === "register" && (
              <label className="flex items-start gap-2.5 cursor-pointer" data-testid="terms-checkbox-label">
                <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#0000FF] cursor-pointer" data-testid="terms-checkbox" />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  By joining, you agree to our{" "}
                  <Link to="/legal?page=terms" target="_blank" className="text-[#0000FF] font-semibold hover:underline">Terms & Conditions</Link>,{" "}
                  <Link to="/legal?page=privacy" target="_blank" className="text-[#0000FF] font-semibold hover:underline">Privacy Policy</Link>, and{" "}
                  <Link to="/legal?page=guidelines" target="_blank" className="text-[#0000FF] font-semibold hover:underline">Community Guidelines</Link>.
                </span>
              </label>
            )}

            <button type="submit" disabled={loading || (mode === "register" && !agreedToTerms)}
              className="w-full bg-[#0000FF] text-white py-3 rounded-xl font-bold text-base hover:bg-blue-700 transition-colors disabled:opacity-60 mt-1 clear-both"
              data-testid="auth-submit-btn">
              {loading ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}
            </button>
          </form>

          {mode === "login" && (
            <p className="text-center text-xs text-slate-400 mt-3">
              Admin? Use your admin credentials to access the platform.
            </p>
          )}

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-5">
            {mode === "login" ? (
              <>Don't have an account? <button onClick={() => setMode("register")} className="text-[#0000FF] font-semibold hover:underline" data-testid="switch-to-register">Sign up free</button></>
            ) : (
              <>Already have an account? <button onClick={() => setMode("login")} className="text-[#0000FF] font-semibold hover:underline" data-testid="switch-to-login">Log in</button></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
