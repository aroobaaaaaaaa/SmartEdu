// src/components/ChangePasswordModal.jsx
// Concept A — Executive Premium
// No current-password field (admin-provisioned flow)

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import * as passwordApi from "../api/password";
import { getErrorMessage } from "../utils/errorMessage";
import { C } from "../theme";

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

export default function ChangePasswordModal({ onClose }) {
  const [next,       setNext]       = useState("");
  const [confirm,    setConfirm]    = useState("");
  const [showNext,    setShowNext]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState(false);
  const [loading,    setLoading]    = useState(false);

  const strength = getStrength(next);
  const allFilled = next && confirm;
  const mismatch  = confirm && next !== confirm;

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(onClose, 1800);
    return () => clearTimeout(t);
  }, [success, onClose]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (next !== confirm) { setError("Passwords don't match."); return; }
    if (next.length < 8)  { setError("New password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      await passwordApi.changePassword("", next);
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err, "Could not change password. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-labelledby="cpw-title"
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100vw", height: "100vh", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", boxSizing: "border-box", fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} />

      <div style={{ position: "relative", zIndex: 1, background: C.cardBg, borderRadius: "10px", border: `1px solid ${C.border}`, width: "100%", maxWidth: "400px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 48px rgba(0,0,0,0.22)" }}>

        <div style={{ height: "3px", background: C.accent }} />

        <div style={{ padding: "24px 24px 20px" }}>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <h2 id="cpw-title" style={{ fontSize: "16px", fontWeight: "700", letterSpacing: "-0.01em", color: C.textPrimary, margin: 0 }}>Change password</h2>
            <button onClick={onClose} aria-label="Close"
              style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: "20px", padding: "2px", display: "flex", alignItems: "center", borderRadius: "4px" }}>
              <i className="ti ti-x" />
            </button>
          </div>

          {success ? (
            <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: C.successBg, border: `1px solid ${C.successBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <i className="ti ti-circle-check" style={{ fontSize: "24px", color: C.successText }} />
              </div>
              <p style={{ fontSize: "15px", fontWeight: "600", color: C.successText, marginBottom: "6px" }}>Password updated</p>
              <p style={{ fontSize: "12px", color: C.textMuted }}>Closing automatically…</p>
            </div>

          ) : (
            <form onSubmit={handleSubmit} noValidate>

              {error && (
                <div style={{ fontSize: "13px", background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}`, borderRadius: "7px", padding: "10px 13px", marginBottom: "16px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: "15px", flexShrink: 0, marginTop: "1px" }} />
                  {error}
                </div>
              )}

              <PwField
                label="New password"
                value={next}
                onChange={setNext}
                show={showNext}
                onToggle={() => setShowNext(!showNext)}
                placeholder="Minimum 8 characters"
              />

              {next && (
                <div style={{ marginTop: "-8px", marginBottom: "14px" }}>
                  <div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
                    {[1,2,3,4].map((n) => (
                      <div key={n} style={{ flex: 1, height: "3px", borderRadius: "2px", background: n <= strength ? STRENGTH_COLORS[strength] : C.subtleBg, transition: "background 0.2s" }} />
                    ))}
                  </div>
                  <p style={{ fontSize: "11px", color: STRENGTH_COLORS[strength] || C.textMuted }}>{STRENGTH_LABEL[strength]}</p>
                </div>
              )}

              <PwField
                label="Confirm new password"
                value={confirm}
                onChange={setConfirm}
                show={showConfirm}
                onToggle={() => setShowConfirm(!showConfirm)}
                placeholder="Repeat your new password"
                error={mismatch ? "Passwords don't match" : ""}
              />

              <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                <button type="button" onClick={onClose}
                  style={{ flex: "0 0 auto", padding: "9px 16px", borderRadius: "7px", border: `1px solid ${C.border}`, background: C.cardBg, color: C.textSecondary, fontSize: "14px", fontWeight: "500", fontFamily: "inherit", cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading || !allFilled || !!mismatch}
                  style={{ flex: 1, padding: "9px 16px", borderRadius: "7px", border: "none", background: (loading || !allFilled || mismatch) ? C.textMuted : C.primary, color: C.primaryText, fontSize: "14px", fontWeight: "600", fontFamily: "inherit", cursor: (loading || !allFilled || mismatch) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", transition: "background 0.15s" }}>
                  {loading
                    ? <><i className="ti ti-loader-2" style={{ fontSize: "16px", animation: "spin 1s linear infinite" }} />Updating…</>
                    : <><i className="ti ti-lock" style={{ fontSize: "15px" }} />Update password</>
                  }
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body
  );
}

function PwField({ label, value, onChange, show, onToggle, placeholder, error }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: "14px" }}>
      <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: C.textSecondary, marginBottom: "6px" }}>{label}</label>
      <div style={{ position: "relative" }}>
        <i className="ti ti-lock" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", fontSize: "16px", color: focused ? C.textPrimary : C.textMuted, pointerEvents: "none" }} />
        <input
          type={show ? "text" : "password"}
          required
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ width: "100%", background: focused ? C.inputFocus : C.inputBg, border: `1.5px solid ${error ? C.accent : focused ? C.focusBorder : C.border}`, borderRadius: "7px", padding: "10px 40px 10px 36px", fontSize: "15px", color: C.textPrimary, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
        />
        <button type="button" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}
          style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: "16px", padding: "2px", display: "flex", alignItems: "center" }}>
          <i className={show ? "ti ti-eye-off" : "ti ti-eye"} />
        </button>
      </div>
      {error && <p style={{ fontSize: "11px", color: C.accent, margin: "4px 0 0" }}>{error}</p>}
    </div>
  );
}