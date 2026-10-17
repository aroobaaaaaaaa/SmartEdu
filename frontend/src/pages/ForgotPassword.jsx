// src/pages/ForgotPassword.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import * as passwordApi from "../api/password";
import backgroundImage from "../assets/alpha-bg.jpg";
import { C, T } from "../theme";

export default function ForgotPassword() {
  const { isDark, toggleTheme } = useTheme();
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try { await passwordApi.forgotPassword(email); } catch { /* always show success */ }
    finally { setSent(true); setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", backgroundImage: `url(${backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center", backgroundColor: C.pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", position: "relative" }}>
      
      {/* Overlay */}
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

      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "12px", width: "100%", maxWidth: "420px", position: "relative", zIndex: 1, boxShadow: "0 8px 40px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ height: "4px", background: C.accent }} />
        <div style={{ padding: "36px 36px 32px" }}>

          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div style={{ display: "inline-block", marginBottom: "12px" }}>
              <img src="/alpha-welcome-logo.png" alt="Alpha Education Network" style={{ height: "48px", width: "auto", display: "inline-block", borderRadius: "3px" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <div style={{ height: "1px", width: "28px", background: C.border }} />
              <span style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>SmartEdu LMS</span>
              <div style={{ height: "1px", width: "28px", background: C.border }} />
            </div>
          </div>

          {sent ? (
            /* Success state */
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: C.successBg, border: `1px solid ${C.successBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                <i className="ti ti-mail-check" style={{ fontSize: "26px", color: C.successText }} />
              </div>
              <h1 style={{ fontSize: "22px", fontWeight: "700", color: C.textPrimary, marginBottom: "10px", letterSpacing: "-0.02em" }}>Check your inbox</h1>
              <p style={{ fontSize: "14px", color: C.textSecondary, lineHeight: "1.6", marginBottom: "24px" }}>
                If an account exists for <strong style={{ color: C.textPrimary }}>{email}</strong>, a reset link has been sent. Check your spam folder if it doesn't arrive within a few minutes.
              </p>
              <Link to="/login" style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "14px", color: C.accent, textDecoration: "none", fontWeight: "600" }}>
                <i className="ti ti-arrow-left" style={{ fontSize: "16px" }} />Back to sign in
              </Link>
            </div>
          ) : (
            /* Request state */
            <>
              <h1 style={{ fontSize: "24px", fontWeight: "700", color: C.textPrimary, textAlign: "center", marginBottom: "8px", letterSpacing: "-0.03em" }}>Reset your password</h1>
              <p style={{ fontSize: "14px", color: C.textMuted, textAlign: "center", marginBottom: "26px", lineHeight: "1.6" }}>
                Enter your account email and we'll send a reset link.
              </p>

              <form onSubmit={handleSubmit} noValidate>
                <div style={{ position: "relative", marginBottom: "18px" }}>
                  <i className="ti ti-mail" style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", fontSize: "17px", color: focused ? C.textPrimary : C.textMuted, pointerEvents: "none" }} />
                  <input type="email" required autoComplete="email" placeholder="Email address" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                    style={{ width: "100%", background: focused ? C.inputFocus : C.inputBg, border: `1.5px solid ${focused ? C.focusBorder : C.border}`, borderRadius: "8px", padding: "12px 13px 12px 42px", fontSize: "15px", color: C.textPrimary, fontFamily: "inherit", outline: "none" }}
                  />
                </div>

                <button type="submit" disabled={loading} className="btn-interactive"
                  style={{ width: "100%", background: loading ? C.subtleBg : C.primary, color: C.primaryText, border: "none", borderRadius: "8px", padding: "13px", fontSize: "15px", fontWeight: "600", fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "9px", marginBottom: "16px" }}>
                  {loading
                    ? <><i className="ti ti-loader-2" style={{ fontSize: "17px", animation: "spin 1s linear infinite" }} />Sending…</>
                    : <><i className="ti ti-send" style={{ fontSize: "16px" }} />Send reset link</>
                  }
                </button>

                <div style={{ textAlign: "center" }}>
                  <Link to="/login" style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "14px", color: C.accent, textDecoration: "none", fontWeight: "600" }}>
                    <i className="ti ti-arrow-left" style={{ fontSize: "16px" }} />Back to sign in
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>

        <div style={{ background: C.subtleBg, borderTop: `1px solid ${C.border}`, padding: "12px 36px", textAlign: "center" }}>
          <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>
            Copyright 2024–25 &nbsp;·&nbsp; Alpha Education Network &nbsp;·&nbsp; All rights reserved
          </p>
        </div>
      </div>

      <style>{`* { box-sizing: border-box; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}