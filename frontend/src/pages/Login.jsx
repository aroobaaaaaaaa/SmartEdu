// src/pages/Login.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import backgroundImage from "../assets/alpha-bg.jpg";
import { C } from "../theme";

export default function Login() {
  const { loginUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginUser(email, password);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(Array.isArray(detail) ? "Invalid email or password." : detail || "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", backgroundImage: `url(${backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", position: "relative" }}>

      {/* Subtle overlay so text reads well over the bg */}
      <div style={{ position: "fixed", inset: 0, background: isDark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.18)", pointerEvents: "none", transition: "background 0.2s ease" }} />

      {/* Top-Right Theme Switcher Button */}
      <div style={{ position: "absolute", top: "20px", right: "20px", zIndex: 10 }}>
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="btn-interactive"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 14px",
            borderRadius: "20px",
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            color: C.textPrimary,
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
          }}
        >
          <i className={`ti ${isDark ? "ti-sun" : "ti-moon"}`} style={{ fontSize: "17px", color: isDark ? "#F59E0B" : "#6366F1" }} />
          <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
        </button>
      </div>

      <div className="animate-slide-up" style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "12px", width: "100%", maxWidth: "420px", position: "relative", zIndex: 1, boxShadow: "0 8px 40px rgba(0,0,0,0.25)", overflow: "hidden" }}>

        {/* Red top accent stripe */}
        <div style={{ height: "4px", background: C.accent }} />

        <div style={{ padding: "36px 36px 32px" }}>

          {/* ── Alpha Logo ── */}
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div style={{ display: "inline-block", marginBottom: "12px" }}>
              <img src="/alpha-welcome-logo.png" alt="Alpha Education Network" style={{ height: "48px", width: "auto", display: "inline-block", borderRadius: "3px" }} />
            </div>

            {/* SmartEdu label */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <div style={{ height: "1px", width: "28px", background: C.border }} />
              <span style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>SmartEdu LMS</span>
              <div style={{ height: "1px", width: "28px", background: C.border }} />
            </div>
          </div>

          {/* Heading */}
          <h1 style={{ fontSize: "24px", fontWeight: "700", color: C.textPrimary, textAlign: "center", marginBottom: "6px", letterSpacing: "-0.03em" }}>
            Welcome back
          </h1>
          <p style={{ fontSize: "14px", color: C.textMuted, textAlign: "center", marginBottom: "26px" }}>
            Sign in to your account to continue
          </p>

          {/* Error */}
          {error && (
            <div role="alert" style={{ background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}`, borderRadius: "7px", padding: "11px 13px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "9px", fontSize: "14px" }}>
              <i className="ti ti-alert-circle" style={{ fontSize: "16px", flexShrink: 0, marginTop: "1px" }} />
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            <EmailField value={email} onChange={setEmail} />
            <PasswordField value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword(!showPassword)} />

            <div style={{ textAlign: "right", marginBottom: "20px", marginTop: "-6px" }}>
              <Link to="/forgot-password" style={{ fontSize: "14px", color: C.accent, textDecoration: "none", fontWeight: "600" }}>
                Forgot password?
              </Link>
            </div>

            <button type="submit" disabled={loading} className="btn-interactive"
              style={{
                width: "100%",
                background: loading ? (isDark ? "#334155" : "#E2E8F0") : C.primary,
                color: loading ? (isDark ? "#E2E8F0" : "#0F172A") : C.primaryText,
                border: loading ? `1px solid ${C.border}` : "none",
                borderRadius: "8px", padding: "13px", fontSize: "15px", fontWeight: "600",
                fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "9px",
                letterSpacing: "0.01em"
              }}>
              {loading
                ? <><i className="ti ti-loader-2" style={{ fontSize: "17px", color: isDark ? "#E2E8F0" : "#0F172A", animation: "spin 1s linear infinite" }} /><span style={{ color: isDark ? "#E2E8F0" : "#0F172A" }}>Signing in…</span></>
                : <><i className="ti ti-lock" style={{ fontSize: "16px" }} />Sign in</>
              }
            </button>
          </form>
        </div>

        {/* Footer */}
        <div style={{ background: C.subtleBg, borderTop: `1px solid ${C.border}`, padding: "14px 36px", textAlign: "center" }}>
          <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>
            Copyright 2024–26 &nbsp;·&nbsp; Alpha Education Network &nbsp;·&nbsp; All rights reserved
          </p>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function EmailField({ value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative", marginBottom: "14px" }}>
      <i className="ti ti-mail" style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", fontSize: "17px", color: focused ? C.textPrimary : C.textMuted, pointerEvents: "none" }} />
      <input type="email" required autoComplete="email" placeholder="Email address" value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ width: "100%", background: focused ? C.inputFocus : C.inputBg, border: `1.5px solid ${focused ? C.focusBorder : C.border}`, borderRadius: "8px", padding: "12px 13px 12px 42px", fontSize: "15px", color: C.textPrimary, fontFamily: "inherit", outline: "none" }}
      />
    </div>
  );
}

function PasswordField({ value, onChange, show, onToggle }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative", marginBottom: "10px" }}>
      <i className="ti ti-lock" style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", fontSize: "17px", color: focused ? C.textPrimary : C.textMuted, pointerEvents: "none" }} />
      <input type={show ? "text" : "password"} required autoComplete="current-password" placeholder="Password" value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ width: "100%", background: focused ? C.inputFocus : C.inputBg, border: `1.5px solid ${focused ? C.focusBorder : C.border}`, borderRadius: "8px", padding: "12px 44px 12px 42px", fontSize: "15px", color: C.textPrimary, fontFamily: "inherit", outline: "none" }}
      />
      <button type="button" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}
        style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: "17px", padding: "2px", display: "flex", alignItems: "center" }}>
        <i className={show ? "ti ti-eye-off" : "ti ti-eye"} />
      </button>
    </div>
  );
}