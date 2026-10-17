// src/components/student/AssignmentsPanel.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import * as assignmentsApi from "../../api/assignments";
import * as badgesApi from "../../api/badges";
import BadgePill from "../BadgePill";
import { C } from "../../theme";

export default function StudentAssignmentsPanel({ courseId }) {
  const [assignments, setAssignments] = useState([]);
  const [submissionsByAssignment, setSubmissionsByAssignment] = useState({});
  const [grades, setGrades] = useState({});
  const [badgesByAssignment, setBadgesByAssignment] = useState({});
  const [uploadingId, setUploadingId] = useState(null);
  const [error, setError] = useState("");
  const [justSubmitted, setJustSubmitted] = useState({});
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState("all"); // "all" | "pending" | "submitted" | "graded"
  const pollRef = useRef(null);

  const isPastDeadline = (a) => a.due_date && new Date() > new Date(a.due_date);

  const refreshSubmissionStatus = useCallback(async (assignmentId, submissionId) => {
    try {
      const { data } = await assignmentsApi.getSubmissionStatus(submissionId);
      setSubmissionsByAssignment((prev) => ({ ...prev, [assignmentId]: data }));
      if (data.status === "teacher_reviewed") {
        const gradeRes = await assignmentsApi.getFinalGrade(submissionId);
        setGrades((prev) => ({ ...prev, [assignmentId]: gradeRes.data }));
      }
      return data.status;
    } catch { return null; }
  }, []);

  const handleDeleteSubmission = async (assignmentId, submissionId) => {
    if (!confirm("Delete your submission? You can resubmit before the deadline.")) return;
    try {
      await assignmentsApi.deleteMySubmission(submissionId);
      setSubmissionsByAssignment((prev) => { const u = { ...prev }; delete u[assignmentId]; return u; });
      setGrades((prev) => { const u = { ...prev }; delete u[assignmentId]; return u; });
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't delete submission.");
    }
  };

  const loadExistingData = useCallback(async (list) => {
    try {
      const { data: myBadges } = await badgesApi.getMyBadges();
      const badgeMap = {};
      for (const b of myBadges) {
        if (b.assignment_id) {
          if (!badgeMap[b.assignment_id]) badgeMap[b.assignment_id] = [];
          badgeMap[b.assignment_id].push(b);
        }
      }
      setBadgesByAssignment(badgeMap);
    } catch { /* ignore */ }

    for (const a of list) {
      try {
        const { data } = await assignmentsApi.getMySubmissionForAssignment(a.id);
        if (data) {
          setSubmissionsByAssignment((prev) => ({ ...prev, [a.id]: data }));
          if (data.status === "teacher_reviewed") {
            const gradeRes = await assignmentsApi.getFinalGrade(data.id);
            setGrades((prev) => ({ ...prev, [a.id]: gradeRes.data }));
          }
        }
      } catch { /* no submission yet */ }
    }
  }, []);

  useEffect(() => {
    assignmentsApi.listAssignments(courseId).then(({ data }) => {
      setAssignments(data);
      loadExistingData(data);
    });
  }, [courseId, loadExistingData]);

  const handleUpload = async (assignmentId, file) => {
    if (!file) return;
    if (!file.name.endsWith(".pdf")) { setError("Only PDF files are accepted."); return; }
    setError("");
    setUploadingId(assignmentId);
    try {
      const { data } = await assignmentsApi.submitAssignment(assignmentId, file);
      setSubmissionsByAssignment((prev) => ({ ...prev, [assignmentId]: data }));
      setJustSubmitted((prev) => ({ ...prev, [assignmentId]: true }));
      setTimeout(() => setJustSubmitted((prev) => ({ ...prev, [assignmentId]: false })), 4000);
      pollRef.current = setInterval(async () => {
        const status = await refreshSubmissionStatus(assignmentId, data.id);
        if (status === "teacher_reviewed" || status === "failed") clearInterval(pollRef.current);
      }, 4000);
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed.");
    } finally {
      setUploadingId(null);
    }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Filtered assignments logic
  const filteredAssignments = assignments.filter((a) => {
    const submission = submissionsByAssignment[a.id];
    const isGraded = submission?.status === "teacher_reviewed";
    const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterTab === "pending") return !submission && !isPastDeadline(a);
    if (filterTab === "submitted") return submission && !isGraded;
    if (filterTab === "graded") return isGraded;
    return true;
  });

  // KPI Quick Stats
  const totalCount = assignments.length;
  const pendingCount = assignments.filter((a) => !submissionsByAssignment[a.id] && !isPastDeadline(a)).length;
  const submittedCount = assignments.filter((a) => submissionsByAssignment[a.id] && submissionsByAssignment[a.id].status !== "teacher_reviewed").length;
  const gradedCount = assignments.filter((a) => submissionsByAssignment[a.id]?.status === "teacher_reviewed").length;

  const selectedAssignment = assignments.find((a) => a.id === selectedAssignmentId);

  if (assignments.length === 0) {
    return (
      <div style={{ background: C.cardBg, borderRadius: "10px", border: `1px solid ${C.border}`, padding: "56px 20px", textAlign: "center" }}>
        <i className="ti ti-clipboard-list" style={{ fontSize: "36px", color: C.border, display: "block", marginBottom: "12px" }} />
        <h4 style={{ fontSize: "16px", fontWeight: "600", color: C.textPrimary, margin: "0 0 6px" }}>No assignments posted yet</h4>
        <p style={{ fontSize: "13px", color: C.textMuted, margin: 0 }}>Assignments and projects posted by your instructor will appear here.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {error && (
        <div style={{ background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}`, borderRadius: "8px", padding: "12px 16px", fontSize: "14px", display: "flex", gap: "10px", alignItems: "center" }}>
          <i className="ti ti-alert-circle" style={{ fontSize: "18px", flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Quick KPI Summary Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
        <StatTile title="Total Assignments" count={totalCount} icon="ti-clipboard-list" color={C.textPrimary} bg={C.cardBg} />
        <StatTile title="Action Required" count={pendingCount} icon="ti-clock-exclamation" color={pendingCount > 0 ? C.warningText : C.textMuted} bg={pendingCount > 0 ? C.warningBg : C.cardBg} border={pendingCount > 0 ? C.warningBorder : C.border} />
        <StatTile title="Under AI Evaluation" count={submittedCount} icon="ti-sparkles" color={submittedCount > 0 ? C.infoText : C.textMuted} bg={submittedCount > 0 ? C.infoBg : C.cardBg} border={submittedCount > 0 ? C.infoBorder : C.border} />
        <StatTile title="Graded & Finalized" count={gradedCount} icon="ti-circle-check" color={gradedCount > 0 ? C.successText : C.textMuted} bg={gradedCount > 0 ? C.successBg : C.cardBg} border={gradedCount > 0 ? C.successBorder : C.border} />
      </div>

      {/* ── Search & Filter Tabs ── */}
      <div style={{ background: C.cardBg, borderRadius: "10px", border: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
        {/* Search Input */}
        <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
          <i className="ti ti-search" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "15px", color: C.textMuted }} />
          <input
            type="text"
            placeholder="Search assignments by title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              background: C.inputBg,
              border: `1px solid ${C.border}`,
              borderRadius: "7px",
              padding: "8px 12px 8px 34px",
              fontSize: "13px",
              color: C.textPrimary,
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Filter Pills */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[
            { id: "all", label: "All", count: totalCount },
            { id: "pending", label: "To Submit", count: pendingCount },
            { id: "submitted", label: "Evaluating", count: submittedCount },
            { id: "graded", label: "Graded", count: gradedCount },
          ].map((tab) => {
            const isActive = filterTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                className="btn-interactive"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  border: `1px solid ${isActive ? C.primary : C.border}`,
                  background: isActive ? C.primary : C.subtleBg,
                  color: isActive ? C.primaryText : C.textSecondary,
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s ease",
                }}
              >
                <span>{tab.label}</span>
                <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "10px", background: isActive ? "rgba(255,255,255,0.2)" : C.cardBg, color: isActive ? C.primaryText : C.textMuted }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Compact Assignment Cards ── */}
      {filteredAssignments.length === 0 ? (
        <div style={{ background: C.cardBg, borderRadius: "10px", border: `1px solid ${C.border}`, padding: "44px 20px", textAlign: "center" }}>
          <i className="ti ti-search" style={{ fontSize: "28px", color: C.border, display: "block", marginBottom: "10px" }} />
          <p style={{ fontSize: "14px", color: C.textMuted, margin: 0 }}>No assignments found matching the filter.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filteredAssignments.map((a) => {
            const submission = submissionsByAssignment[a.id];
            const grade = grades[a.id];
            const badges = badgesByAssignment[a.id] || [];
            const past = isPastDeadline(a);

            return (
              <ExecutiveCompactCard
                key={a.id}
                assignment={a}
                submission={submission}
                grade={grade}
                badges={badges}
                past={past}
                onOpenDetails={() => setSelectedAssignmentId(a.id)}
              />
            );
          })}
        </div>
      )}

      {/* ── Dedicated Student Assignment Details Modal ── */}
      {selectedAssignment && (
        <StudentAssignmentDetailsModal
          assignment={selectedAssignment}
          submission={submissionsByAssignment[selectedAssignment.id]}
          grade={grades[selectedAssignment.id]}
          badges={badgesByAssignment[selectedAssignment.id] || []}
          past={isPastDeadline(selectedAssignment)}
          justSubmitted={!!justSubmitted[selectedAssignment.id]}
          uploading={uploadingId === selectedAssignment.id}
          onUpload={(file) => handleUpload(selectedAssignment.id, file)}
          onDelete={() => handleDeleteSubmission(selectedAssignment.id, submissionsByAssignment[selectedAssignment.id]?.id)}
          onViewSubmission={() => assignmentsApi.viewSubmissionFile(submissionsByAssignment[selectedAssignment.id]?.id)}
          onDownloadSubmission={() => assignmentsApi.downloadSubmissionFile(submissionsByAssignment[selectedAssignment.id]?.id)}
          onClose={() => setSelectedAssignmentId(null)}
        />
      )}
    </div>
  );
}

// ─── Stat Tile Component ──────────────────────────────────────────────────
function StatTile({ title, count, icon, color, bg, border = C.border }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: "10px", padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
      <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: "18px", color }} />
      </div>
      <div>
        <span style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", display: "block" }}>
          {title}
        </span>
        <span style={{ fontSize: "20px", fontWeight: "800", color: C.textPrimary, letterSpacing: "-0.02em" }}>
          {count}
        </span>
      </div>
    </div>
  );
}

// ─── Executive Compact Assignment Card ────────────────────────────────────
function ExecutiveCompactCard({ assignment: a, submission, grade, badges, past, onOpenDetails }) {
  const [hovered, setHovered] = useState(false);

  const isGraded = submission?.status === "teacher_reviewed";
  const relativeTime = getRelativeDueDate(a.due_date);

  // Status-dependent accent border color
  const statusBorderColor = isGraded
    ? "#22C55E"
    : submission
    ? "#3B82F6"
    : past
    ? "#EF4444"
    : hovered
    ? C.accent
    : "transparent";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpenDetails}
      style={{
        background: C.cardBg,
        borderRadius: "10px",
        border: `1px solid ${hovered ? C.accent : C.border}`,
        borderLeft: `4px solid ${statusBorderColor}`,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        cursor: "pointer",
        transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.07)" : "0 1px 4px rgba(0,0,0,0.02)",
        transform: hovered ? "translateY(-1px)" : "none",
      }}
    >
      {/* Left Column: Title & Key Metadata */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
          <h4 style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, margin: 0, lineHeight: "1.3" }}>
            {a.title}
          </h4>
          {badges.map((b) => (
            <BadgePill key={b.id} badge={b} size="sm" />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", fontSize: "12px" }}>
          {/* Due date with relative badge */}
          {a.due_date && (
            <span style={{ fontWeight: "600", color: past ? C.dangerText : C.textSecondary, display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <i className={`ti ${past ? "ti-lock" : "ti-clock"}`} style={{ fontSize: "14px", color: past ? C.dangerText : C.warningText }} />
              <span>{past ? "Closed" : "Due"} {new Date(a.due_date).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              {relativeTime && (
                <span style={{ fontSize: "11px", fontWeight: "700", padding: "1px 7px", borderRadius: "10px", background: past ? C.dangerBg : C.subtleBg, color: past ? C.dangerText : C.textMuted }}>
                  {relativeTime}
                </span>
              )}
            </span>
          )}

          {/* Total Marks */}
          {a.total_marks > 0 && (
            <span style={{ color: C.textSecondary, display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <i className="ti ti-award" style={{ fontSize: "14px", color: C.accent }} />
              {a.total_marks} Marks
            </span>
          )}
        </div>
      </div>

      {/* Right Column: Status & Action CTA */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
        {/* Status Pill */}
        {submission ? (
          <SubmissionBadge status={submission.status} score={grade?.total_score} maxScore={a.total_marks} />
        ) : past ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: "700", padding: "4px 10px", borderRadius: "20px", background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}` }}>
            <i className="ti ti-lock" style={{ fontSize: "12px" }} />Closed
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: "600", padding: "4px 10px", borderRadius: "20px", background: C.warningBg, color: C.warningText, border: `1px solid ${C.warningBorder}` }}>
            <i className="ti ti-clock-exclamation" style={{ fontSize: "12px" }} />Pending
          </span>
        )}

        {/* View Details CTA Button */}
        <button
          onClick={(e) => { e.stopPropagation(); onOpenDetails(); }}
          className="btn-interactive"
          style={{
            fontSize: "13px",
            fontWeight: "600",
            color: hovered ? C.primaryText : C.textPrimary,
            background: hovered ? C.primary : C.subtleBg,
            border: `1px solid ${hovered ? C.primary : C.border}`,
            borderRadius: "7px",
            padding: "7px 14px",
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span>View Details</span>
          <i className="ti ti-arrow-right" style={{ fontSize: "13px", transform: hovered ? "translateX(2px)" : "none", transition: "transform 0.15s ease" }} />
        </button>
      </div>
    </div>
  );
}

// ─── Dedicated Student Assignment Details Modal ────────────────────────────
function StudentAssignmentDetailsModal({
  assignment: a,
  submission,
  grade,
  badges,
  past,
  justSubmitted,
  uploading,
  onUpload,
  onDelete,
  onViewSubmission,
  onDownloadSubmission,
  onClose,
}) {
  const [modalTab, setModalTab] = useState("overview"); // "overview" | "rubric" | "submission" | "evaluation"
  const [isDragOver, setIsDragOver] = useState(false);
  const [stagedFile, setStagedFile] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setStagedFile(file);
      onUpload(file);
    }
  };

  const isGraded = submission?.status === "teacher_reviewed";
  const relativeTime = getRelativeDueDate(a.due_date);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        width: "100vw", height: "100vh",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.68)",
        backdropFilter: "blur(5px)",
        padding: "16px",
        boxSizing: "border-box",
      }}
    >
      <div
        className="animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "720px",
          maxHeight: "90vh",
          background: C.cardBg,
          borderRadius: "14px",
          border: `1px solid ${C.border}`,
          boxShadow: "0 24px 56px rgba(0,0,0,0.32)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
            background: C.subtleBg,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: C.accentText, background: C.accentTint, padding: "2px 8px", borderRadius: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Assignment Details
              </span>
              {submission ? (
                <SubmissionBadge status={submission.status} score={grade?.total_score} maxScore={a.total_marks} />
              ) : past ? (
                <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "12px", background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}` }}>
                  Closed
                </span>
              ) : (
                <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "12px", background: C.warningBg, color: C.warningText, border: `1px solid ${C.warningBorder}` }}>
                  Pending Submission
                </span>
              )}
            </div>

            <h3 style={{ margin: "4px 0", fontSize: "18px", fontWeight: "700", color: C.textPrimary }}>
              {a.title}
            </h3>

            {badges.length > 0 && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                {badges.map((b) => (
                  <BadgePill key={b.id} badge={b} size="sm" />
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: C.textMuted,
              fontSize: "20px",
              display: "flex",
              alignItems: "center",
              padding: "4px",
              borderRadius: "4px",
            }}
          >
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Modal Segmented Navigation Bar */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "0 24px", background: C.cardBg, gap: "8px", overflowX: "auto" }}>
          {[
            { id: "overview", label: "Overview & Instructions", icon: "ti-file-text" },
            { id: "rubric", label: `Rubric (${a.criteria?.length || 0})`, icon: "ti-clipboard-check" },
            { id: "submission", label: "My Submission", icon: "ti-file-upload" },
            ...(grade ? [{ id: "evaluation", label: "AI Evaluation & Grade", icon: "ti-sparkles" }] : []),
          ].map((tab) => {
            const isActive = modalTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setModalTab(tab.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "12px 14px",
                  background: "transparent",
                  border: "none",
                  borderBottom: isActive ? `2.5px solid ${C.accent}` : "2.5px solid transparent",
                  color: isActive ? C.textPrimary : C.textMuted,
                  fontSize: "13px",
                  fontWeight: isActive ? "700" : "500",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                }}
              >
                <i className={`ti ${tab.icon}`} style={{ color: isActive ? C.accent : C.textMuted }} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ padding: "24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* ── Key Highlight Tiles ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
            <div style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px 14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>
                Deadline
              </span>
              <p style={{ fontSize: "13px", fontWeight: "600", color: past ? C.dangerText : C.textPrimary, margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                <i className={`ti ${past ? "ti-lock" : "ti-clock"}`} style={{ color: past ? C.dangerText : C.warningText }} />
                <span>{a.due_date ? new Date(a.due_date).toLocaleString() : "No deadline"}</span>
              </p>
              {relativeTime && (
                <span style={{ fontSize: "11px", color: past ? C.dangerText : C.textMuted, fontWeight: "500", marginTop: "2px", display: "block" }}>
                  {relativeTime}
                </span>
              )}
            </div>

            <div style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px 14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>
                Total Marks
              </span>
              <p style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary, margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                <i className="ti ti-award" style={{ color: C.accent }} />
                <span>{a.total_marks || (a.criteria?.reduce((sum, c) => sum + (Number(c.max_marks) || 0), 0))} Marks Total</span>
              </p>
            </div>

            <div style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px 14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>
                Your Status
              </span>
              <p style={{ fontSize: "13px", fontWeight: "600", color: isGraded ? C.successText : submission ? C.infoText : C.textMuted, margin: 0, textTransform: "capitalize", display: "flex", alignItems: "center", gap: "6px" }}>
                <i className={`ti ${isGraded ? "ti-circle-check" : submission ? "ti-loader" : "ti-circle"}`} />
                <span>{isGraded ? `Graded (${grade.total_score}/${a.total_marks})` : submission ? submission.status.replace("_", " ") : "Not Submitted"}</span>
              </p>
            </div>
          </div>

          {/* ── Tab: Overview & Instructions ── */}
          {modalTab === "overview" && (
            <div className="animate-fade-in">
              <h4 style={{ fontSize: "13px", fontWeight: "700", color: C.textPrimary, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px", display: "flex", alignItems: "center", gap: "6px" }}>
                <i className="ti ti-align-left" style={{ color: C.accent }} />
                Description & Student Instructions
              </h4>
              <div style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px 18px" }}>
                {a.description ? (
                  <p style={{ fontSize: "14px", color: C.textSecondary, lineHeight: "1.65", margin: 0, whiteSpace: "pre-wrap" }}>
                    {a.description}
                  </p>
                ) : (
                  <p style={{ fontSize: "13px", color: C.textMuted, fontStyle: "italic", margin: 0 }}>
                    No specific instructions were provided for this assignment.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: Rubric & Criteria ── */}
          {modalTab === "rubric" && (
            <div className="animate-fade-in">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <h4 style={{ fontSize: "13px", fontWeight: "700", color: C.textPrimary, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                  <i className="ti ti-clipboard-check" style={{ color: C.accent }} />
                  Marking Scheme & Criteria Breakdown
                </h4>
                <span style={{ fontSize: "12px", fontWeight: "600", color: C.textMuted }}>
                  Total: {a.total_marks} marks
                </span>
              </div>

              {a.criteria?.length > 0 ? (
                <div style={{ border: `1px solid ${C.border}`, borderRadius: "10px", overflow: "hidden" }}>
                  {a.criteria.map((c, i) => (
                    <div
                      key={c.id || i}
                      style={{
                        padding: "14px 18px",
                        borderBottom: i < a.criteria.length - 1 ? `1px solid ${C.border}` : "none",
                        background: i % 2 === 0 ? C.cardBg : C.subtleBg,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "14px",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                          <span style={{ fontSize: "11px", fontWeight: "700", color: C.accentText, background: C.accentTint, padding: "1px 6px", borderRadius: "4px" }}>
                            #{i + 1}
                          </span>
                          <span style={{ fontSize: "14px", fontWeight: "600", color: C.textPrimary }}>
                            {c.label}
                          </span>
                        </div>
                        {c.description && (
                          <p style={{ fontSize: "13px", color: C.textSecondary, margin: "4px 0 0", lineHeight: "1.45" }}>
                            {c.description}
                          </p>
                        )}
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: C.infoText, background: C.infoBg, border: `1px solid ${C.infoBorder}`, padding: "4px 10px", borderRadius: "16px", whiteSpace: "nowrap" }}>
                        {c.max_marks} marks
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: "13px", color: C.textMuted, fontStyle: "italic", margin: 0 }}>
                  No rubric criteria defined.
                </p>
              )}
            </div>
          )}

          {/* ── Tab: Submission ── */}
          {modalTab === "submission" && (
            <div className="animate-fade-in">
              <h4 style={{ fontSize: "13px", fontWeight: "700", color: C.textPrimary, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px", display: "flex", alignItems: "center", gap: "6px" }}>
                <i className="ti ti-file-upload" style={{ color: C.accent }} />
                Submission Management
              </h4>

              {justSubmitted && (
                <div style={{ background: C.successBg, color: C.successText, border: `1px solid ${C.successBorder}`, borderRadius: "8px", padding: "12px 16px", marginBottom: "14px", fontSize: "13px", display: "flex", gap: "8px", alignItems: "center" }}>
                  <i className="ti ti-circle-check" style={{ fontSize: "18px", flexShrink: 0 }} />
                  <span>Your PDF has been submitted successfully. The automated evaluation pipeline is running.</span>
                </div>
              )}

              {submission ? (
                <div style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "14px", marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: C.accentTint, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <i className="ti ti-file-type-pdf" style={{ fontSize: "24px", color: C.accent }} />
                      </div>
                      <div>
                        <p style={{ fontSize: "14px", fontWeight: "600", color: C.textPrimary, margin: 0 }}>
                          Submitted Solution PDF
                        </p>
                        {submission.submitted_at && (
                          <p style={{ fontSize: "12px", color: C.textMuted, margin: "2px 0 0" }}>
                            Submitted on {new Date(submission.submitted_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        onClick={onViewSubmission}
                        className="btn-interactive"
                        style={{
                          fontSize: "13px", fontWeight: "600", color: C.infoText, background: C.infoBg,
                          border: `1px solid ${C.infoBorder}`, borderRadius: "7px", padding: "7px 14px",
                          cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "6px"
                        }}
                      >
                        <i className="ti ti-eye" style={{ fontSize: "15px" }} />
                        Preview PDF
                      </button>
                      <button
                        onClick={onDownloadSubmission}
                        className="btn-interactive"
                        style={{
                          fontSize: "13px", fontWeight: "600", color: C.textSecondary, background: C.cardBg,
                          border: `1px solid ${C.border}`, borderRadius: "7px", padding: "7px 14px",
                          cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "6px"
                        }}
                      >
                        <i className="ti ti-download" style={{ fontSize: "15px" }} />
                        Download
                      </button>
                    </div>
                  </div>

                  {past || isGraded ? (
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "12px" }}>
                      <p style={{ fontSize: "12px", color: C.textMuted, margin: 0, display: "flex", gap: "6px", alignItems: "center" }}>
                        <i className="ti ti-lock" style={{ fontSize: "14px" }} />
                        {isGraded
                          ? "This submission has been officially graded and is permanently locked."
                          : "The assignment deadline has passed. Modifications are closed."}
                      </p>
                    </div>
                  ) : (
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                      <span style={{ fontSize: "12px", color: C.textMuted }}>You may replace your submission anytime before deadline.</span>
                      <button
                        onClick={onDelete}
                        className="btn-interactive"
                        style={{
                          fontSize: "12px", fontWeight: "600", color: C.dangerText, background: C.dangerBg,
                          border: `1px solid ${C.dangerBorder}`, borderRadius: "6px", padding: "6px 12px",
                          cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "5px"
                        }}
                      >
                        <i className="ti ti-trash" style={{ fontSize: "14px" }} />
                        Delete & Upload New
                      </button>
                    </div>
                  )}
                </div>
              ) : past ? (
                <div style={{ background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}`, borderRadius: "10px", padding: "16px 18px", fontSize: "13px", display: "flex", gap: "10px", alignItems: "center" }}>
                  <i className="ti ti-lock" style={{ fontSize: "18px", flexShrink: 0 }} />
                  <span>The deadline for this assignment has passed. New submissions are closed.</span>
                </div>
              ) : (
                /* Drag and Drop Zone */
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  style={{
                    background: isDragOver ? C.accentTint : C.subtleBg,
                    border: `2px dashed ${isDragOver ? C.accent : C.border}`,
                    borderRadius: "10px",
                    padding: "32px 20px",
                    textAlign: "center",
                    transition: "all 0.15s ease",
                  }}
                >
                  <i className="ti ti-cloud-upload" style={{ fontSize: "38px", color: isDragOver ? C.accent : C.textMuted, display: "block", marginBottom: "10px" }} />
                  <p style={{ fontSize: "15px", fontWeight: "700", color: C.textPrimary, margin: "0 0 6px" }}>
                    Drag & drop your PDF file here
                  </p>
                  <p style={{ fontSize: "12px", color: C.textMuted, margin: "0 0 18px" }}>
                    Accepted format: PDF only. Maximum file size: 25MB.
                  </p>

                  <label
                    className="btn-interactive"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 22px",
                      borderRadius: "8px",
                      background: uploading ? C.textMuted : C.primary,
                      color: C.primaryText,
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: uploading ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                    }}
                  >
                    <i className={`ti ${uploading ? "ti-loader-2" : "ti-upload"}`} style={{ fontSize: "16px", animation: uploading ? "spin 1s linear infinite" : "none" }} />
                    <span>{uploading ? "Uploading Document…" : "Browse & Upload PDF"}</span>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => onUpload(e.target.files[0])}
                      disabled={uploading}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: AI Evaluation & Grade ── */}
          {modalTab === "evaluation" && grade && (
            <div className="animate-fade-in">
              <h4 style={{ fontSize: "13px", fontWeight: "700", color: C.textPrimary, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px", display: "flex", alignItems: "center", gap: "6px" }}>
                <i className="ti ti-star" style={{ color: C.accent }} />
                Official Evaluation & Comprehensive AI Report
              </h4>
              <GradeDisplay grade={grade} />
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: C.subtleBg,
          }}
        >
          <span style={{ fontSize: "12px", color: C.textMuted }}>
            {a.due_date ? `Deadline: ${new Date(a.due_date).toLocaleDateString()}` : "No deadline"}
          </span>

          <button
            onClick={onClose}
            className="btn-interactive"
            style={{
              padding: "8px 20px",
              borderRadius: "7px",
              border: `1px solid ${C.border}`,
              background: C.cardBg,
              color: C.textPrimary,
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Status Badge Component ───────────────────────────────────────────────
function SubmissionBadge({ status, score, maxScore }) {
  const map = {
    processing:       { bg: C.warningBg,  txt: C.warningText,  border: C.warningBorder, icon: "ti-loader-2",     label: "Processing"  },
    extracted:        { bg: C.infoBg,     txt: C.infoText,     border: C.infoBorder,    icon: "ti-file-text",    label: "Extracted"   },
    ai_evaluated:     { bg: C.infoBg,     txt: C.infoText,     border: C.infoBorder,    icon: "ti-sparkles",     label: "Evaluating"  },
    teacher_reviewed: { bg: C.successBg,  txt: C.successText,  border: C.successBorder, icon: "ti-circle-check", label: score !== undefined ? `Graded · ${score}${maxScore ? `/${maxScore}` : ""}` : "Graded" },
    failed:           { bg: C.dangerBg,   txt: C.dangerText,   border: C.dangerBorder,  icon: "ti-alert-circle", label: "Failed"      },
  }[status] || { bg: C.subtleBg, txt: C.textMuted, border: C.border, icon: "ti-circle", label: status };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        fontWeight: "700",
        padding: "4px 9px",
        borderRadius: "20px",
        background: map.bg,
        color: map.txt,
        border: `1px solid ${map.border}`,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <i className={`ti ${map.icon}`} style={{ fontSize: "11px" }} />
      {map.label}
    </span>
  );
}

// ─── Rich Grade Display Component ─────────────────────────────────────────
function GradeDisplay({ grade }) {
  let feedback = null;
  try {
    feedback = typeof grade.ai_feedback === "string" ? JSON.parse(grade.ai_feedback) : grade.ai_feedback;
  } catch { /* plain text feedback */ }

  return (
    <div style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "18px", display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Score Header Card */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: "14px", fontWeight: "700", color: C.textPrimary, display: "block" }}>Final Score Awarded</span>
          <span style={{ fontSize: "12px", color: C.textMuted }}>Evaluation completed and verified</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
          <span style={{ fontSize: "32px", fontWeight: "800", letterSpacing: "-0.03em", color: C.primary }}>
            {grade.total_score}
          </span>
          <span style={{ fontSize: "14px", color: C.textMuted, fontWeight: "600" }}>pts</span>
        </div>
      </div>

      {/* Criteria Breakdown */}
      {feedback?.criteria_feedback?.length > 0 && (
        <div>
          <h5 style={{ fontSize: "12px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>
            Criteria Score Breakdown
          </h5>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {feedback.criteria_feedback.map((cf, i) => (
              <div key={i} style={{ borderRadius: "8px", border: `1px solid ${C.border}`, background: C.cardBg, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: C.subtleBg, borderBottom: (cf.what_was_good || cf.what_was_missing) ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary }}>{cf.label}</span>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: C.infoText, background: C.infoBg, padding: "2px 8px", borderRadius: "20px", border: `1px solid ${C.infoBorder}` }}>
                    {cf.score} / {cf.max_score}
                  </span>
                </div>
                {(cf.what_was_good || cf.what_was_missing) && (
                  <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {cf.what_was_good && (
                      <p style={{ fontSize: "12px", color: C.successText, margin: 0, display: "flex", gap: "6px" }}>
                        <i className="ti ti-check" style={{ flexShrink: 0, marginTop: "1px" }} />
                        <span>{cf.what_was_good}</span>
                      </p>
                    )}
                    {cf.what_was_missing && (
                      <p style={{ fontSize: "12px", color: C.dangerText, margin: 0, display: "flex", gap: "6px" }}>
                        <i className="ti ti-x" style={{ flexShrink: 0, marginTop: "1px" }} />
                        <span>{cf.what_was_missing}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths */}
      {feedback?.strengths?.length > 0 && (
        <div style={{ background: C.successBg, border: `1px solid ${C.successBorder}`, borderRadius: "8px", padding: "12px 14px" }}>
          <p style={{ fontSize: "11px", fontWeight: "700", color: C.successText, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px", display: "flex", alignItems: "center", gap: "5px" }}>
            <i className="ti ti-thumb-up" />Key Strengths
          </p>
          {feedback.strengths.map((s, i) => (
            <p key={i} style={{ fontSize: "12px", color: C.successText, margin: "0 0 3px", display: "flex", gap: "6px" }}>
              <i className="ti ti-point-filled" style={{ fontSize: "10px", flexShrink: 0, marginTop: "3px" }} />
              <span>{s}</span>
            </p>
          ))}
        </div>
      )}

      {/* Weaknesses */}
      {feedback?.weaknesses?.length > 0 && (
        <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: "8px", padding: "12px 14px" }}>
          <p style={{ fontSize: "11px", fontWeight: "700", color: C.dangerText, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px", display: "flex", alignItems: "center", gap: "5px" }}>
            <i className="ti ti-alert-triangle" />Areas for Improvement
          </p>
          {feedback.weaknesses.map((w, i) => (
            <p key={i} style={{ fontSize: "12px", color: C.dangerText, margin: "0 0 3px", display: "flex", gap: "6px" }}>
              <i className="ti ti-point-filled" style={{ fontSize: "10px", flexShrink: 0, marginTop: "3px" }} />
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {feedback?.improvements?.length > 0 && (
        <div style={{ background: C.infoBg, border: `1px solid ${C.infoBorder}`, borderRadius: "8px", padding: "12px 14px" }}>
          <p style={{ fontSize: "11px", fontWeight: "700", color: C.infoText, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px", display: "flex", alignItems: "center", gap: "5px" }}>
            <i className="ti ti-bulb" />Suggestions & Next Steps
          </p>
          {feedback.improvements.map((imp, i) => (
            <p key={i} style={{ fontSize: "12px", color: C.infoText, margin: "0 0 3px", display: "flex", gap: "6px" }}>
              <i className="ti ti-arrow-right" style={{ fontSize: "12px", flexShrink: 0, marginTop: "1px" }} />
              <span>{imp}</span>
            </p>
          ))}
        </div>
      )}

      {/* AI Summary */}
      {feedback?.summary && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px 14px" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>
            AI Evaluator Summary
          </span>
          <p style={{ fontSize: "13px", color: C.textSecondary, margin: 0, lineHeight: "1.5" }}>
            {feedback.summary}
          </p>
        </div>
      )}

      {/* Teacher Comments */}
      {grade.teacher_comments && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "14px" }}>
          <p style={{ fontSize: "12px", fontWeight: "700", color: C.textPrimary, margin: "0 0 6px", display: "flex", alignItems: "center", gap: "6px" }}>
            <i className="ti ti-message" style={{ fontSize: "14px", color: C.accent }} />
            Instructor Comments
          </p>
          <p style={{ fontSize: "13px", color: C.textSecondary, margin: 0, lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
            {grade.teacher_comments}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Relative Due Date Formatter Helper ────────────────────────────────────
function getRelativeDueDate(dueDateStr) {
  if (!dueDateStr) return null;
  const now = new Date();
  const due = new Date(dueDateStr);
  const diffMs = due - now;
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    const pastDays = Math.abs(diffDays);
    if (pastDays === 0) return "Closed today";
    if (pastDays === 1) return "Closed yesterday";
    return `Closed ${pastDays}d ago`;
  }
  if (diffHours <= 1) return "Due in <1h";
  if (diffHours < 24) return `Due in ${diffHours}h`;
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays <= 7) return `Due in ${diffDays}d`;
  return `Due in ${diffDays}d`;
}