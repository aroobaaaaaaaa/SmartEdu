// src/pages/AIHeroPreview.jsx
import { useNavigate } from "react-router-dom";
import AIHeroBanner from "../components/AIHeroBanner";
import { C } from "../theme";

export default function AIHeroPreview() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: "#090D16", color: "#F8FAFC", fontFamily: "'Inter', system-ui, sans-serif" }}>
      
      {/* ── 3D AI Hero Showcase Section ── */}
      <AIHeroBanner onGetStarted={() => navigate("/login")} />

      {/* ── Visual Feature Showcase Grid ── */}
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "60px 24px" }}>
        
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.12em", textTransform: "uppercase", color: "#EF4444", background: "rgba(239, 68, 68, 0.12)", padding: "4px 12px", borderRadius: "20px" }}>
            2026 AI-Powered Features
          </span>
          <h2 style={{ fontSize: "28px", fontWeight: "800", margin: "14px 0 8px", color: "#ffffff" }}>
            Designed for Academic Excellence
          </h2>
          <p style={{ fontSize: "15px", color: "#94A3B8", maxWidth: "600px", margin: "0 auto" }}>
            Seamlessly integrating LLM RAG pipelines, auto-rubric grading, and multi-algorithm plagiarism detection.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
          
          {/* Card 1 */}
          <div
            className="btn-interactive"
            style={{
              background: "rgba(30, 41, 59, 0.5)",
              borderRadius: "12px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              padding: "24px",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{ width: "42px", height: "42px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
              <i className="ti ti-message-chatbot" style={{ fontSize: "22px", color: "#EF4444" }} />
            </div>
            <h3 style={{ fontSize: "17px", fontWeight: "700", margin: "0 0 8px", color: "#ffffff" }}>
              RAG Course Assistant
            </h3>
            <p style={{ fontSize: "13px", color: "#94A3B8", lineHeight: "1.6", margin: 0 }}>
              Queries vectorized lecture PDFs & LMS contexts directly, delivering cited answers without hallucinating course material.
            </p>
          </div>

          {/* Card 2 */}
          <div
            className="btn-interactive"
            style={{
              background: "rgba(30, 41, 59, 0.5)",
              borderRadius: "12px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              padding: "24px",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{ width: "42px", height: "42px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
              <i className="ti ti-clipboard-check" style={{ fontSize: "22px", color: "#EF4444" }} />
            </div>
            <h3 style={{ fontSize: "17px", fontWeight: "700", margin: "0 0 8px", color: "#ffffff" }}>
              AI Rubric Evaluation
            </h3>
            <p style={{ fontSize: "13px", color: "#94A3B8", lineHeight: "1.6", margin: 0 }}>
              Evaluates submitted PDF assignments against customizable teacher rubric criteria with criterion-level scoring.
            </p>
          </div>

          {/* Card 3 */}
          <div
            className="btn-interactive"
            style={{
              background: "rgba(30, 41, 59, 0.5)",
              borderRadius: "12px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              padding: "24px",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{ width: "42px", height: "42px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
              <i className="ti ti-shield-search" style={{ fontSize: "22px", color: "#EF4444" }} />
            </div>
            <h3 style={{ fontSize: "17px", fontWeight: "700", margin: "0 0 8px", color: "#ffffff" }}>
              Plagiarism Scan
            </h3>
            <p style={{ fontSize: "13px", color: "#94A3B8", lineHeight: "1.6", margin: 0 }}>
              Combines TF-IDF cosine similarity, k-shingle overlap, and passage-level highlighting for detailed originality reports.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
