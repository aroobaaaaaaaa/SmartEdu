// src/pages/TeacherDashboard.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout, { PageShell } from "../components/Layout";
import * as coursesApi from "../api/courses";
import { getErrorMessage } from "../utils/errorMessage";
import { C } from "../theme";

export default function TeacherDashboard() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    coursesApi.listTeachingCourses()
      .then(({ data }) => {
        setCourses(data || []);
      })
      .catch((err) => setError(getErrorMessage(err, "Couldn't load your courses.")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <PageShell title="Teacher Dashboard" subtitle="Manage assigned courses, materials, and student grading">

        {error && (
          <div style={{ background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}`, borderRadius: "7px", padding: "11px 14px", marginBottom: "22px", fontSize: "14px", display: "flex", gap: "9px", alignItems: "flex-start" }}>
            <i className="ti ti-alert-circle" style={{ fontSize: "16px", flexShrink: 0, marginTop: "1px" }} />
            {error}
          </div>
        )}

        {/* ── Course list grid ── */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "18px" }}>
            <div className="skeleton-shimmer" style={{ height: "180px", borderRadius: "10px" }} />
            <div className="skeleton-shimmer" style={{ height: "180px", borderRadius: "10px" }} />
          </div>
        ) : courses.length === 0 ? (
          <div className="animate-fade-in" style={{ background: C.cardBg, borderRadius: "10px", border: `1px solid ${C.border}`, padding: "56px 32px", textAlign: "center" }}>
            <i className="ti ti-books" style={{ fontSize: "36px", color: C.border, display: "block", marginBottom: "14px" }} />
            <p style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, marginBottom: "6px" }}>No courses assigned</p>
            <p style={{ fontSize: "14px", color: C.textMuted }}>Contact an admin to get assigned to a course.</p>
          </div>
        ) : (
          <div className="animate-fade-in">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "700", color: C.textPrimary, margin: 0 }}>
                My Teaching Courses ({courses.length})
              </h3>
              <span style={{ fontSize: "12px", color: C.textMuted }}>Course Management</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "18px" }}>
              {courses.map((course) => (
                <TeacherCourseCard key={course.id} course={course} navigate={navigate} />
              ))}
            </div>
          </div>
        )}
      </PageShell>
    </Layout>
  );
}

function TeacherCourseCard({ course, navigate }) {
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
          onClick={() => navigate(`/teacher/courses/${course.id}`)}
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
          onClick={() => navigate(`/teacher/courses/${course.id}?tab=materials`)}
          className="btn-interactive"
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            fontSize: "12px",
            fontWeight: "600",
            padding: "6px 8px",
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
          onClick={() => navigate(`/teacher/courses/${course.id}?tab=assignments`)}
          className="btn-interactive"
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            fontSize: "12px",
            fontWeight: "600",
            padding: "6px 8px",
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
          onClick={() => navigate(`/teacher/courses/${course.id}?tab=students`)}
          className="btn-interactive"
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            fontSize: "12px",
            fontWeight: "600",
            padding: "6px 8px",
            borderRadius: "6px",
            background: C.subtleBg,
            border: `1px solid ${C.border}`,
            color: C.textPrimary,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <i className="ti ti-users" style={{ fontSize: "13px", color: C.accent }} />
          Students
        </button>
      </div>
    </div>
  );
}