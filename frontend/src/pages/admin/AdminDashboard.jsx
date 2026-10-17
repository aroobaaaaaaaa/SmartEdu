// src/pages/admin/AdminDashboard.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout, { PageShell, Btn } from "../../components/Layout";
import * as adminApi from "../../api/admin";
import { getErrorMessage } from "../../utils/errorMessage";
import { C, T } from "../../theme";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    Promise.all([adminApi.listAllCourses(), adminApi.listUsers()])
      .then(([{ data: c }, { data: u }]) => { setCourses(c); setUsers(u); })
      .catch((err) => setError(getErrorMessage(err, "Could not load dashboard data.")))
      .finally(() => setLoading(false));
  }, []);

  const teachers = users.filter((u) => u.role === "teacher");
  const students = users.filter((u) => u.role === "student");
  const pending  = users.filter((u) => !u.has_set_password);

  const stats = [
    { label: "Courses",  value: courses.length,  sub: "Active this semester", accent: C.statCourses  },
    { label: "Teachers", value: teachers.length,  sub: "Assigned faculty",     accent: C.statTeachers },
    { label: "Students", value: students.length,  sub: "Enrolled this term",   accent: C.statStudents },
    { label: "Pending",  value: pending.length,   sub: "Awaiting setup email", accent: C.statPending  },
  ];

  return (
    <Layout>
      <PageShell title="Dashboard" subtitle="Alpha College · LMS Administration">

        {error && (
          <div style={{ background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}`, borderRadius: "7px", padding: "11px 14px", marginBottom: "22px", fontSize: "14px" }}>
            {error}
          </div>
        )}

        {/* ── Stat cards — left border accent, editorial style ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "36px" }}>
          {stats.map(({ label, value, sub, accent }) => (
            <div key={label} className="card-hover-elevate" style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, borderLeft: `4px solid ${accent}`, padding: "20px 20px 18px" }}>
              <p style={{ ...T.statLabel, color: C.textMuted, margin: "0 0 10px" }}>{label}</p>
              <p style={{ ...T.statValue, color: C.textPrimary, margin: "0 0 4px" }}>
                {loading ? "—" : value}
              </p>
              <p style={{ ...T.statSub, color: C.textMuted, margin: 0 }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Courses section ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <h2 style={{ ...T.sectionHeading, color: C.textPrimary, margin: 0 }}>All Courses</h2>
          <Btn onClick={() => navigate("/admin/courses")} size="sm">
            <i className="ti ti-plus" style={{ fontSize: "15px" }} />New course
          </Btn>
        </div>

        {loading ? (
          <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "48px", textAlign: "center", color: C.textMuted, ...T.bodyText }}>
            Loading…
          </div>
        ) : courses.length === 0 ? (
          <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "48px", textAlign: "center" }}>
            <i className="ti ti-books" style={{ fontSize: "32px", color: C.border, display: "block", marginBottom: "12px" }} />
            <p style={{ ...T.bodyText, color: C.textMuted, margin: 0 }}>No courses yet. Create the first one.</p>
          </div>
        ) : (
          <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {courses.map((course, i) => (
              <CourseRow key={course.id} course={course} last={i === courses.length - 1} onClick={() => navigate(`/admin/courses/${course.id}`)} />
            ))}
          </div>
        )}
      </PageShell>
    </Layout>
  );
}

function CourseRow({ course, last, onClick }) {
  const [hovered, setHovered] = useState(false);
  const noTeacher = !course.teachers?.length;
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: last ? "none" : `1px solid ${C.border}`, background: hovered ? C.subtleBg : C.cardBg, cursor: "pointer", transition: "background 0.12s", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
        {/* Course code badge */}
        <div style={{ flexShrink: 0, minWidth: "68px" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: noTeacher ? C.warningText : C.accentText, background: noTeacher ? C.warningBg : C.accentTint, padding: "4px 8px", borderRadius: "5px", letterSpacing: "0.04em" }}>
            {course.code}
          </span>
        </div>
        {/* Course info */}
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, margin: "0 0 3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{course.name}</p>
          {noTeacher ? (
            <p style={{ ...T.caption, color: C.warningText, margin: 0 }}>
              <i className="ti ti-alert-triangle" style={{ marginRight: "4px" }} />No teacher assigned
            </p>
          ) : (
            <p style={{ ...T.caption, color: C.textMuted, margin: 0 }}>
              <i className="ti ti-user" style={{ marginRight: "4px" }} />
              {course.teachers.map((t) => t.full_name).join(", ")}
            </p>
          )}
        </div>
      </div>
      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
        <span style={{ ...T.caption, color: C.textMuted, whiteSpace: "nowrap" }}>{course.student_count ?? 0} students</span>
        <i className="ti ti-arrow-right" style={{ fontSize: "16px", color: hovered ? C.accent : C.textMuted, transition: "color 0.12s" }} />
      </div>
    </div>
  );
}