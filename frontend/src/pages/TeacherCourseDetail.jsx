// src/pages/TeacherCourseDetail.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Layout, { PageShell, Card, CardHeader, Btn, Alert } from "../components/Layout";
import AssignmentsPanel from "../components/teacher/AssignmentsPanel";
import AttendancePanel from "../components/teacher/AttendancePanel";
import AnalyticsPanel from "../components/teacher/AnalyticsPanel";
import * as documentsApi from "../api/documents";
import * as coursesApi from "../api/courses";
import { getErrorMessage } from "../utils/errorMessage";
import { C, T } from "../theme";

export default function TeacherCourseDetail() {
  const { courseId }  = useParams();
  const navigate      = useNavigate();
  const location      = useLocation();

  // Active tab driven by URL ?tab= param — sidebar nav sets this
  const searchParams = new URLSearchParams(location.search);
  const activeTab    = searchParams.get("tab") || "materials";

  const [course,    setCourse]    = useState(null);
  const [documents, setDocuments] = useState([]);
  const [roster,    setRoster]    = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState("");
  const pollRef = useRef(null);

  const loadDocuments = useCallback(async () => {
    const { data } = await documentsApi.listDocuments(courseId);
    setDocuments(data);
    return data;
  }, [courseId]);

  const loadRoster = useCallback(async () => {
    const { data } = await coursesApi.listRoster(courseId);
    setRoster(data);
  }, [courseId]);

  useEffect(() => {
    coursesApi.getCourse(courseId).then(({ data }) => setCourse(data));
    loadDocuments();
    loadRoster();
  }, [courseId, loadDocuments, loadRoster]);

  // Poll while any doc is processing
  useEffect(() => {
    const hasPending = documents.some((d) => d.status === "processing");
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const updated = await loadDocuments();
        if (!updated.some((d) => d.status === "processing")) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 3000);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [documents, loadDocuments]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith(".pdf")) { setError("Only PDF files are accepted."); return; }
    setError("");
    setUploading(true);
    try {
      await documentsApi.uploadDocument(courseId, file);
      await loadDocuments();
    } catch (err) {
      setError(getErrorMessage(err, "Upload failed."));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (documentId) => {
    if (!confirm("Delete this document? This removes it from the chatbot's knowledge too.")) return;
    try {
      await documentsApi.deleteDocument(courseId, documentId);
      await loadDocuments();
    } catch {
      setError("Couldn't delete this document.");
    }
  };

  const handleView = async (docId) => {
    try { await documentsApi.viewDocument(courseId, docId); }
    catch { setError("Couldn't open this document."); }
  };

  const handleDownload = async (docId, filename) => {
    try { await documentsApi.downloadDocument(courseId, docId, filename); }
    catch { setError("Couldn't download this document."); }
  };

  if (!course) return (
    <Layout>
      <PageShell title="Loading…">
        <p style={{ color: C.textMuted, fontSize: "14px" }}>Fetching course details…</p>
      </PageShell>
    </Layout>
  );

  // Tab label for the page title
  const tabLabel = { materials: "Lectures", assignments: "Assignments", students: "Students", attendance: "Attendance", analytics: "Analytics" }[activeTab] || "Lectures";

  return (
    <Layout>
      <PageShell
        title={tabLabel}
        subtitle={`${course.name} · ${course.code}`}
      >
        {/* Course description — only on materials tab */}
        {activeTab === "materials" && course.description && (
          <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "14px 18px", marginBottom: "24px" }}>
            <p style={{ fontSize: "14px", color: C.textSecondary, lineHeight: "1.6", margin: 0 }}>{course.description}</p>
          </div>
        )}

        <Alert variant="error">{error}</Alert>

        {/* ── Materials tab ── */}
        {activeTab === "materials" && (
          <Card>
            <CardHeader
              title="Lecture Materials"
              count={documents.length}
              action={
                <label className="btn-interactive" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "6px", background: uploading ? C.textMuted : C.primary, color: C.primaryText, fontSize: "13px", fontWeight: "600", cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  <i className={`ti ${uploading ? "ti-loader-2" : "ti-upload"}`} style={{ fontSize: "14px", animation: uploading ? "spin 1s linear infinite" : "none" }} />
                  {uploading ? "Uploading…" : "Upload PDF"}
                  <input type="file" accept=".pdf" onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
                </label>
              }
            />
            <div style={{ padding: "4px 0" }}>
              {documents.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center" }}>
                  <i className="ti ti-file-upload" style={{ fontSize: "30px", color: C.border, display: "block", marginBottom: "10px" }} />
                  <p style={{ fontSize: "14px", color: C.textMuted }}>No materials uploaded yet. Upload a PDF to get started.</p>
                </div>
              ) : (
                documents.map((doc, i) => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    last={i === documents.length - 1}
                    onView={() => handleView(doc.id)}
                    onDownload={() => handleDownload(doc.id, doc.filename)}
                    onDelete={() => handleDelete(doc.id)}
                  />
                ))
              )}
            </div>
          </Card>
        )}

        {/* ── Assignments tab ── */}
        {activeTab === "assignments" && (
          <AssignmentsPanel courseId={courseId} />
        )}

        {/* ── Students tab ── */}
        {activeTab === "students" && (
          <Card>
            <CardHeader title="Enrolled students" count={roster.length} />
            <div style={{ padding: "8px 0" }}>
              {roster.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center" }}>
                  <i className="ti ti-users" style={{ fontSize: "30px", color: C.border, display: "block", marginBottom: "10px" }} />
                  <p style={{ fontSize: "14px", color: C.textMuted }}>No students enrolled yet. Contact an admin to enroll students.</p>
                </div>
              ) : (
                roster.map((student, i) => (
                  <div
                    key={student.id}
                    style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 18px", borderBottom: i < roster.length - 1 ? `1px solid ${C.border}` : "none" }}
                  >
                    <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: C.infoBg, border: `1px solid ${C.infoBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: C.infoText }}>
                        {student.full_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: "14px", fontWeight: "500", color: C.textPrimary, margin: 0 }}>{student.full_name}</p>
                      <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>{student.email}</p>
                    </div>
                    {student.registration_number && (
                      <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: "600", color: C.textMuted, background: C.subtleBg, border: `1px solid ${C.border}`, padding: "3px 8px", borderRadius: "5px", fontFamily: "monospace" }}>
                        {student.registration_number}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* ── Attendance tab ── */}
        {activeTab === "attendance" && (
          <AttendancePanel courseId={courseId} />
        )}

        {/* ── Analytics tab ── */}
        {activeTab === "analytics" && (
          <AnalyticsPanel courseId={courseId} />
        )}
      </PageShell>
    </Layout>
  );
}

function DocRow({ doc, last, onView, onDownload, onDelete }) {
  const [hovered, setHovered] = useState(false);

  const statusConfig = {
    indexed:    { bg: C.successBg,  txt: C.successText,  border: C.successBorder, label: `${doc.chunk_count} chunks indexed` },
    processing: { bg: C.warningBg,  txt: C.warningText,  border: C.warningBorder, label: "Processing…"                       },
    failed:     { bg: C.dangerBg,   txt: C.dangerText,   border: C.dangerBorder,  label: doc.error_message || "Failed"        },
  }[doc.status] || { bg: C.subtleBg, txt: C.textMuted, border: C.border, label: doc.status };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "14px 20px",
        borderBottom: last ? "none" : `1px solid ${C.border}`,
        background: hovered ? C.subtleBg : C.cardBg,
        transition: "background 0.12s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: C.accentTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-file-type-pdf" style={{ fontSize: "20px", color: C.accent }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: "14px", fontWeight: "600", color: C.textPrimary, margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.filename}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "12px", background: statusConfig.bg, color: statusConfig.txt, border: `1px solid ${statusConfig.border}` }}>
              {statusConfig.label}
            </span>
            {doc.created_at && (
              <span style={{ fontSize: "12px", color: C.textMuted }}>
                Added {new Date(doc.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        {doc.status === "indexed" && (
          <>
            <button
              onClick={onView}
              title="View PDF lecture"
              className="btn-interactive"
              style={{
                fontSize: "13px",
                fontWeight: "500",
                color: C.textPrimary,
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: "6px",
                padding: "6px 12px",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                whiteSpace: "nowrap",
              }}
            >
              <i className="ti ti-eye" style={{ fontSize: "14px" }} />
              View
            </button>

            <button
              onClick={onDownload}
              title="Download PDF lecture"
              className="btn-interactive"
              style={{
                fontSize: "13px",
                fontWeight: "500",
                color: C.textSecondary,
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: "6px",
                padding: "6px 12px",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                whiteSpace: "nowrap",
              }}
            >
              <i className="ti ti-download" style={{ fontSize: "14px" }} />
              Download
            </button>
          </>
        )}

        <button
          onClick={onDelete}
          title="Delete lecture document"
          style={{
            fontSize: "12px",
            color: C.dangerText,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "6px",
            borderRadius: "4px",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <i className="ti ti-trash" style={{ fontSize: "15px" }} />
        </button>
      </div>
    </div>
  );
}