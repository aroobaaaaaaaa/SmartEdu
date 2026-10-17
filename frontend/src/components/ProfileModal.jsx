// src/components/ProfileModal.jsx
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { C, ROLE_COLORS } from "../theme";

export default function ProfileModal({ onClose, onChangePassword, onLogout }) {
  const { user } = useAuth();

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!user) return null;

  const rc = ROLE_COLORS[user.role] || ROLE_COLORS.student;
  const initials = (user.fullName || "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        padding: "16px",
        boxSizing: "border-box",
      }}
      onClick={onClose}
    >
      <div
        className="animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "440px",
          maxHeight: "90vh",
          background: C.cardBg,
          borderRadius: "14px",
          border: `1px solid ${C.border}`,
          boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 20px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <i className="ti ti-user-circle" style={{ fontSize: "20px", color: C.accent }} />
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: C.textPrimary }}>
              Profile Details
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: C.textMuted,
              fontSize: "20px",
              display: "flex",
              alignItems: "center",
              padding: "2px",
            }}
          >
            <i className="ti ti-x" />
          </button>
        </div>

        {/* User Banner */}
        <div
          style={{
            padding: "24px 20px 18px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            borderBottom: `1px solid ${C.border}`,
            background: C.subtleBg,
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: C.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
              fontWeight: "700",
              color: "#ffffff",
              marginBottom: "12px",
              boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
            }}
          >
            {initials}
          </div>
          <h4 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: "700", color: C.textPrimary }}>
            {user.fullName}
          </h4>
          <p style={{ margin: "0 0 10px", fontSize: "13px", color: C.textMuted }}>
            {user.email}
          </p>
          <span
            style={{
              fontSize: "11px",
              fontWeight: "700",
              padding: "3px 10px",
              borderRadius: "20px",
              background: rc.bg,
              color: rc.text,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {user.role}
          </span>
        </div>

        {/* Info Grid */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
            <span style={{ color: C.textMuted }}>Full Name</span>
            <span style={{ fontWeight: "600", color: C.textPrimary }}>{user.fullName}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
            <span style={{ color: C.textMuted }}>Email Address</span>
            <span style={{ fontWeight: "600", color: C.textPrimary }}>{user.email}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
            <span style={{ color: C.textMuted }}>Role</span>
            <span style={{ fontWeight: "600", color: C.textPrimary, textTransform: "capitalize" }}>{user.role}</span>
          </div>

          {user.registrationNumber && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
              <span style={{ color: C.textMuted }}>Registration #</span>
              <span style={{ fontWeight: "600", color: C.textPrimary }}>{user.registrationNumber}</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
            <span style={{ color: C.textMuted }}>Account Status</span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: "700",
                padding: "2px 8px",
                borderRadius: "12px",
                background: C.successBg,
                color: C.successText,
                border: `1px solid ${C.successBorder}`,
              }}
            >
              Active
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "14px 20px 18px",
            borderTop: `1px solid ${C.border}`,
            display: "flex",
            gap: "10px",
            justifyContent: "flex-end",
            background: C.subtleBg,
          }}
        >
          <button
            onClick={() => {
              onClose();
              if (onChangePassword) onChangePassword();
            }}
            style={{
              padding: "8px 14px",
              borderRadius: "7px",
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              color: C.textPrimary,
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <i className="ti ti-lock" style={{ fontSize: "15px" }} />
            Change Password
          </button>
          <button
            onClick={() => {
              onClose();
              if (onLogout) onLogout();
            }}
            style={{
              padding: "8px 14px",
              borderRadius: "7px",
              background: C.dangerBg,
              border: `1px solid ${C.dangerBorder}`,
              color: C.dangerText,
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <i className="ti ti-logout" style={{ fontSize: "15px" }} />
            Sign Out
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
