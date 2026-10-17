// src/pages/admin/AdminCourseDetail.jsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout, { PageShell, Card, CardHeader, Btn, Alert, Select } from "../../components/Layout";
import * as adminApi from "../../api/admin";
import { getErrorMessage } from "../../utils/errorMessage";
import { C, T } from "../../theme";

export default function AdminCourseDetail() {
  const { courseId } = useParams();
  const navigate     = useNavigate();

  const [course, setCourse]                       = useState(null);
  const [enrolledStudents, setEnrolledStudents]   = useState([]);
  const [allTeachers, setAllTeachers]             = useState([]);
  const [allStudents, setAllStudents]             = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [error, setError]                         = useState("");
  const [success, setSuccess]                     = useState("");
  const [loading, setLoading]                     = useState(true);

  const loadCourse = useCallback(() => {
    adminApi.listAllCourses()
      .then(({ data }) => {
        const found = data.find((c) => c.id === Number(courseId));
        setCourse(found || null);
      })
      .catch((err) => setError(getErrorMessage(err, "Could not load course.")))
      .finally(() => setLoading(false));

    adminApi.listCourseStudents(courseId)
      .then(({ data }) => setEnrolledStudents(data))
      .catch(() => setEnrolledStudents([]));
  }, [courseId]);

  useEffect(() => {
    loadCourse();
    adminApi.listUsers("teacher").then(({ data }) => setAllTeachers(data.filter((u) => u.is_active)));
    adminApi.listUsers("student").then(({ data }) => setAllStudents(data.filter((u) => u.is_active)));
  }, [loadCourse]);

  const clear = () => { setError(""); setSuccess(""); };

  const handleAssignTeacher = async (e) => {
    e.preventDefault(); clear();
    if (!selectedTeacherId) { setError("Please select a teacher."); return; }
    if (course.teachers?.length > 0) {
      setError("This course already has a teacher assigned. A course can only have one teacher. Remove the current teacher first.");
      return;
    }
    const teacher = allTeachers.find((t) => t.id === Number(selectedTeacherId));
    try {
      await adminApi.assignTeacher(courseId, teacher.email);
      setSuccess(`${teacher.full_name} assigned to this course.`);
      setSelectedTeacherId(""); loadCourse();
    } catch (err) { setError(getErrorMessage(err, "Could not assign teacher.")); }
  };

  const handleUnassignTeacher = async (teacher) => {
    if (!window.confirm(`Are you sure you want to remove teacher ${teacher.full_name} from this course?`)) return;
    clear();
    try {
      await adminApi.unassignTeacher(courseId, teacher.id);
      setSuccess(`Teacher ${teacher.full_name} removed from course.`);
      loadCourse();
    } catch (err) { setError(getErrorMessage(err, "Could not remove teacher.")); }
  };

  const handleEnrollStudent = async (e) => {
    e.preventDefault(); clear();
    if (!selectedStudentId) { setError("Please select a student."); return; }
    const student = allStudents.find((s) => s.id === Number(selectedStudentId));
    try {
      await adminApi.enrollStudent(courseId, student.email);
      setSuccess(`${student.full_name} enrolled successfully.`);
      setSelectedStudentId(""); loadCourse();
    } catch (err) { setError(getErrorMessage(err, "Could not enroll student.")); }
  };

  const handleUnenrollStudent = async (student) => {
    if (!window.confirm(`Are you sure you want to remove student ${student.full_name} from this course?`)) return;
    clear();
    try {
      await adminApi.unenrollStudent(courseId, student.id);
      setSuccess(`Student ${student.full_name} removed from course.`);
      loadCourse();
    } catch (err) { setError(getErrorMessage(err, "Could not remove student.")); }
  };

  const handleDeleteCourse = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete course "${course.name}" (${course.code})? All enrollments and course data will be removed.`)) return;
    clear();
    try {
      await adminApi.deleteCourse(courseId);
      navigate("/admin/courses");
    } catch (err) { setError(getErrorMessage(err, "Could not delete course.")); }
  };

  if (loading) return (
    <Layout>
      <PageShell title="Loading…">
        <p style={{ ...T.bodyText, color: C.textMuted }}>Fetching course details…</p>
      </PageShell>
    </Layout>
  );
  if (!course) return (
    <Layout>
      <PageShell title="Not found">
        <p style={{ ...T.bodyText, color: C.dangerText }}>Course not found.</p>
      </PageShell>
    </Layout>
  );

  const hasTeacher = course.teachers?.length > 0;

  return (
    <Layout>
      <PageShell
        title={course.name}
        subtitle={course.code}
        action={
          <div style={{ display: "flex", gap: "10px" }}>
            <Btn variant="ghost" size="md" onClick={() => navigate("/admin/courses")}>
              <i className="ti ti-arrow-left" style={{ fontSize: "15px" }} />Back to courses
            </Btn>
            <Btn variant="danger" size="md" onClick={handleDeleteCourse}>
              <i className="ti ti-trash" style={{ fontSize: "15px" }} />Delete course
            </Btn>
          </div>
        }
      >
        <Alert variant="error">{error}</Alert>
        <Alert variant="success">{success}</Alert>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>

          {/* Teacher Management */}
          <Card>
            <CardHeader title="Course Teacher" count={course.teachers?.length ?? 0} />
            <div style={{ padding: "18px 20px" }}>
              {hasTeacher ? (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ background: C.warningBg, border: `1px solid ${C.warningBorder}`, borderRadius: "7px", padding: "10px 12px", fontSize: "12px", color: C.warningText, marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <i className="ti ti-info-circle" style={{ fontSize: "16px", flexShrink: 0 }} />
                    <span>A course can only have one assigned teacher. Remove the current teacher before assigning a new one.</span>
                  </div>
                  {course.teachers.map((teacher) => (
                    <div key={teacher.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: "7px", background: C.successBg, border: `1px solid ${C.successBorder}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: C.cardBg, border: `1px solid ${C.successBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: "14px", fontWeight: "700", color: C.successText }}>{teacher.full_name.charAt(0)}</span>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: "14px", fontWeight: "600", color: C.successText, margin: 0 }}>{teacher.full_name}</p>
                          <p style={{ ...T.caption, color: C.textMuted, margin: 0 }}>{teacher.email}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnassignTeacher(teacher)}
                        title="Remove teacher from course"
                        className="btn-interactive"
                        style={{
                          background: "transparent", border: `1px solid ${C.dangerBorder}`,
                          borderRadius: "6px", color: C.dangerText, padding: "5px 10px",
                          fontSize: "12px", fontWeight: "600", cursor: "pointer",
                          display: "inline-flex", alignItems: "center", gap: "4px"
                        }}
                      >
                        <i className="ti ti-user-x" style={{ fontSize: "14px" }} />
                        <span>Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleAssignTeacher}>
                  <Select label="Assign a teacher" value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)}>
                    <option value="">— Select teacher —</option>
                    {allTeachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>
                    ))}
                  </Select>
                  <Btn type="submit" size="md" style={{ width: "100%", justifyContent: "center", marginTop: "4px" }}>
                    <i className="ti ti-user-plus" style={{ fontSize: "15px" }} />Assign teacher
                  </Btn>
                </form>
              )}
            </div>
          </Card>

          {/* Student Management */}
          <Card>
            <CardHeader title="Enrolled students" count={enrolledStudents.length} />
            <div style={{ padding: "18px 20px" }}>
              <form onSubmit={handleEnrollStudent} style={{ marginBottom: "18px" }}>
                <Select label="Enroll a student" value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}>
                  <option value="">— Select student —</option>
                  {allStudents
                    .filter((s) => !enrolledStudents.some((es) => es.id === s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}{s.registration_number ? ` (${s.registration_number})` : ` (${s.email})`}
                      </option>
                    ))}
                </Select>
                <Btn type="submit" size="md" style={{ width: "100%", justifyContent: "center", marginTop: "4px" }}>
                  <i className="ti ti-user-plus" style={{ fontSize: "15px" }} />Enroll student
                </Btn>
              </form>

              {enrolledStudents.length === 0 ? (
                <p style={{ ...T.bodyText, color: C.textMuted, margin: 0, textAlign: "center", padding: "16px 0" }}>
                  No students currently enrolled in this course.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "320px", overflowY: "auto", paddingRight: "4px" }}>
                  {enrolledStudents.map((student) => (
                    <div key={student.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "6px", background: C.subtleBg, border: `1px solid ${C.border}` }}>
                      <div style={{ minWidth: 0, flex: 1, paddingRight: "10px" }}>
                        <p style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {student.full_name}
                        </p>
                        <p style={{ fontSize: "11px", color: C.textMuted, margin: 0 }}>
                          {student.registration_number ? `${student.registration_number} · ` : ""}{student.email}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnenrollStudent(student)}
                        title="Remove student from course"
                        className="btn-interactive"
                        style={{
                          background: "transparent", border: `1px solid ${C.dangerBorder}`,
                          borderRadius: "5px", color: C.dangerText, padding: "4px 8px",
                          fontSize: "11px", fontWeight: "600", cursor: "pointer",
                          display: "inline-flex", alignItems: "center", gap: "3px", flexShrink: 0
                        }}
                      >
                        <i className="ti ti-user-minus" style={{ fontSize: "13px" }} />
                        <span>Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {course.description && (
          <Card style={{ marginTop: "16px", padding: "18px 20px" }}>
            <p style={{ ...T.tableHeader, color: C.textMuted, margin: "0 0 8px" }}>Description</p>
            <p style={{ ...T.bodyText, color: C.textPrimary, margin: 0 }}>{course.description}</p>
          </Card>
        )}
      </PageShell>
    </Layout>
  );
}