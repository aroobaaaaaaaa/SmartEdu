// src/pages/admin/AdminCourses.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout, { PageShell, Card, Btn, Alert, Input } from "../../components/Layout";
import * as adminApi from "../../api/admin";
import { getErrorMessage } from "../../utils/errorMessage";
import { C, T } from "../../theme";

export default function AdminCourses() {
  const navigate = useNavigate();
  const [courses, setCourses]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ name: "", code: "", description: "" });
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [search, setSearch]     = useState("");

  const load = () => {
    setLoading(true);
    adminApi.listAllCourses()
      .then(({ data }) => setCourses(data))
      .catch((err) => setError(getErrorMessage(err, "Could not load courses.")))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    try {
      await adminApi.createCourse({ name: form.name.trim(), code: form.code.trim().toUpperCase(), description: form.description.trim() || undefined });
      setSuccess("Course created.");
      setForm({ name: "", code: "", description: "" });
      setShowForm(false); load();
    } catch (err) { setError(getErrorMessage(err, "Could not create course.")); }
  };

  const handleDeleteCourse = async (e, course) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete course "${course.name}" (${course.code})?`)) return;
    setError(""); setSuccess("");
    try {
      await adminApi.deleteCourse(course.id);
      setSuccess(`Course "${course.name}" deleted successfully.`);
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Could not delete course."));
    }
  };

  const visible = courses.filter((c) => !search || `${c.name} ${c.code}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <Layout>
      <PageShell
        title="Courses"
        subtitle={`${courses.length} course${courses.length !== 1 ? "s" : ""}`}
        action={
          <Btn onClick={() => { setShowForm(!showForm); setError(""); setSuccess(""); }}>
            <i className={`ti ${showForm ? "ti-x" : "ti-plus"}`} style={{ fontSize: "15px" }} />
            {showForm ? "Cancel" : "New course"}
          </Btn>
        }
      >
        <Alert variant="error">{error}</Alert>
        <Alert variant="success">{success}</Alert>

        {showForm && (
          <Card style={{ padding: "22px", marginBottom: "20px" }}>
            <p style={{ fontSize: "16px", fontWeight: "600", color: C.textPrimary, margin: "0 0 18px" }}>Create new course</p>
            <form onSubmit={handleCreate}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "start" }}>
                <Input label="Course name" required placeholder="e.g. Data Structures & Algorithms" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input label="Course code" required placeholder="CS-301" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={{ width: "140px" }} />
              </div>
              <Input label="Description (optional)" placeholder="Brief description for students…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Btn type="submit" size="lg" style={{ width: "100%", justifyContent: "center" }}>
                <i className="ti ti-plus" style={{ fontSize: "15px" }} />Create course
              </Btn>
            </form>
          </Card>
        )}

        {/* Search */}
        <div style={{ position: "relative", marginBottom: "16px" }}>
          <i className="ti ti-search" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: C.textMuted, fontSize: "16px", pointerEvents: "none" }} />
          <input placeholder="Search by name or code…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", maxWidth: "360px", background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "9px 13px 9px 36px", fontSize: "14px", color: C.textPrimary, fontFamily: "inherit", outline: "none" }} />
        </div>

        {loading ? (
          <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "48px", textAlign: "center", color: C.textMuted, ...T.bodyText }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "48px", textAlign: "center" }}>
            <i className="ti ti-books" style={{ fontSize: "32px", color: C.border, display: "block", marginBottom: "12px" }} />
            <p style={{ ...T.bodyText, color: C.textMuted, margin: 0 }}>{search ? "No courses match your search." : "No courses yet."}</p>
          </div>
        ) : (
          <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {visible.map((course, i) => (
              <CourseRow
                key={course.id}
                course={course}
                last={i === visible.length - 1}
                onClick={() => navigate(`/admin/courses/${course.id}`)}
                onDelete={(e) => handleDeleteCourse(e, course)}
              />
            ))}
          </div>
        )}
      </PageShell>
    </Layout>
  );
}

function CourseRow({ course, last, onClick, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const noTeacher = !course.teachers?.length;
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: last ? "none" : `1px solid ${C.border}`, background: hovered ? C.subtleBg : C.cardBg, cursor: "pointer", transition: "background 0.12s", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0, flex: 1 }}>
        <div style={{ flexShrink: 0 }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: noTeacher ? C.warningText : C.accentText, background: noTeacher ? C.warningBg : C.accentTint, padding: "4px 8px", borderRadius: "5px", letterSpacing: "0.04em" }}>
            {course.code}
          </span>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, margin: "0 0 3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{course.name}</p>
          <p style={{ ...T.caption, color: noTeacher ? C.warningText : C.textMuted, margin: 0 }}>
            {noTeacher
              ? <><i className="ti ti-alert-triangle" style={{ marginRight: "4px" }} />No teacher assigned</>
              : <><i className="ti ti-user" style={{ marginRight: "4px" }} />{course.teachers.map((t) => t.full_name).join(", ")}</>
            }
          </p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
        <span style={{ ...T.caption, color: C.textMuted }}>{course.student_count ?? 0} students</span>
        <button
          type="button"
          title="Delete course"
          onClick={onDelete}
          className="btn-interactive"
          style={{
            background: "transparent",
            border: `1px solid ${C.dangerBorder}`,
            borderRadius: "6px",
            color: C.dangerText,
            padding: "5px 9px",
            fontSize: "13px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            flexShrink: 0
          }}
        >
          <i className="ti ti-trash" style={{ fontSize: "14px" }} />
          <span>Delete</span>
        </button>
        <i className="ti ti-arrow-right" style={{ fontSize: "16px", color: hovered ? C.accent : C.textMuted, transition: "color 0.12s" }} />
      </div>
    </div>
  );
}