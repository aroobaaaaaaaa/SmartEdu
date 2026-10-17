// src/pages/SetPassword.jsx
import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import * as passwordApi from "../api/password";
import { getErrorMessage } from "../utils/errorMessage";
import backgroundImage from "../assets/alpha-bg.jpg";
import { C, T } from "../theme";

function getStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

const STRENGTH_LABEL  = ["", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLORS = ["", "#D62828", "#F59E0B", "#2563EB", "#198754"];

export default function SetPassword() {
  const { isDark, toggleTheme } = useTheme();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = getStrength(password);
  const allFilled = password && confirm;
  const mismatch = confirm && password !== confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await passwordApi.setPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2200);
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "This password reset link is invalid or has expired. Please request a new one."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "'Inter', system-ui, sans-serif",
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: C.pageBg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        position: "relative",
      }}
    >
      {/* Background Overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: isDark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.22)",
          pointerEvents: "none",
          transition: "background 0.2s ease",
        }}
      />

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
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
        >
          <i className={`ti ${isDark ? "ti-sun" : "ti-moon"}`} style={{ fontSize: "17px", color: isDark ? "#F59E0B" : "#6366F1" }} />
          <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
        </button>
      </div>

      <div
        style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: "12px",
          width: "100%",
          maxWidth: "420px",
          position: "relative",
          zIndex: 1,
          boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div style={{ height: "4px", background: C.accent }} />

        <div style={{ padding: "36px 36px 32px" }}>
          {/* Logo & Branding */}
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div style={{ display: "inline-block", marginBottom: "12px" }}>
              <img
                src="/alpha-welcome-logo.png"
                alt="Alpha Education Network"
                style={{ height: "48px", width: "auto", display: "inline-block", borderRadius: "3px" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <div style={{ height: "1px", width: "28px", background: C.border }} />
              <span style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                SmartEdu LMS
              </span>
              <div style={{ height: "1px", width: "28px", background: C.border }} />
            </div>
          </div>

          {!token ? (
            /* Missing Token State */
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: C.dangerBg,
                  border: `1px solid ${C.dangerBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <i className="ti ti-link-off" style={{ fontSize: "26px", color: C.dangerText }} />
              </div>
              <h2 style={{ fontSize: "20px", fontWeight: "700", color: C.textPrimary, marginBottom: "8px" }}>
                Invalid Reset Link
              </h2>
              <p style={{ fontSize: "14px", color: C.textSecondary, lineHeight: "1.6", marginBottom: "24px" }}>
                This link is missing required security credentials or has expired. Please request a new password reset link.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <Link
                  to="/forgot-password"
                  className="btn-interactive"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    background: C.primary,
                    color: C.primaryText,
                    textDecoration: "none",
                    fontWeight: "600",
                    fontSize: "14px",
                  }}
                >
                  <i className="ti ti-mail" /> Request New Link
                </Link>
                <Link
                  to="/login"
                  style={{
                    fontSize: "13px",
                    color: C.textMuted,
                    textDecoration: "none",
                    fontWeight: "500",
                    marginTop: "6px",
                  }}
                >
                  Back to Sign In
                </Link>
              </div>
            </div>
          ) : success ? (
            /* Success State */
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: C.successBg,
                  border: `1px solid ${C.successBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 18px",
                }}
              >
                <i className="ti ti-circle-check" style={{ fontSize: "28px", color: C.successText }} />
              </div>
              <h2 style={{ fontSize: "22px", fontWeight: "700", color: C.textPrimary, marginBottom: "8px", letterSpacing: "-0.02em" }}>
                Password Updated
              </h2>
              <p style={{ fontSize: "14px", color: C.textSecondary, lineHeight: "1.6", marginBottom: "22px" }}>
                Your new password has been set successfully. Redirecting you to the login page…
              </p>
              <Link
                to="/login"
                className="btn-interactive"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "10px 20px",
                  borderRadius: "8px",
                  background: C.primary,
                  color: C.primaryText,
                  textDecoration: "none",
                  fontWeight: "600",
                  fontSize: "14px",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                <span>Go to Sign In</span>
                <i className="ti ti-arrow-right" />
              </Link>
            </div>
          ) : (
            /* Set/Reset Form State */
            <>
              <h1 style={{ fontSize: "24px", fontWeight: "700", color: C.textPrimary, textAlign: "center", marginBottom: "6px", letterSpacing: "-0.03em" }}>
                Set your password
              </h1>
              <p style={{ fontSize: "14px", color: C.textMuted, textAlign: "center", marginBottom: "24px", lineHeight: "1.5" }}>
                Enter and confirm your new secure password.
              </p>

              <form onSubmit={handleSubmit} noValidate>
                {error && (
                  <div
                    style={{
                      fontSize: "13px",
                      background: C.dangerBg,
                      color: C.dangerText,
                      border: `1px solid ${C.dangerBorder}`,
                      borderRadius: "8px",
                      padding: "11px 14px",
                      marginBottom: "18px",
                      display: "flex",
                      gap: "8px",
                      alignItems: "flex-start",
                    }}
                  >
                    <i className="ti ti-alert-circle" style={{ fontSize: "16px", flexShrink: 0, marginTop: "1px" }} />
                    <span>{error}</span>
                  </div>
                )}

                <PasswordField
                  label="New password"
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword(!showPassword)}
                  placeholder="Minimum 8 characters"
                />

                {/* Live Password Strength Meter */}
                {password && (
                  <div style={{ marginTop: "-6px", marginBottom: "16px" }}>
                    <div style={{ display: "flex", gap: "4px", marginBottom: "5px" }}>
                      {[1, 2, 3, 4].map((n) => (
                        <div
                          key={n}
                          style={{
                            flex: 1,
                            height: "3.5px",
                            borderRadius: "2px",
                            background: n <= strength ? STRENGTH_COLORS[strength] : C.subtleBg,
                            transition: "background 0.2s ease",
                          }}
                        />
                      ))}
                    </div>
                    <p style={{ fontSize: "11px", fontWeight: "600", color: STRENGTH_COLORS[strength] || C.textMuted, margin: 0 }}>
                      Strength: {STRENGTH_LABEL[strength]}
                    </p>
                  </div>
                )}

                <PasswordField
                  label="Confirm new password"
                  value={confirm}
                  onChange={setConfirm}
                  show={showConfirm}
                  onToggle={() => setShowConfirm(!showConfirm)}
                  placeholder="Repeat your password"
                  error={mismatch ? "Passwords don't match" : ""}
                />

                <button
                  type="submit"
                  disabled={loading || !allFilled || !!mismatch}
                  className="btn-interactive"
                  style={{
                    width: "100%",
                    padding: "12px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: (loading || !allFilled || mismatch) ? C.textMuted : C.primary,
                    color: C.primaryText,
                    fontSize: "14px",
                    fontWeight: "600",
                    fontFamily: "inherit",
                    cursor: (loading || !allFilled || mismatch) ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    marginTop: "8px",
                    boxShadow: (loading || !allFilled || mismatch) ? "none" : "0 4px 14px rgba(0,0,0,0.12)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {loading ? (
                    <>
                      <i className="ti ti-loader-2" style={{ fontSize: "16px", animation: "spin 1s linear infinite" }} />
                      <span>Updating password…</span>
                    </>
                  ) : (
                    <>
                      <i className="ti ti-lock" style={{ fontSize: "16px" }} />
                      <span>Set New Password</span>
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          <div style={{ textAlign: "center", marginTop: "24px", paddingTop: "18px", borderTop: `1px solid ${C.border}` }}>
            <Link
              to="/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                color: C.textSecondary,
                textDecoration: "none",
                fontWeight: "600",
                transition: "color 0.12s ease",
              }}
            >
              <i className="ti ti-arrow-left" />
              <span>Back to Sign In</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, show, onToggle, placeholder, error }) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ marginBottom: "16px" }}>
      <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: C.textSecondary, marginBottom: "6px" }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <i
          className="ti ti-lock"
          style={{
            position: "absolute",
            left: "13px",
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: "17px",
            color: focused ? C.textPrimary : C.textMuted,
            pointerEvents: "none",
          }}
        />
        <input
          type={show ? "text" : "password"}
          required
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            background: focused ? C.inputFocus : C.inputBg,
            border: `1.5px solid ${error ? C.accent : focused ? C.focusBorder : C.border}`,
            borderRadius: "8px",
            padding: "11px 40px 11px 40px",
            fontSize: "14px",
            color: C.textPrimary,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
            transition: "all 0.15s ease",
          }}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            right: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: C.textMuted,
            fontSize: "17px",
            padding: "2px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <i className={show ? "ti ti-eye-off" : "ti ti-eye"} />
        </button>
      </div>
      {error && <p style={{ fontSize: "11px", fontWeight: "600", color: C.accent, margin: "4px 0 0" }}>{error}</p>}
    </div>
  );
}