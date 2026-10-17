// src/components/teacher/AttendancePanel.jsx
import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, Btn, Alert, Input } from "../Layout";
import * as attendanceApi from "../../api/attendance";
import * as coursesApi from "../../api/courses";
import { getErrorMessage } from "../../utils/errorMessage";
import { C, T } from "../../theme";

const STATUS_OPTIONS = [
  { value: "present", label: "Present", bg: C.successBg, txt: C.successText, border: C.successBorder },
  { value: "late",    label: "Late",    bg: C.warningBg, txt: C.warningText, border: C.warningBorder },
  { value: "absent",  label: "Absent",  bg: C.dangerBg,  txt: C.dangerText,  border: C.dangerBorder  },
];

export default function AttendancePanel({ courseId }) {
  const [sessions, setSessions]       = useState([]);
  const [roster, setRoster]           = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [marks, setMarks]             = useState({}); // { studentId: status }
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm]               = useState({ session_date: "", topic: "" });
  const [error, setError]             = useState("");
  const [saving, setSaving]           = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await attendanceApi.listSessions(courseId);
      setSessions(data);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load sessions."));
    }
  }, [courseId]);

  useEffect(() => {
    loadSessions();
    coursesApi.listRoster(courseId).then(({ data }) => setRoster(data));
  }, [courseId, loadSessions]);

  const handleCreateSession = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.session_date) { setError("Pick a date for this session."); return; }
    try {
      await attendanceApi.createSession(courseId, {
        session_date: new Date(form.session_date).toISOString(),
        topic: form.topic || null,
      });
      setForm({ session_date: "", topic: "" });
      setShowForm(false);
      await loadSessions();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't create session."));
    }
  };

  const openSession = async (session) => {
    setActiveSession(session);
    setError("");
    try {
      const { data } = await attendanceApi.getSessionRecords(session.id);
      const initial = {};
      roster.forEach((s) => { initial[s.id] = "present"; }); // default everyone present, teacher flips exceptions
      data.forEach((r) => { initial[r.student_id] = r.status; });
      setMarks(initial);
    } catch {
      const initial = {};
      roster.forEach((s) => { initial[s.id] = "present"; });
      setMarks(initial);
    }
  };

  const handleSave = async () => {
    if (!activeSession) return;
    setSaving(true);
    setError("");
    try {
      const records = roster.map((s) => ({ student_id: s.id, status: marks[s.id] || "present" }));
      await attendanceApi.markAttendance(activeSession.id, records);
      await loadSessions();
      setActiveSession(null);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save attendance."));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this class session and all its attendance records?")) return;
    try {
      await attendanceApi.deleteSession(sessionId);
      await loadSessions();
      if (activeSession?.id === sessionId) setActiveSession(null);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete session."));
    }
  };

  if (activeSession) {
    return (
      <Card>
        <CardHeader
          title={`Mark attendance — ${new Date(activeSession.session_date).toLocaleDateString()}`}
          count={roster.length}
          action={
            <div style={{ display: "flex", gap: "8px" }}>
              <Btn variant="secondary" size="sm" onClick={() => setActiveSession(null)}>Cancel</Btn>
              <Btn size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save attendance"}</Btn>
            </div>
          }
        />
        <Alert variant="error">{error}</Alert>
        <div style={{ padding: "8px 0" }}>
          {roster.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <p style={{ fontSize: "14px", color: C.textMuted }}>No students enrolled yet.</p>
            </div>
          ) : (
            roster.map((student, i) => (
              <div key={student.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 18px", borderBottom: i < roster.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: "14px", fontWeight: "500", color: C.textPrimary, margin: 0 }}>{student.full_name}</p>
                  <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>{student.email}</p>
                </div>
                <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                  {STATUS_OPTIONS.map((opt) => {
                    const isActive = marks[student.id] === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setMarks({ ...marks, [student.id]: opt.value })}
                        style={{
                          fontSize: "12px", fontWeight: "600", padding: "6px 12px", borderRadius: "6px",
                          cursor: "pointer", fontFamily: "inherit",
                          background: isActive ? opt.bg : "transparent",
                          color: isActive ? opt.txt : C.textMuted,
                          border: `1px solid ${isActive ? opt.border : C.border}`,
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Class sessions"
        count={sessions.length}
        action={<Btn size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "+ New session"}</Btn>}
      />
      <Alert variant="error">{error}</Alert>

      {showForm && (
        <form onSubmit={handleCreateSession} style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}`, background: C.subtleBg }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px", alignItems: "start" }}>
            <Input label="Date" type="datetime-local" required value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} />
            <Input label="Topic (optional)" placeholder="e.g. Lecture 3 — Sorting algorithms" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          </div>
          <Btn type="submit" size="sm">Create session</Btn>
        </form>
      )}

      <div style={{ padding: "8px 0" }}>
        {sessions.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <i className="ti ti-calendar-event" style={{ fontSize: "30px", color: C.border, display: "block", marginBottom: "10px" }} />
            <p style={{ fontSize: "14px", color: C.textMuted }}>No class sessions yet. Create one to start marking attendance.</p>
          </div>
        ) : (
          sessions.map((session, i) => (
            <div
              key={session.id}
              onClick={() => openSession(session)}
              style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px 18px", borderBottom: i < sessions.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}
            >
              <i className="ti ti-calendar-event" style={{ fontSize: "18px", color: C.textMuted, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: "14px", fontWeight: "500", color: C.textPrimary, margin: 0 }}>
                  {new Date(session.session_date).toLocaleString()}
                </p>
                {session.topic && <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>{session.topic}</p>}
              </div>
              <span style={{ ...T.tiny, fontWeight: "600", padding: "3px 9px", borderRadius: "20px", background: session.marked_count > 0 ? C.successBg : C.subtleBg, color: session.marked_count > 0 ? C.successText : C.textMuted, flexShrink: 0 }}>
                {session.marked_count}/{roster.length} marked
              </span>
              <button
                type="button"
                title="Delete session"
                onClick={(e) => handleDeleteSession(e, session.id)}
                className="btn-interactive"
                style={{
                  background: "transparent",
                  border: `1px solid ${C.dangerBorder}`,
                  borderRadius: "6px",
                  color: C.dangerText,
                  padding: "4px 8px",
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                <i className="ti ti-trash" />
              </button>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
