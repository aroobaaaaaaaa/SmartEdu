// src/components/teacher/AnalyticsPanel.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardHeader, Btn, Alert, Badge } from "../Layout";
import * as analyticsApi from "../../api/analytics";
import { getErrorMessage } from "../../utils/errorMessage";
import { C, T } from "../../theme";

const RISK_VARIANT = { high: "danger", medium: "warning", low: "success" };

const GRANULARITY_OPTIONS = [
  { id: "weekly", label: "Weekly View", desc: "Weekly trends & progress metrics" },
  { id: "monthly", label: "Monthly View", desc: "Monthly aggregate trajectory" },
  { id: "daily", label: "Daily View", desc: "Daily activity & check-ins" },
];

const TREND_CONFIG = {
  improving: { label: "Improving", icon: "ti-trending-up", color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
  stable: { label: "Stable", icon: "ti-minus", color: "#0284C7", bg: "#F0F9FF", border: "#BAE6FD" },
  declining: { label: "Declining", icon: "ti-trending-down", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  insufficient_data: { label: "Building", icon: "ti-dots", color: "#6B7280", bg: "#F3F4F6", border: "#E5E7EB" },
};

export default function AnalyticsPanel({ courseId }) {
  const [granularity, setGranularity] = useState("weekly");
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Table filtering and search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "attention" | "improving" | "ontrack"
  const [selectedStudent, setSelectedStudent] = useState(null); // For detail modal
  const [cohortSeries, setCohortSeries] = useState("score"); // "score" | "attendance" | "completion"

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const progRes = await analyticsApi.getCourseProgressOverview(courseId, granularity);
      setProgressData(progRes.data);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load course analytics."));
    } finally {
      setLoading(false);
    }
  }, [courseId, granularity]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Filtered student list
  const filteredStudents = useMemo(() => {
    if (!progressData?.students) return [];
    return progressData.students.filter((st) => {
      const name = st.student_name || "";
      const email = st.email || "";
      const reg = st.registration_number || "";
      const query = searchQuery.toLowerCase();

      const matchesSearch =
        !query ||
        name.toLowerCase().includes(query) ||
        email.toLowerCase().includes(query) ||
        reg.toLowerCase().includes(query);

      const isAttention = st.risk_level === "high" || st.risk_level === "medium" || st.trend_direction === "declining";
      const isImproving = st.trend_direction === "improving";
      const isOnTrack = st.risk_level === "low" && st.trend_direction !== "declining";

      if (statusFilter === "attention") return matchesSearch && isAttention;
      if (statusFilter === "improving") return matchesSearch && isImproving;
      if (statusFilter === "ontrack") return matchesSearch && isOnTrack;
      return matchesSearch;
    });
  }, [progressData, searchQuery, statusFilter]);

  if (loading) {
    return (
      <Card>
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: C.subtleBg, border: `2px solid ${C.accent}`, borderTopColor: "transparent", margin: "0 auto 14px", animation: "spin 0.8s linear infinite" }} />
          <h3 style={{ fontSize: "15px", fontWeight: "700", color: C.textPrimary, margin: "0 0 4px" }}>Analyzing Course Performance…</h3>
          <p style={{ fontSize: "12.5px", color: C.textMuted, margin: 0 }}>Compiling attendance records, submissions, grades & class trends</p>
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
      </Card>
    );
  }

  const students = progressData?.students || [];
  const interventions = progressData?.interventions || [];
  const highRiskCount = progressData?.risk_breakdown?.high || 0;
  const mediumRiskCount = progressData?.risk_breakdown?.medium || 0;
  const improvingCount = progressData?.trend_breakdown?.improving || 0;

  // Calculate cohort attendance & completion averages
  const avgAttendance = students.length
    ? Math.round(students.reduce((acc, s) => acc + (s.attendance_rate || 0), 0) / (students.filter(s => s.attendance_rate !== null).length || 1))
    : null;

  const avgCompletion = students.length
    ? Math.round(students.reduce((acc, s) => acc + (s.submission_rate || 0), 0) / (students.filter(s => s.submission_rate !== null).length || 1))
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      <Alert variant="error">{error}</Alert>

      {/* ── 1. Top Executive Course Health Summary ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px" }}>
        {/* Metric 1: Class Average */}
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderTop: `3px solid ${C.accent}`, borderRadius: "10px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "6px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", color: C.textMuted }}>
              Class Grade Average
            </span>
            <i className="ti ti-chart-bar" style={{ fontSize: "17px", color: C.accent }} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "2px" }}>
            <span style={{ fontSize: "28px", fontWeight: "800", color: C.textPrimary, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {progressData?.average_score !== null ? `${Math.round(progressData.average_score)}%` : "—"}
            </span>
            <span style={{ fontSize: "12px", fontWeight: "600", color: C.textMuted }}>
              across {progressData?.total_students || 0} students
            </span>
          </div>
          <span style={{ fontSize: "11.5px", color: C.textSecondary }}>
            {improvingCount > 0 ? `📈 ${improvingCount} students trending upward` : "Stable grade distribution"}
          </span>
        </div>

        {/* Metric 2: Attendance Rate */}
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderTop: `3px solid #0284C7`, borderRadius: "10px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "6px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", color: C.textMuted }}>
              Attendance Health
            </span>
            <i className="ti ti-calendar-check" style={{ fontSize: "17px", color: "#0284C7" }} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "2px" }}>
            <span style={{ fontSize: "28px", fontWeight: "800", color: C.textPrimary, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {avgAttendance !== null ? `${avgAttendance}%` : "—"}
            </span>
            <span style={{ fontSize: "12px", fontWeight: "600", color: C.textMuted }}>
              session presence
            </span>
          </div>
          <span style={{ fontSize: "11.5px", color: C.textSecondary }}>
            Active lecture participation
          </span>
        </div>

        {/* Metric 3: Submissions Completed */}
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderTop: `3px solid #059669`, borderRadius: "10px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "6px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", color: C.textMuted }}>
              Submission Consistency
            </span>
            <i className="ti ti-clipboard-check" style={{ fontSize: "17px", color: "#059669" }} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "2px" }}>
            <span style={{ fontSize: "28px", fontWeight: "800", color: C.textPrimary, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {avgCompletion !== null ? `${avgCompletion}%` : "—"}
            </span>
            <span style={{ fontSize: "12px", fontWeight: "600", color: C.textMuted }}>
              on-time submissions
            </span>
          </div>
          <span style={{ fontSize: "11.5px", color: C.textSecondary }}>
            Zero-penalty deadline pacing
          </span>
        </div>

        {/* Metric 4: Action Priority / At Risk */}
        <div style={{ background: highRiskCount > 0 ? "#FEF2F2" : C.cardBg, border: `1px solid ${highRiskCount > 0 ? "#FECACA" : C.border}`, borderTop: `3px solid ${highRiskCount > 0 ? "#DC2626" : "#10B981"}`, borderRadius: "10px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "6px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", color: highRiskCount > 0 ? "#DC2626" : C.textMuted }}>
              Students Needing Support
            </span>
            <i className={`ti ti-${highRiskCount > 0 ? "alert-triangle" : "circle-check"}`} style={{ fontSize: "17px", color: highRiskCount > 0 ? "#DC2626" : "#10B981" }} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "2px" }}>
            <span style={{ fontSize: "28px", fontWeight: "800", color: highRiskCount > 0 ? "#DC2626" : C.textPrimary, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {highRiskCount + mediumRiskCount}
            </span>
            <span style={{ fontSize: "12px", fontWeight: "600", color: highRiskCount > 0 ? "#991B1B" : C.textMuted }}>
              ({highRiskCount} high risk)
            </span>
          </div>
          <span style={{ fontSize: "11.5px", color: highRiskCount > 0 ? "#B91C1C" : C.textSecondary }}>
            {highRiskCount > 0 ? "Actionable interventions recommended" : "All students on track"}
          </span>
        </div>
      </div>

      {/* ── 2. Priority Student Action Center (Immediate Interventions) ── */}
      {interventions && interventions.length > 0 ? (
        <Card>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", background: "rgba(254, 242, 242, 0.5)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="ti ti-alert-triangle" style={{ color: "#DC2626", fontSize: "15px" }} />
              </div>
              <div>
                <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#991B1B", margin: 0 }}>
                  Priority Student Action Center
                </h3>
                <p style={{ fontSize: "12px", color: "#B91C1C", margin: "1px 0 0" }}>
                  {interventions.length} student{interventions.length > 1 ? "s" : ""} require attention for attendance, missed deadlines, or score dips
                </p>
              </div>
            </div>
            <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", background: "#FEE2E2", color: "#B91C1C", padding: "4px 10px", borderRadius: "6px" }}>
              Needs Intervention
            </span>
          </div>

          <div style={{ padding: "6px 0" }}>
            {interventions.map((item, idx) => {
              const isHigh = item.urgency === "high";
              return (
                <div
                  key={item.student_id}
                  style={{
                    borderBottom: idx < interventions.length - 1 ? `1px solid ${C.border}` : "none",
                    padding: "14px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "14px",
                    background: isHigh ? "rgba(254, 242, 242, 0.25)" : "transparent",
                  }}
                >
                  <div style={{ minWidth: "240px", flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "14.5px", fontWeight: "700", color: C.textPrimary }}>
                        {item.student_name}
                      </span>
                      {item.registration_number && (
                        <span style={{ fontSize: "11px", color: C.textMuted, background: C.subtleBg, padding: "1px 6px", borderRadius: "4px", fontFamily: "monospace" }}>
                          {item.registration_number}
                        </span>
                      )}
                      <Badge variant={RISK_VARIANT[item.risk_level] || "neutral"}>
                        {item.risk_level.toUpperCase()}
                      </Badge>
                      {item.trend_direction && (
                        <span style={{ fontSize: "11px", fontWeight: "600", color: TREND_CONFIG[item.trend_direction]?.color || C.textMuted }}>
                          <i className={`ti ${TREND_CONFIG[item.trend_direction]?.icon}`} /> {TREND_CONFIG[item.trend_direction]?.label}
                        </span>
                      )}
                    </div>

                    <p style={{ fontSize: "13px", fontWeight: "600", color: isHigh ? "#DC2626" : "#D97706", margin: "0 0 2px" }}>
                      {item.primary_concern}
                    </p>

                    {item.concern_detail && (
                      <p style={{ fontSize: "12px", color: C.textSecondary, margin: 0 }}>
                        {item.concern_detail}
                      </p>
                    )}
                  </div>

                  {/* Recommended Action Pill & Quick Button */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {item.recommended_action && (
                      <div style={{ background: C.cardBg, border: `1px solid ${isHigh ? "#FECACA" : C.border}`, borderRadius: "7px", padding: "8px 12px", maxWidth: "300px" }}>
                        <span style={{ fontSize: "10.5px", fontWeight: "800", color: C.accent, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "2px" }}>
                          Suggested Action
                        </span>
                        <span style={{ fontSize: "12px", color: C.textPrimary, fontWeight: "500" }}>
                          {item.recommended_action}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        const targetStudent = students.find((s) => s.student_id === item.student_id);
                        if (targetStudent) setSelectedStudent(targetStudent);
                      }}
                      style={{
                        background: C.primary,
                        color: C.primaryText,
                        border: "none",
                        borderRadius: "6px",
                        padding: "8px 12px",
                        fontSize: "12.5px",
                        fontWeight: "600",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <i className="ti ti-user-search" /> View Profile
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "10px", padding: "14px 18px", display: "flex", alignItems: "center", gap: "10px" }}>
          <i className="ti ti-circle-check" style={{ color: "#16A34A", fontSize: "20px" }} />
          <div>
            <h4 style={{ fontSize: "13.5px", fontWeight: "700", color: "#15803D", margin: 0 }}>Class Standing is Healthy</h4>
            <p style={{ fontSize: "12px", color: "#166534", margin: "2px 0 0" }}>All enrolled students are meeting attendance and assignment submission milestones.</p>
          </div>
        </div>
      )}

      {/* ── 3. Class Trajectory Curve & Progress Analytics ── */}
      <Card>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: "700", color: C.textPrimary, margin: "0 0 2px" }}>
              Class Performance Trajectory
            </h3>
            <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>
              Evaluated across {progressData?.cohort_trajectory?.length || 0} periods with passing benchmark (70%)
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Granularity Pill Switcher */}
            <div style={{ display: "flex", background: C.subtleBg, padding: "3px", borderRadius: "7px", border: `1px solid ${C.border}`, gap: "2px" }}>
              {GRANULARITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setGranularity(opt.id)}
                  style={{
                    background: granularity === opt.id ? C.cardBg : "transparent",
                    color: granularity === opt.id ? C.textPrimary : C.textSecondary,
                    fontWeight: granularity === opt.id ? "700" : "500",
                    border: granularity === opt.id ? `1px solid ${C.border}` : "1px solid transparent",
                    borderRadius: "5px",
                    padding: "4px 10px",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    boxShadow: granularity === opt.id ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Metric Series Buttons */}
            <div style={{ display: "flex", gap: "4px" }}>
              <SeriesButton active={cohortSeries === "score"} label="Class Average" color={C.accent} onClick={() => setCohortSeries("score")} />
              <SeriesButton active={cohortSeries === "attendance"} label="Attendance %" color="#0284C7" onClick={() => setCohortSeries("attendance")} />
              <SeriesButton active={cohortSeries === "completion"} label="Submissions %" color="#059669" onClick={() => setCohortSeries("completion")} />
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 20px 10px" }}>
          <SmoothCohortSvgChart
            trajectory={progressData?.cohort_trajectory || []}
            seriesKey={cohortSeries}
          />
        </div>
      </Card>

      {/* ── 4. Enrolled Students Performance Roster ── */}
      <Card>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: "700", color: C.textPrimary, margin: "0 0 2px" }}>
              Enrolled Students Roster ({students.length})
            </h3>
            <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>
              Click any student to view their individual progress curve, dimensional scores & AI insights
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {/* Search Input */}
            <div style={{ position: "relative", minWidth: "180px" }}>
              <i className="ti ti-search" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: C.textMuted, fontSize: "14px" }} />
              <input
                type="text"
                placeholder="Search by name, email or reg #…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: C.subtleBg,
                  border: `1px solid ${C.border}`,
                  borderRadius: "6px",
                  padding: "6px 10px 6px 30px",
                  fontSize: "12.5px",
                  color: C.textPrimary,
                  outline: "none",
                  fontFamily: "inherit",
                  width: "100%",
                }}
              />
            </div>

            {/* Status Quick Filter Buttons */}
            <div style={{ display: "flex", background: C.subtleBg, padding: "2px", borderRadius: "6px", border: `1px solid ${C.border}` }}>
              <button
                onClick={() => setStatusFilter("all")}
                style={{
                  background: statusFilter === "all" ? C.cardBg : "transparent",
                  color: statusFilter === "all" ? C.textPrimary : C.textSecondary,
                  fontWeight: statusFilter === "all" ? "700" : "500",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                All ({students.length})
              </button>
              <button
                onClick={() => setStatusFilter("attention")}
                style={{
                  background: statusFilter === "attention" ? C.cardBg : "transparent",
                  color: statusFilter === "attention" ? "#DC2626" : C.textSecondary,
                  fontWeight: statusFilter === "attention" ? "700" : "500",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                Needs Help ({interventions.length})
              </button>
              <button
                onClick={() => setStatusFilter("improving")}
                style={{
                  background: statusFilter === "improving" ? C.cardBg : "transparent",
                  color: statusFilter === "improving" ? "#059669" : C.textSecondary,
                  fontWeight: statusFilter === "improving" ? "700" : "500",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                Improving ({improvingCount})
              </button>
              <button
                onClick={() => setStatusFilter("ontrack")}
                style={{
                  background: statusFilter === "ontrack" ? C.cardBg : "transparent",
                  color: statusFilter === "ontrack" ? "#0284C7" : C.textSecondary,
                  fontWeight: statusFilter === "ontrack" ? "700" : "500",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                On Track
              </button>
            </div>
          </div>
        </div>

        {/* Clean Student Roster Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
            <thead>
              <tr style={{ background: C.subtleBg, borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontWeight: "700", textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.05em" }}>
                <th style={{ padding: "11px 18px" }}>Student</th>
                <th style={{ padding: "11px 18px" }}>Grade Avg</th>
                <th style={{ padding: "11px 18px" }}>Attendance</th>
                <th style={{ padding: "11px 18px" }}>Submissions</th>
                <th style={{ padding: "11px 18px" }}>Trend Velocity</th>
                <th style={{ padding: "11px 18px" }}>Risk Status</th>
                <th style={{ padding: "11px 18px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "36px 18px", textAlign: "center", color: C.textMuted }}>
                    No students match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st, i) => {
                  const trend = TREND_CONFIG[st.trend_direction] || TREND_CONFIG.insufficient_data;
                  const isHighRisk = st.risk_level === "high";
                  return (
                    <tr
                      key={st.student_id}
                      onClick={() => setSelectedStudent(st)}
                      style={{
                        borderBottom: i < filteredStudents.length - 1 ? `1px solid ${C.border}` : "none",
                        cursor: "pointer",
                        background: isHighRisk ? "rgba(254, 242, 242, 0.25)" : "transparent",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = C.subtleBg; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isHighRisk ? "rgba(254, 242, 242, 0.25)" : "transparent"; }}
                    >
                      <td style={{ padding: "12px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: C.infoBg, border: `1px solid ${C.infoBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: "12px", fontWeight: "700", color: C.infoText }}>
                              {st.student_name?.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <span style={{ fontWeight: "600", color: C.textPrimary, display: "block" }}>{st.student_name}</span>
                            <span style={{ fontSize: "11px", color: C.textMuted }}>{st.registration_number || st.email}</span>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "12px 18px", fontWeight: "700", color: C.textPrimary }}>
                        {st.current_score !== null ? `${Math.round(st.current_score)}%` : "—"}
                      </td>

                      <td style={{ padding: "12px 18px" }}>
                        {st.attendance_rate !== null ? (
                          <span style={{ color: st.attendance_rate >= 75 ? "#059669" : st.attendance_rate >= 60 ? "#D97706" : "#DC2626", fontWeight: "600" }}>
                            {Math.round(st.attendance_rate)}%
                          </span>
                        ) : (
                          <span style={{ color: C.textMuted }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: "12px 18px" }}>
                        {st.submission_rate !== null ? (
                          <span style={{ fontWeight: "600", color: C.textPrimary }}>{Math.round(st.submission_rate)}%</span>
                        ) : (
                          <span style={{ color: C.textMuted }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: "12px 18px" }}>
                        <span style={{ fontSize: "11.5px", fontWeight: "700", color: trend.color, background: trend.bg, border: `1px solid ${trend.border}`, padding: "3px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <i className={`ti ${trend.icon}`} /> {trend.label}
                        </span>
                      </td>

                      <td style={{ padding: "12px 18px" }}>
                        <Badge variant={RISK_VARIANT[st.risk_level] || "neutral"}>
                          {st.risk_level.toUpperCase()}
                        </Badge>
                      </td>

                      <td style={{ padding: "12px 18px", textAlign: "right" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStudent(st);
                          }}
                          style={{
                            background: "none",
                            border: `1px solid ${C.border}`,
                            borderRadius: "5px",
                            padding: "4px 8px",
                            fontSize: "12px",
                            color: C.textSecondary,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── 5. Student Detail Modal / Slide-over Drawer ── */}
      {selectedStudent && (
        <StudentDetailModal
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </div>
  );
}

// ── Series Button ──
function SeriesButton({ active, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${color}14` : "transparent",
        color: active ? color : C.textSecondary,
        fontWeight: active ? "700" : "500",
        border: `1px solid ${active ? color : C.border}`,
        borderRadius: "6px",
        padding: "4px 10px",
        fontSize: "11.5px",
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        transition: "all 0.12s",
      }}
    >
      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: color }} />
      {label}
    </button>
  );
}

// ── Smooth Cohort SVG Trajectory Chart ──
function SmoothCohortSvgChart({ trajectory, seriesKey }) {
  const width = 860;
  const height = 230;
  const padding = { top: 25, right: 30, bottom: 42, left: 45 };

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const keyMap = {
    score: "average_score",
    attendance: "average_attendance",
    completion: "average_completion",
  };
  const targetProp = keyMap[seriesKey] || "average_score";

  const points = trajectory.map((item, idx) => ({
    idx,
    label: item.label,
    label_long: item.label_long,
    val: item[targetProp],
    hasVal: item[targetProp] !== null && item[targetProp] !== undefined,
    students: item.active_students,
  }));

  const validPoints = points.filter((p) => p.hasVal);

  if (validPoints.length === 0) {
    return (
      <div style={{ height: "160px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.textMuted }}>
        <i className="ti ti-chart-dots" style={{ fontSize: "30px", color: C.border, marginBottom: "8px" }} />
        <span style={{ fontSize: "13px", fontWeight: "500" }}>No cohort data points recorded in this timeframe yet.</span>
      </div>
    );
  }

  const getX = (index) => {
    if (points.length <= 1) return padding.left + plotWidth / 2;
    return padding.left + (index / (points.length - 1)) * plotWidth;
  };

  const getY = (val) => {
    const clamped = Math.max(0, Math.min(100, val));
    return padding.top + plotHeight - (clamped / 100) * plotHeight;
  };

  const color = seriesKey === "attendance" ? "#0284C7" : seriesKey === "completion" ? "#059669" : C.accent;
  const coords = validPoints.map((p) => ({ x: getX(p.idx), y: getY(p.val) }));

  // Generate smooth cubic bezier line string
  const getSmoothPath = (pts) => {
    if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
    if (pts.length === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const linePath = getSmoothPath(coords);
  const bottomY = padding.top + plotHeight;
  const areaPath = coords.length > 0
    ? `${linePath} L ${coords[coords.length - 1].x},${bottomY} L ${coords[0].x},${bottomY} Z`
    : "";

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", minWidth: "480px", display: "block" }}>
        <defs>
          <linearGradient id={`grad_cohort_${seriesKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Benchmark Gridlines */}
        {[0, 25, 50, 70, 85, 100].map((lvl) => {
          const y = getY(lvl);
          const isPassingThreshold = lvl === 70;
          return (
            <g key={lvl}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + plotWidth}
                y2={y}
                stroke={isPassingThreshold ? "#D1D5DB" : "#F3F4F6"}
                strokeDasharray={isPassingThreshold ? "4 4" : "none"}
                strokeWidth="1"
              />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="10.5" fill={isPassingThreshold ? C.textSecondary : C.textMuted} fontFamily="inherit">
                {lvl}%
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        {areaPath && <path d={areaPath} fill={`url(#grad_cohort_${seriesKey})`} />}

        {/* Smooth line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {points.map((p, i) => {
          const cx = getX(i);
          const cy = p.hasVal ? getY(p.val) : bottomY;
          return (
            <g key={i}>
              {p.hasVal ? (
                <>
                  <circle cx={cx} cy={cy} r="5" fill="#FFF" stroke={color} strokeWidth="2.5" />
                  <title>{`${p.label_long}: ${Math.round(p.val)}% (${p.students} students active)`}</title>
                </>
              ) : (
                <circle cx={cx} cy={bottomY} r="2.5" fill="#D1D5DB" />
              )}
              <text x={cx} y={bottomY + 18} textAnchor="middle" fontSize="11" fill={C.textMuted} fontWeight="500" fontFamily="inherit">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Student Detail Modal ──
function StudentDetailModal({ student, onClose }) {
  const trend = TREND_CONFIG[student.trend_direction] || TREND_CONFIG.insufficient_data;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cardBg,
          borderRadius: "14px",
          border: `1px solid ${C.border}`,
          width: "100%",
          maxWidth: "680px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Modal Header */}
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: C.infoBg, border: `1.5px solid ${C.infoBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "16px", fontWeight: "700", color: C.infoText }}>
                {student.student_name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h3 style={{ fontSize: "17px", fontWeight: "800", color: C.textPrimary, margin: 0 }}>
                {student.student_name}
              </h3>
              <p style={{ fontSize: "12.5px", color: C.textMuted, margin: "2px 0 0" }}>
                {student.registration_number ? `Reg: ${student.registration_number} · ` : ""}{student.email}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Badge variant={RISK_VARIANT[student.risk_level] || "neutral"}>
              {student.risk_level.toUpperCase()}
            </Badge>
            <span style={{ fontSize: "11.5px", fontWeight: "700", color: trend.color, background: trend.bg, border: `1px solid ${trend.border}`, padding: "3px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <i className={`ti ${trend.icon}`} /> {trend.label}
            </span>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, fontSize: "20px", cursor: "pointer", padding: "4px 8px" }}>
              <i className="ti ti-x" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Key Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
            <div style={{ background: C.subtleBg, padding: "12px", borderRadius: "8px", border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: "11px", color: C.textMuted, textTransform: "uppercase", fontWeight: "700" }}>Current Score</span>
              <p style={{ fontSize: "20px", fontWeight: "800", color: C.textPrimary, margin: "4px 0 0" }}>
                {student.current_score !== null ? `${Math.round(student.current_score)}%` : "—"}
              </p>
            </div>
            <div style={{ background: C.subtleBg, padding: "12px", borderRadius: "8px", border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: "11px", color: C.textMuted, textTransform: "uppercase", fontWeight: "700" }}>Attendance</span>
              <p style={{ fontSize: "20px", fontWeight: "800", color: C.textPrimary, margin: "4px 0 0" }}>
                {student.attendance_rate !== null ? `${Math.round(student.attendance_rate)}%` : "—"}
              </p>
            </div>
            <div style={{ background: C.subtleBg, padding: "12px", borderRadius: "8px", border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: "11px", color: C.textMuted, textTransform: "uppercase", fontWeight: "700" }}>Submissions</span>
              <p style={{ fontSize: "20px", fontWeight: "800", color: C.textPrimary, margin: "4px 0 0" }}>
                {student.submission_rate !== null ? `${Math.round(student.submission_rate)}%` : "—"}
              </p>
            </div>
          </div>

          {/* Dimensions Breakdown */}
          {student.dimensions && (
            <div>
              <h4 style={{ fontSize: "13px", fontWeight: "700", color: C.textPrimary, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Dimensional Breakdown
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
                {student.dimensions.map((dim) => (
                  <div key={dim.key} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                      <span style={{ color: C.textSecondary, display: "flex", alignItems: "center", gap: "4px" }}>
                        <i className={`ti ${dim.icon}`} style={{ color: C.accent }} /> {dim.label}
                      </span>
                      <strong style={{ color: dim.has_data ? C.textPrimary : C.textMuted }}>
                        {dim.has_data ? `${Math.round(dim.score)}%` : "—"}
                      </strong>
                    </div>
                    <div style={{ height: "5px", background: C.subtleBg, borderRadius: "4px", overflow: "hidden", border: `1px solid ${C.border}` }}>
                      <div style={{ height: "100%", width: `${dim.has_data ? Math.min(100, Math.max(4, dim.score)) : 0}%`, background: !dim.has_data ? "transparent" : dim.score >= 75 ? "#059669" : dim.score >= 50 ? "#D97706" : "#DC2626", borderRadius: "4px" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actionable Insights */}
          {student.insights && student.insights.length > 0 && (
            <div>
              <h4 style={{ fontSize: "13px", fontWeight: "700", color: C.textPrimary, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Actionable Insights & Recommendations
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {student.insights.map((ins, idx) => (
                  <div key={idx} style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 14px", fontSize: "12.5px" }}>
                    <div style={{ fontWeight: "700", color: C.textPrimary, marginBottom: "2px" }}>
                      {ins.title}
                    </div>
                    <div style={{ color: C.textSecondary, lineHeight: "1.4" }}>
                      {ins.detail}
                    </div>
                    {ins.recommended_action && (
                      <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: `1px dashed ${C.border}`, color: C.accent, fontWeight: "600", fontSize: "12px" }}>
                        Action: {ins.recommended_action}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", background: C.subtleBg }}>
          <Btn onClick={onClose} size="sm">Close</Btn>
        </div>
      </div>
    </div>
  );
}