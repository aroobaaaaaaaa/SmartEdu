// src/components/teacher/AssignmentsPanel.jsx
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, Btn, Alert } from "../Layout";
import * as assignmentsApi from "../../api/assignments";
import { getErrorMessage } from "../../utils/errorMessage";
import { C, T } from "../../theme";

export default function AssignmentsPanel({ courseId }) {
  const navigate    = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [showForm,    setShowForm]    = useState(false);
  const [error,       setError]       = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab]     = useState("all"); // "all" | "active" | "closed"
  const [copiedId, setCopiedId]       = useState(null);
  const [form, setForm] = useState({
    title: "", description: "", due_date: "",
    criteria: [{ label: "", max_marks: 5, description: "" }],
  });

  const isPastDeadline = (a) => a.due_date && new Date() > new Date(a.due_date);

  const loadAll = useCallback(async () => {
    try {
      const { data } = await assignmentsApi.listAssignments(courseId);
      setAssignments(data);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load assignments."));
    }
  }, [courseId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const addCriterion = () =>
    setForm({ ...form, criteria: [...form.criteria, { label: "", max_marks: 5, description: "" }] });

  const updateCriterion = (index, field, value) => {
    const updated = [...form.criteria];
    updated[index][field] = value;
    setForm({ ...form, criteria: updated });
  };

  const removeCriterion = (index) => {
    if (form.criteria.length === 1) return;
    setForm({ ...form, criteria: form.criteria.filter((_, i) => i !== index) });
  };

  const totalMarks = form.criteria.reduce((sum, c) => sum + (Number(c.max_marks) || 0), 0);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    const empty = form.criteria.filter((c) => !c.label.trim());
    if (empty.length > 0) { setError("All rubric criteria must have a label."); return; }
    try {
      await assignmentsApi.createAssignment(courseId, {
        title: form.title,
        description: form.description,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        criteria: form.criteria.map((c) => ({
          label: c.label.trim(),
          max_marks: Number(c.max_marks),
          description: c.description || null,
        })),
      });
      setForm({ title: "", description: "", due_date: "", criteria: [{ label: "", max_marks: 5, description: "" }] });
      setShowForm(false);
      loadAll();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't create assignment."));
    }
  };

  const handleDelete = async (assignmentId) => {
    if (!confirm("Delete this assignment and all its submissions?")) return;
    try {
      await assignmentsApi.deleteAssignment(assignmentId);
      if (selectedAssignment?.id === assignmentId) setSelectedAssignment(null);
      loadAll();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete assignment."));
    }
  };

  // Filtered assignments
  const filteredAssignments = assignments.filter((a) => {
    const isClosed = isPastDeadline(a);
    const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterTab === "active") return !isClosed;
    if (filterTab === "closed") return isClosed;
    return true;
  });

  // KPI Quick Stats for Teacher
  const totalCount = assignments.length;
  const activeCount = assignments.filter((a) => !isPastDeadline(a)).length;
  const closedCount = assignments.filter((a) => isPastDeadline(a)).length;
  const totalCourseMarks = assignments.reduce((acc, a) => acc + (a.total_marks || (a.criteria?.reduce((s, c) => s + (Number(c.max_marks) || 0), 0) || 0)), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Alert variant="error">{error}</Alert>

      {/* ── Teacher KPI Summary Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
        <TeacherStatTile title="Total Assignments" count={totalCount} icon="ti-clipboard-list" color={C.textPrimary} bg={C.cardBg} />
        <TeacherStatTile title="Active / Open" count={activeCount} icon="ti-clock-play" color={activeCount > 0 ? C.successText : C.textMuted} bg={activeCount > 0 ? C.successBg : C.cardBg} border={activeCount > 0 ? C.successBorder : C.border} />
        <TeacherStatTile title="Closed / Due Passed" count={closedCount} icon="ti-lock" color={closedCount > 0 ? C.dangerText : C.textMuted} bg={closedCount > 0 ? C.dangerBg : C.cardBg} border={closedCount > 0 ? C.dangerBorder : C.border} />
        <TeacherStatTile title="Total Rubric Marks" count={`${totalCourseMarks} pts`} icon="ti-award" color={C.accent} bg={C.accentTint} border={C.dangerBorder} />
      </div>

      <Card>
        <CardHeader
          title="Assignments Management"
          count={assignments.length}
          action={
            <Btn size="sm" onClick={() => { setShowForm(!showForm); setError(""); }}>
              <i className={`ti ${showForm ? "ti-x" : "ti-plus"}`} style={{ fontSize: "14px" }} />
              {showForm ? "Cancel" : "Create New Assignment"}
            </Btn>
          }
        />

        {/* ── Create form ── */}
        {showForm && (
          <div style={{ padding: "22px 20px", borderBottom: `1px solid ${C.border}`, background: C.subtleBg }}>
            <form onSubmit={handleCreate} style={{ background: C.cardBg, padding: "20px", borderRadius: "10px", border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <p style={{ ...T.sectionHeading, color: C.textPrimary, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                  <i className="ti ti-plus" style={{ color: C.accent }} />
                  Create New Assignment
                </p>
                <span style={{ fontSize: "12px", color: C.textMuted }}>Configured with inline rubric builder</span>
              </div>

              {/* Title */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", ...T.formLabel, color: C.textSecondary, marginBottom: "6px" }}>
                  Assignment Title <span style={{ color: C.accent }}>*</span>
                </label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Midterm Case Study & Research Paper"
                  style={inputStyle}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", ...T.formLabel, color: C.textSecondary, marginBottom: "6px" }}>
                  Description & Student Instructions
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Provide clear guidelines, problem statement, and requirements for students…"
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              {/* Due date */}
              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", ...T.formLabel, color: C.textSecondary, marginBottom: "6px" }}>
                  Due Date & Deadline <span style={{ ...T.caption, color: C.textMuted }}>(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  style={inputStyle}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              {/* Rubric builder */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div>
                    <label style={{ ...T.formLabel, color: C.textSecondary, display: "block" }}>Evaluation Rubric Criteria</label>
                    <span style={{ fontSize: "11px", color: C.textMuted }}>Used by AI evaluator and for final grading</span>
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: C.accentText, background: C.accentTint, padding: "3px 10px", borderRadius: "20px", border: `1px solid ${C.dangerBorder}` }}>
                    Total: {totalMarks} Marks
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {form.criteria.map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", background: C.subtleBg, borderRadius: "8px", padding: "10px 12px", border: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, width: "20px" }}>#{i + 1}</span>
                      <input
                        required
                        placeholder={`Criterion label (e.g. Research Depth & Method)`}
                        value={c.label}
                        onChange={(e) => updateCriterion(i, "label", e.target.value)}
                        style={{ flex: 1, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px 10px", fontSize: "13px", color: C.textPrimary, fontFamily: "inherit", outline: "none" }}
                        onFocus={focusOn} onBlur={focusOff}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
                        <input
                          type="number" min="1" required
                          value={c.max_marks}
                          onChange={(e) => updateCriterion(i, "max_marks", e.target.value)}
                          style={{ width: "56px", background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px 8px", fontSize: "13px", color: C.textPrimary, fontFamily: "inherit", outline: "none", textAlign: "center", fontWeight: "600" }}
                        />
                        <span style={{ ...T.caption, color: C.textMuted }}>pts</span>
                      </div>
                      {form.criteria.length > 1 && (
                        <button type="button" onClick={() => removeCriterion(i)}
                          title="Remove criterion"
                          style={{ background: "none", border: "none", cursor: "pointer", color: C.dangerText, fontSize: "16px", padding: "4px", display: "flex", alignItems: "center" }}>
                          <i className="ti ti-trash" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addCriterion}
                  className="btn-interactive"
                  style={{ marginTop: "10px", background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "6px", cursor: "pointer", color: C.textPrimary, fontSize: "13px", fontWeight: "600", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px" }}>
                  <i className="ti ti-plus" style={{ fontSize: "14px", color: C.accent }} />
                  Add Criterion
                </button>
              </div>

              {/* Submit Row */}
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowForm(false)}
                  className="btn-interactive"
                  style={{ padding: "9px 18px", borderRadius: "7px", border: `1px solid ${C.border}`, background: C.cardBg, color: C.textSecondary, fontSize: "14px", fontWeight: "500", fontFamily: "inherit", cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit"
                  className="btn-interactive"
                  style={{ padding: "9px 20px", borderRadius: "7px", border: "none", background: C.primary, color: C.primaryText, fontSize: "14px", fontWeight: "600", fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                  <i className="ti ti-clipboard-list" style={{ fontSize: "16px" }} />
                  Publish Assignment ({totalMarks} marks)
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Search & Status Filters Bar ── */}
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
            <i className="ti ti-search" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: C.textMuted }} />
            <input
              type="text"
              placeholder="Search assignments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                background: C.inputBg,
                border: `1px solid ${C.border}`,
                borderRadius: "6px",
                padding: "7px 10px 7px 32px",
                fontSize: "12px",
                color: C.textPrimary,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "4px" }}>
            {[
              { id: "all", label: "All", count: totalCount },
              { id: "active", label: "Active", count: activeCount },
              { id: "closed", label: "Closed", count: closedCount },
            ].map((tab) => {
              const isActive = filterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "20px",
                    border: `1px solid ${isActive ? C.primary : C.border}`,
                    background: isActive ? C.primary : C.subtleBg,
                    color: isActive ? C.primaryText : C.textSecondary,
                    fontSize: "11px",
                    fontWeight: "600",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span>{tab.label}</span>
                  <span style={{ fontSize: "10px", opacity: 0.8 }}>({tab.count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Compact Assignment list ── */}
        <div style={{ padding: filteredAssignments.length === 0 ? "40px 20px" : "0" }}>
          {filteredAssignments.length === 0 ? (
            <div style={{ textAlign: "center" }}>
              <i className="ti ti-clipboard-list" style={{ fontSize: "32px", color: C.border, display: "block", marginBottom: "8px" }} />
              <p style={{ fontSize: "14px", color: C.textMuted, margin: 0 }}>No assignments found matching the criteria.</p>
            </div>
          ) : (
            filteredAssignments.map((a, i) => (
              <CompactTeacherAssignmentRow
                key={a.id}
                assignment={a}
                last={i === filteredAssignments.length - 1}
                isPast={isPastDeadline(a)}
                onViewDetails={() => setSelectedAssignment(a)}
                onViewSubmissions={() => navigate(`/teacher/assignments/${a.id}/submissions`)}
                onDelete={() => handleDelete(a.id)}
              />
            ))
          )}
        </div>
      </Card>

      {/* Dedicated Teacher Assignment Details Modal */}
      {selectedAssignment && (
        <TeacherAssignmentDetailsModal
          assignment={selectedAssignment}
          isPast={isPastDeadline(selectedAssignment)}
          onViewSubmissions={() => {
            const id = selectedAssignment.id;
            setSelectedAssignment(null);
            navigate(`/teacher/assignments/${id}/submissions`);
          }}
          onClose={() => setSelectedAssignment(null)}
        />
      )}
    </div>
  );
}

// ─── Teacher Stat Tile Component ──────────────────────────────────────────
function TeacherStatTile({ title, count, icon, color, bg, border = C.border }) {
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

// ─── Compact Assignment Row (Teacher List View) ───────────────────────────
function CompactTeacherAssignmentRow({ assignment: a, last, isPast, onViewDetails, onViewSubmissions, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const relativeTime = getTeacherRelativeDueDate(a.due_date);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "14px 20px",
        borderBottom: last ? "none" : `1px solid ${C.border}`,
        borderLeft: `3.5px solid ${isPast ? "#94A3B8" : "#22C55E"}`,
        background: hovered ? C.subtleBg : C.cardBg,
        transition: "background 0.12s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
      }}
    >
      {/* Left: Key Summary Info */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
          <h4
            onClick={onViewDetails}
            style={{
              fontSize: "15px",
              fontWeight: "600",
              color: C.textPrimary,
              margin: 0,
              cursor: "pointer",
              lineHeight: "1.3",
            }}
          >
            {a.title}
          </h4>
          <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 7px", borderRadius: "10px", background: isPast ? C.dangerBg : C.successBg, color: isPast ? C.dangerText : C.successText, border: `1px solid ${isPast ? C.dangerBorder : C.successBorder}`, textTransform: "uppercase", letterSpacing: "0.03em" }}>
            {isPast ? "Closed" : "Active"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", fontSize: "12px" }}>
          {a.due_date && (
            <span style={{ fontWeight: "600", color: isPast ? C.dangerText : C.textSecondary, display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <i className={`ti ${isPast ? "ti-lock" : "ti-clock"}`} style={{ fontSize: "13px", color: isPast ? C.dangerText : C.warningText }} />
              <span>{isPast ? "Closed" : "Due"} {new Date(a.due_date).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              {relativeTime && (
                <span style={{ fontSize: "11px", fontWeight: "600", color: isPast ? C.dangerText : C.textMuted }}>
                  ({relativeTime})
                </span>
              )}
            </span>
          )}

          <span style={{ color: C.textSecondary, display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <i className="ti ti-clipboard-check" style={{ fontSize: "14px", color: C.accent }} />
            {a.criteria?.length || 0} {a.criteria?.length === 1 ? "criterion" : "criteria"} · {a.total_marks || (a.criteria?.reduce((sum, c) => sum + (Number(c.max_marks) || 0), 0))} marks total
          </span>
        </div>
      </div>

      {/* Right: Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        <button
          onClick={onViewDetails}
          title="View full assignment details & rubric"
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
          onClick={onViewSubmissions}
          title="View & grade student submissions"
          className="btn-interactive"
          style={{
            fontSize: "13px",
            fontWeight: "600",
            color: C.accentText,
            background: C.accentTint,
            border: `1px solid ${C.dangerBorder}`,
            borderRadius: "6px",
            padding: "6px 13px",
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            whiteSpace: "nowrap",
          }}
        >
          <i className="ti ti-users" style={{ fontSize: "14px" }} />
          Submissions
        </button>

        <button
          onClick={onDelete}
          title="Delete assignment"
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

// ─── Dedicated Teacher Assignment Details Modal ───────────────────────────
function TeacherAssignmentDetailsModal({ assignment: a, isPast, onViewSubmissions, onClose }) {
  const [modalTab, setModalTab] = useState("overview"); // "overview" | "rubric"
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const totalCalculatedMarks = a.total_marks || (a.criteria?.reduce((sum, c) => sum + (Number(c.max_marks) || 0), 0)) || 0;
  const relativeTime = getTeacherRelativeDueDate(a.due_date);

  const handleCopyInstructions = () => {
    if (!a.description) return;
    navigator.clipboard.writeText(a.description);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: C.accentText, background: C.accentTint, padding: "2px 8px", borderRadius: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Instructor View
              </span>
              <span style={{ fontSize: "11px", fontWeight: "700", padding: "2px 8px", borderRadius: "12px", background: isPast ? C.dangerBg : C.successBg, color: isPast ? C.dangerText : C.successText, border: `1px solid ${isPast ? C.dangerBorder : C.successBorder}` }}>
                {isPast ? "Deadline Passed" : "Active"}
              </span>
            </div>

            <h3 style={{ margin: "4px 0", fontSize: "18px", fontWeight: "700", color: C.textPrimary }}>
              {a.title}
            </h3>
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

        {/* Modal Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "0 24px", background: C.cardBg, gap: "8px" }}>
          {[
            { id: "overview", label: "Overview & Instructions", icon: "ti-file-text" },
            { id: "rubric", label: `Evaluation Rubric (${a.criteria?.length || 0})`, icon: "ti-clipboard-check" },
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
          
          {/* Key Info Metadata Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
            <div style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px 14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>
                Due Date & Deadline
              </span>
              <p style={{ fontSize: "13px", fontWeight: "600", color: isPast ? C.dangerText : C.textPrimary, margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                <i className={`ti ${isPast ? "ti-lock" : "ti-clock"}`} style={{ color: isPast ? C.dangerText : C.warningText }} />
                <span>{a.due_date ? new Date(a.due_date).toLocaleString() : "No deadline"}</span>
              </p>
              {relativeTime && (
                <span style={{ fontSize: "11px", color: isPast ? C.dangerText : C.textMuted, fontWeight: "500", marginTop: "2px", display: "block" }}>
                  {relativeTime}
                </span>
              )}
            </div>

            <div style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px 14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>
                Total Max Marks
              </span>
              <p style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary, margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                <i className="ti ti-award" style={{ color: C.accent }} />
                <span>{totalCalculatedMarks} Marks</span>
              </p>
            </div>

            <div style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px 14px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>
                Rubric Criteria
              </span>
              <p style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary, margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                <i className="ti ti-clipboard-check" style={{ color: C.accent }} />
                <span>{a.criteria?.length || 0} Criteria items</span>
              </p>
            </div>
          </div>

          {/* ── Tab: Overview & Instructions ── */}
          {modalTab === "overview" && (
            <div className="animate-fade-in">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <h4 style={{ fontSize: "13px", fontWeight: "700", color: C.textPrimary, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                  <i className="ti ti-align-left" style={{ color: C.accent }} />
                  Description & Instructions for Students
                </h4>

                {a.description && (
                  <button
                    onClick={handleCopyInstructions}
                    style={{
                      background: "none",
                      border: `1px solid ${C.border}`,
                      borderRadius: "6px",
                      padding: "4px 10px",
                      fontSize: "11px",
                      fontWeight: "600",
                      color: copied ? C.successText : C.textSecondary,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <i className={`ti ${copied ? "ti-check" : "ti-copy"}`} />
                    <span>{copied ? "Copied" : "Copy text"}</span>
                  </button>
                )}
              </div>

              <div style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px 18px" }}>
                {a.description ? (
                  <p style={{ fontSize: "14px", color: C.textSecondary, lineHeight: "1.65", margin: 0, whiteSpace: "pre-wrap" }}>
                    {a.description}
                  </p>
                ) : (
                  <p style={{ fontSize: "13px", color: C.textMuted, fontStyle: "italic", margin: 0 }}>
                    No instructions were attached to this assignment.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: Rubric Criteria ── */}
          {modalTab === "rubric" && (
            <div className="animate-fade-in">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <h4 style={{ fontSize: "13px", fontWeight: "700", color: C.textPrimary, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                  <i className="ti ti-clipboard-check" style={{ color: C.accent }} />
                  Grading Rubric Specifications
                </h4>
                <span style={{ fontSize: "12px", fontWeight: "600", color: C.textMuted }}>
                  Total: {totalCalculatedMarks} marks
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

        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: C.subtleBg,
            gap: "10px",
          }}
        >
          <button
            onClick={onClose}
            className="btn-interactive"
            style={{
              padding: "8px 18px",
              borderRadius: "7px",
              border: `1px solid ${C.border}`,
              background: C.cardBg,
              color: C.textSecondary,
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Close
          </button>

          <button
            onClick={onViewSubmissions}
            className="btn-interactive"
            style={{
              padding: "9px 20px",
              borderRadius: "7px",
              border: "none",
              background: C.primary,
              color: C.primaryText,
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            <i className="ti ti-users" style={{ fontSize: "15px" }} />
            <span>Review & Grade Submissions</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Relative Due Date Formatter Helper for Teacher ───────────────────────
function getTeacherRelativeDueDate(dueDateStr) {
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
  if (diffHours <= 1) return "Closes in <1h";
  if (diffHours < 24) return `Closes in ${diffHours}h`;
  if (diffDays === 1) return "Closes tomorrow";
  if (diffDays <= 7) return `Closes in ${diffDays}d`;
  return `Closes in ${diffDays}d`;
}

// Shared input style helpers
const inputStyle = {
  width: "100%", background: C.inputBg, border: "1.5px solid transparent",
  borderRadius: "7px", padding: "10px 13px", fontSize: "14px",
  color: C.textPrimary, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
const focusOn  = (e) => { e.target.style.borderColor = C.focusBorder; e.target.style.background = C.inputFocus; e.target.style.boxShadow = "0 0 0 3px rgba(17,17,17,0.08)"; };
const focusOff = (e) => { e.target.style.borderColor = "transparent"; e.target.style.background = C.inputBg; e.target.style.boxShadow = "none"; };
