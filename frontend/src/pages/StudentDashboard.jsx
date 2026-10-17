// src/pages/StudentDashboard.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout, { PageShell } from "../components/Layout";
import * as coursesApi from "../api/courses";
import * as badgesApi from "../api/badges";
import BadgePill from "../components/BadgePill";
import { getErrorMessage } from "../utils/errorMessage";
import { C } from "../theme";

export default function StudentDashboard() {
  const [courses, setCourses] = useState([]);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      coursesApi.listEnrolledCourses(),
      badgesApi.getMyBadges().catch(() => ({ data: [] })),
    ])
      .then(([{ data: cData }, { data: bData }]) => {
        setCourses(cData || []);
        setBadges(bData || []);
      })
      .catch((err) => setError(getErrorMessage(err, "Couldn't load your courses.")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <PageShell title="My Dashboard" subtitle="Enrolled courses and earned achievements">
        {error && (
          <div style={{ background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}`, borderRadius: "7px", padding: "11px 14px", marginBottom: "20px", fontSize: "14px", display: "flex", gap: "8px" }}>
            <i className="ti ti-alert-circle" style={{ fontSize: "16px", flexShrink: 0 }} />{error}
          </div>
        )}

        {/* Earned Badges Showcase */}
        {badges.length > 0 && (
          <div className="animate-fade-in card-hover-elevate" style={{ background: C.cardBg, borderRadius: "10px", border: `1px solid ${C.border}`, padding: "18px 22px", marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <i className="ti ti-award" style={{ fontSize: "20px", color: C.accent }} />
                <h3 style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, margin: 0 }}>
                  Earned Achievements ({badges.length})
                </h3>
              </div>
              <span style={{ fontSize: "12px", color: C.textMuted, fontWeight: "500" }}>Unlocked</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {badges.map((b) => (
                <BadgePill key={b.id} badge={b} size="md" />
              ))}
            </div>
          </div>
        )}

        {/* ── Enrolled Courses Section ── */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
            <div className="skeleton-shimmer" style={{ height: "180px", borderRadius: "10px" }} />
            <div className="skeleton-shimmer" style={{ height: "180px", borderRadius: "10px" }} />
          </div>
        ) : courses.length === 0 ? (
          <div className="animate-fade-in" style={{ background: C.cardBg, borderRadius: "10px", border: `1px solid ${C.border}`, padding: "56px 32px", textAlign: "center" }}>
            <i className="ti ti-books" style={{ fontSize: "36px", color: C.border, display: "block", marginBottom: "14px" }} />
            <p style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, margin: "0 0 6px" }}>No enrolled courses</p>
            <p style={{ fontSize: "14px", color: C.textMuted, margin: 0 }}>Ask your administrator to enroll you in a course.</p>
          </div>
        ) : (
          <div className="animate-fade-in">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "700", color: C.textPrimary, margin: 0 }}>
                My Enrolled Courses ({courses.length})
              </h3>
              <span style={{ fontSize: "12px", color: C.textMuted }}>Direct Course Access</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "18px" }}>
              {courses.map((course) => (
                <StudentCourseCard key={course.id} course={course} navigate={navigate} />
              ))}
            </div>
          </div>
        )}
      </PageShell>
    </Layout>
  );
}

function StudentCourseCard({ course, navigate }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: C.cardBg,
        borderRadius: "10px",
        border: `1px solid ${hovered ? C.accent : C.border}`,
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.03)",
        transition: "all 0.2s ease",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: C.accentText, background: C.accentTint, padding: "4px 9px", borderRadius: "5px", letterSpacing: "0.04em" }}>
            {course.code}
          </span>
          <i className="ti ti-arrow-right" style={{ fontSize: "16px", color: hovered ? C.accent : C.textMuted, transform: hovered ? "translateX(3px)" : "none", transition: "all 0.15s ease" }} />
        </div>

        <h4
          onClick={() => navigate(`/student/courses/${course.id}`)}
          style={{ fontSize: "16px", fontWeight: "700", color: C.textPrimary, margin: "0 0 6px", cursor: "pointer", lineHeight: "1.3" }}
        >
          {course.name}
        </h4>

        {course.description && (
          <p style={{ fontSize: "13px", color: C.textMuted, margin: "0 0 16px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {course.description}
          </p>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "14px", marginTop: "14px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <button
          onClick={() => navigate(`/student/courses/${course.id}?tab=materials`)}
          className="btn-interactive"
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            fontSize: "12px",
            fontWeight: "600",
            padding: "6px 10px",
            borderRadius: "6px",
            background: C.subtleBg,
            border: `1px solid ${C.border}`,
            color: C.textPrimary,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <i className="ti ti-file-text" style={{ fontSize: "13px", color: C.accent }} />
          Lectures
        </button>

        <button
          onClick={() => navigate(`/student/courses/${course.id}?tab=assignments`)}
          className="btn-interactive"
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            fontSize: "12px",
            fontWeight: "600",
            padding: "6px 10px",
            borderRadius: "6px",
            background: C.subtleBg,
            border: `1px solid ${C.border}`,
            color: C.textPrimary,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <i className="ti ti-clipboard-list" style={{ fontSize: "13px", color: C.accent }} />
          Assignments
        </button>

        <button
          onClick={() => navigate(`/student/courses/${course.id}?tab=chatbot`)}
          className="btn-interactive"
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            fontSize: "12px",
            fontWeight: "600",
            padding: "6px 10px",
            borderRadius: "6px",
            background: C.subtleBg,
            border: `1px solid ${C.border}`,
            color: C.textPrimary,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <i className="ti ti-sparkles" style={{ fontSize: "13px", color: C.accent }} />
          AI Chat
        </button>
      </div>
    </div>
  );
}