// src/pages/LandingPage.jsx
import { useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import AIHeroBanner from "../components/AIHeroBanner";
import { C } from "../theme";

const HOME_BY_ROLE = { admin: "/admin", teacher: "/teacher", student: "/student" };

export default function LandingPage() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  // If user is already authenticated, redirect straight past the marketing landing page
  if (user) {
    return <Navigate to={HOME_BY_ROLE[user.role] || "/login"} replace />;
  }

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, color: C.textPrimary, fontFamily: "'Inter', system-ui, sans-serif", transition: "background 0.2s ease, color 0.2s ease" }}>
      
      {/* ── 3D WebGL AI Hero Banner Section ── */}
      <AIHeroBanner onGetStarted={() => navigate("/login")} />

      {/* ── Feature Highlights Grid ── */}
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "64px 24px" }}>
        
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: C.accentTint, border: `1px solid ${C.dangerBorder}`, padding: "4px 12px", borderRadius: "20px", marginBottom: "12px" }}>
            <i className="ti ti-sparkles" style={{ fontSize: "14px", color: C.accent }} />
            <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase", color: C.accentText }}>
              Platform Capabilities
            </span>
          </div>

          <h2 style={{ fontSize: "clamp(26px, 4vw, 36px)", fontWeight: "800", margin: "0 0 10px", color: C.textPrimary, letterSpacing: "-0.03em" }}>
            Engineered for Modern Universities
          </h2>
          <p style={{ fontSize: "15px", color: C.textMuted, maxWidth: "620px", margin: "0 auto", lineHeight: "1.6" }}>
            SmartEdu unifies RAG document intelligence, automated rubric-based grading, and predictive analytics into a seamless workflow.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "28px" }}>
          
          {/* Card 1: Vector RAG */}
          <div
            className="btn-interactive card-hover-elevate"
            style={{
              background: C.cardBg,
              borderRadius: "12px",
              border: `1px solid ${C.border}`,
              padding: "28px",
              boxShadow: isDark ? "0 10px 30px rgba(0,0,0,0.25)" : "0 4px 20px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: C.accentTint, border: `1px solid ${C.dangerBorder}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "18px" }}>
              <i className="ti ti-message-chatbot" style={{ fontSize: "22px", color: C.accent }} />
            </div>
            <h3 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 10px", color: C.textPrimary }}>
              Vector RAG Assistant
            </h3>
            <p style={{ fontSize: "14px", color: C.textSecondary, lineHeight: "1.6", margin: 0 }}>
              Queries vectorized lecture documents and LMS context in real time, serving accurate, cited academic answers.
            </p>
          </div>

          {/* Card 2: Auto Rubrics */}
          <div
            className="btn-interactive card-hover-elevate"
            style={{
              background: C.cardBg,
              borderRadius: "12px",
              border: `1px solid ${C.border}`,
              padding: "28px",
              boxShadow: isDark ? "0 10px 30px rgba(0,0,0,0.25)" : "0 4px 20px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: C.successBg, border: `1px solid ${C.successBorder}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "18px" }}>
              <i className="ti ti-clipboard-check" style={{ fontSize: "22px", color: C.successText }} />
            </div>
            <h3 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 10px", color: C.textPrimary }}>
              Auto Rubric Evaluation
            </h3>
            <p style={{ fontSize: "14px", color: C.textSecondary, lineHeight: "1.6", margin: 0 }}>
              Evaluates PDF assignments against detailed rubric criteria, providing constructive feedback and criterion scores.
            </p>
          </div>

          {/* Card 3: Plagiarism Scan */}
          <div
            className="btn-interactive card-hover-elevate"
            style={{
              background: C.cardBg,
              borderRadius: "12px",
              border: `1px solid ${C.border}`,
              padding: "28px",
              boxShadow: isDark ? "0 10px 30px rgba(0,0,0,0.25)" : "0 4px 20px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: C.infoBg, border: `1px solid ${C.infoBorder}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "18px" }}>
              <i className="ti ti-shield-search" style={{ fontSize: "22px", color: C.infoText }} />
            </div>
            <h3 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 10px", color: C.textPrimary }}>
              Plagiarism Multi-Scan
            </h3>
            <p style={{ fontSize: "14px", color: C.textSecondary, lineHeight: "1.6", margin: 0 }}>
              Combines TF-IDF cosine similarity, k-shingle overlap, and highlighted passage extraction to safeguard academic integrity.
            </p>
          </div>

        </div>

        {/* Call to Action Bar */}
        <div
          style={{
            marginTop: "64px",
            padding: "36px",
            borderRadius: "14px",
            background: isDark ? "rgba(30, 41, 59, 0.7)" : "#FFFFFF",
            border: `1px solid ${C.border}`,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.06)",
          }}
        >
          <h3 style={{ fontSize: "22px", fontWeight: "800", margin: 0, color: C.textPrimary }}>
            Ready to experience next-generation learning?
          </h3>
          <p style={{ fontSize: "14px", color: C.textMuted, margin: 0, maxWidth: "500px" }}>
            Sign in with your student, teacher, or administrative credentials to access your dashboard.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="btn-interactive"
            style={{
              padding: "12px 28px",
              borderRadius: "8px",
              border: "none",
              background: C.accent,
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: "700",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 4px 16px rgba(239, 68, 68, 0.35)",
            }}
          >
            <span>Sign In to SmartEdu</span>
            <i className="ti ti-arrow-right" style={{ fontSize: "15px" }} />
          </button>
        </div>

      </div>

    </div>
  );
}
