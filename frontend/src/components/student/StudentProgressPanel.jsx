// src/components/student/StudentProgressPanel.jsx
import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, Alert, Badge } from "../Layout";
import * as analyticsApi from "../../api/analytics";
import { getErrorMessage } from "../../utils/errorMessage";
import { C, T } from "../../theme";

const GRANULARITY_OPTIONS = [
  { id: "daily", label: "Daily Activity", desc: "Learning activity & daily consistency" },
  { id: "weekly", label: "Weekly Progress", desc: "Multi-dimensional performance score" },
  { id: "monthly", label: "Monthly Trends", desc: "Long-term trajectory & aggregate metrics" },
];

const SEVERITY_CONFIG = {
  critical: { bg: C.dangerBg, border: C.dangerBorder, text: C.dangerText, icon: "ti-alert-triangle" },
  warning: { bg: C.warningBg, border: C.warningBorder, text: C.warningText, icon: "ti-alert-circle" },
  positive: { bg: C.successBg, border: C.successBorder, text: C.successText, icon: "ti-circle-check" },
  info: { bg: C.infoBg, border: C.infoBorder, text: C.infoText, icon: "ti-info-circle" },
};

const TREND_CONFIG = {
  improving: { label: "Improving", icon: "ti-trending-up", color: C.successText, bg: C.successBg },
  stable: { label: "Stable", icon: "ti-minus", color: C.infoText, bg: C.infoBg },
  declining: { label: "Declining", icon: "ti-trending-down", color: C.dangerText, bg: C.dangerBg },
  insufficient_data: { label: "Building History", icon: "ti-dots", color: C.textMuted, bg: C.subtleBg },
};

export default function StudentProgressPanel({ courseId }) {
  const [granularity, setGranularity] = useState("weekly");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSeries, setActiveSeries] = useState("performance");
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await analyticsApi.getMyProgress(courseId, granularity);
      setData(res.data);
      if (granularity === "daily") {
        setActiveSeries("activity");
      } else {
        setActiveSeries("performance");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load your progress report."));
    } finally {
      setLoading(false);
    }
  }, [courseId, granularity]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  if (loading) {
    return (
      <Card>
        <div style={{ padding: "50px 20px", textAlign: "center" }}>
          <i className="ti ti-loader-2" style={{ fontSize: "28px", color: C.accent, animation: "spin 1s linear infinite", display: "inline-block", marginBottom: "12px" }} />
          <p style={{ fontSize: "14px", color: C.textMuted, margin: 0 }}>Compiling your progress timeline and learning trends…</p>
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
      </Card>
    );
  }

  if (error) {
    return <Alert variant="error">{error}</Alert>;
  }

  if (!data) return null;

  const { summary, trends, dimensions, strongest_area, weakest_area, insights, periods, series, risk } = data;
  const primaryTrend = trends?.primary || {};
  const trendUi = TREND_CONFIG[primaryTrend.direction] || TREND_CONFIG.insufficient_data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* ── Header Granularity Switcher ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px 18px" }}>
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: "700", color: C.textPrimary, margin: "0 0 2px" }}>
            Performance & Learning Analytics
          </h2>
          <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>
            {GRANULARITY_OPTIONS.find((g) => g.id === granularity)?.desc}
          </p>
        </div>

        <div style={{ display: "flex", background: C.subtleBg, padding: "3px", borderRadius: "8px", border: `1px solid ${C.border}` }}>
          {GRANULARITY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setGranularity(opt.id)}
              style={{
                background: granularity === opt.id ? C.cardBg : "transparent",
                color: granularity === opt.id ? C.textPrimary : C.textSecondary,
                fontWeight: granularity === opt.id ? "600" : "400",
                border: granularity === opt.id ? `1px solid ${C.border}` : "1px solid transparent",
                borderRadius: "6px",
                padding: "6px 14px",
                fontSize: "12.5px",
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: granularity === opt.id ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.12s",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Highlight Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
        <KpiCard
          label={granularity === "daily" ? "Daily Learning Score" : "Current Performance"}
          value={summary.current_score !== null ? `${Math.round(summary.current_score)}%` : "—"}
          badge={
            summary.delta !== null ? (
              <span style={{ fontSize: "11px", fontWeight: "600", color: summary.delta >= 0 ? C.successText : C.dangerText, background: summary.delta >= 0 ? C.successBg : C.dangerBg, padding: "2px 6px", borderRadius: "4px" }}>
                {summary.delta >= 0 ? `+${summary.delta}` : summary.delta} pts
              </span>
            ) : null
          }
          subtext={data.meta?.trailing_period_partial ? "Latest completed period" : "Across recorded metrics"}
          icon="ti-chart-bar"
        />

        <KpiCard
          label="Learning Trend"
          value={trendUi.label}
          badge={
            <span style={{ fontSize: "11px", fontWeight: "600", color: trendUi.color, background: trendUi.bg, padding: "2px 7px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
              <i className={`ti ${trendUi.icon}`} />
              {primaryTrend.delta ? `${primaryTrend.delta > 0 ? "+" : ""}${primaryTrend.delta} pts` : primaryTrend.confidence}
            </span>
          }
          subtext={`Based on ${primaryTrend.points || 0} evaluated periods`}
          icon="ti-trending-up"
        />

        <KpiCard
          label="Average Score"
          value={summary.average_score !== null ? `${Math.round(summary.average_score)}%` : "—"}
          badge={<span style={{ fontSize: "11px", color: C.textMuted }}>{summary.periods_with_data} active {granularity === "daily" ? "days" : granularity === "weekly" ? "weeks" : "months"}</span>}
          subtext={summary.best_period ? `Peak: ${summary.best_period}` : "Consistent tracking"}
          icon="ti-award"
        />

        <KpiCard
          label="At-Risk Indicator"
          value={risk.current_level ? `${risk.current_level.toUpperCase()}` : "LOW"}
          badge={
            <span style={{ fontSize: "11px", fontWeight: "600", color: risk.current_level === "high" ? C.dangerText : risk.current_level === "medium" ? C.warningText : C.successText, background: risk.current_level === "high" ? C.dangerBg : risk.current_level === "medium" ? C.warningBg : C.successBg, padding: "2px 7px", borderRadius: "4px" }}>
              {risk.current_score !== null ? `${Math.round(risk.current_score * 100)}% risk` : "Healthy"}
            </span>
          }
          subtext="Rule-based continuous replay"
          icon="ti-shield-check"
        />
      </div>

      {/* ── Interactive Progress Chart ── */}
      <Card>
        <CardHeader
          title="Progress Trajectory & History"
          count={`${periods.length} periods`}
          action={
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <SeriesToggleBtn
                active={activeSeries === (granularity === "daily" ? "activity" : "performance")}
                label={granularity === "daily" ? "Activity Score" : "Overall Score"}
                onClick={() => setActiveSeries(granularity === "daily" ? "activity" : "performance")}
                color={C.accent}
              />
              <SeriesToggleBtn
                active={activeSeries === "attendance"}
                label="Attendance %"
                onClick={() => setActiveSeries("attendance")}
                color="#0EA5E9"
              />
              <SeriesToggleBtn
                active={activeSeries === "assignment_completion"}
                label="Submissions %"
                onClick={() => setActiveSeries("assignment_completion")}
                color="#10B981"
              />
              <SeriesToggleBtn
                active={activeSeries === "engagement"}
                label="Engagement %"
                onClick={() => setActiveSeries("engagement")}
                color="#8B5CF6"
              />
            </div>
          }
        />

        <div style={{ padding: "20px 18px 10px" }}>
          <SvgTrendChart
            periods={periods}
            seriesData={series[activeSeries] || []}
            seriesKey={activeSeries}
            hoveredIndex={hoveredIndex}
            onHover={setHoveredIndex}
          />
        </div>
      </Card>

      {/* ── Four Dimensions Breakdown & Strengths/Weaknesses ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
        {/* Dimensions */}
        <Card>
          <CardHeader title="Course Dimensions" />
          <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {dimensions.map((dim) => (
              <div key={dim.key}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                  <span style={{ fontSize: "13.5px", fontWeight: "500", color: C.textPrimary, display: "flex", alignItems: "center", gap: "6px" }}>
                    <i className={`ti ${dim.icon}`} style={{ color: C.accent, fontSize: "15px" }} />
                    {dim.label}
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: dim.has_data ? C.textPrimary : C.textMuted }}>
                    {dim.has_data ? `${Math.round(dim.score)}%` : "No data yet"}
                  </span>
                </div>
                <div style={{ height: "7px", background: C.subtleBg, borderRadius: "5px", overflow: "hidden", border: `1px solid ${C.border}` }}>
                  <div
                    style={{
                      height: "100%",
                      width: dim.has_data ? `${Math.min(100, Math.max(4, dim.score))}%` : "0%",
                      background: !dim.has_data ? "transparent" : dim.score >= 75 ? C.successText : dim.score >= 50 ? C.warningText : C.dangerText,
                      borderRadius: "5px",
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Strengths & Focus Areas */}
        <Card>
          <CardHeader title="Highlights & Focus Areas" />
          <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {strongest_area ? (
              <div style={{ background: C.successBg, border: `1px solid ${C.successBorder}`, borderRadius: "8px", padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <i className="ti ti-trophy" style={{ color: C.successText, fontSize: "16px" }} />
                  <span style={{ fontSize: "13px", fontWeight: "700", color: C.successText }}>
                    Strongest Dimension: {strongest_area.label}
                  </span>
                </div>
                <p style={{ fontSize: "12.5px", color: C.textPrimary, margin: 0 }}>
                  You are scoring <strong>{Math.round(strongest_area.score)}%</strong> here — your top performing area. Keep the positive momentum!
                </p>
              </div>
            ) : (
              <div style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px 14px" }}>
                <p style={{ fontSize: "12.5px", color: C.textMuted, margin: 0 }}>
                  Complete more course activities to unlock your strongest performance badge.
                </p>
              </div>
            )}

            {weakest_area ? (
              <div style={{ background: C.warningBg, border: `1px solid ${C.warningBorder}`, borderRadius: "8px", padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <i className="ti ti-target" style={{ color: C.warningText, fontSize: "16px" }} />
                  <span style={{ fontSize: "13px", fontWeight: "700", color: C.warningText }}>
                    Highest Leverage Improvement: {weakest_area.label}
                  </span>
                </div>
                <p style={{ fontSize: "12.5px", color: C.textPrimary, margin: 0 }}>
                  Scoring <strong>{Math.round(weakest_area.score)}%</strong>. Targeting this specific dimension gives you the highest return on score growth.
                </p>
              </div>
            ) : (
              <div style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px 14px" }}>
                <p style={{ fontSize: "12.5px", color: C.textMuted, margin: 0 }}>
                  All evaluated dimensions are currently balanced within healthy spreads.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Actionable AI Insights ── */}
      <Card>
        <CardHeader title="Actionable Insights & Recommendations" count={insights.length} />
        <div style={{ padding: "10px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {insights.length === 0 ? (
            <p style={{ fontSize: "13px", color: C.textMuted, padding: "16px 0", textAlign: "center" }}>
              No immediate concerns or alerts. Keep up the solid performance!
            </p>
          ) : (
            insights.map((item, idx) => {
              const cfg = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.info;
              return (
                <div
                  key={idx}
                  style={{
                    background: cfg.bg,
                    border: `1px solid ${cfg.border}`,
                    borderLeft: `4px solid ${cfg.text}`,
                    borderRadius: "8px",
                    padding: "12px 16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "13.5px", fontWeight: "700", color: cfg.text, display: "flex", alignItems: "center", gap: "6px" }}>
                      <i className={`ti ${cfg.icon}`} />
                      {item.title}
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", color: cfg.text, letterSpacing: "0.04em" }}>
                      {item.category}
                    </span>
                  </div>
                  <p style={{ fontSize: "13px", color: C.textPrimary, margin: "0 0 6px", lineHeight: "1.5" }}>
                    {item.detail}
                  </p>
                  {item.recommended_action && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", paddingTop: "6px", borderTop: `1px dashed ${cfg.border}` }}>
                      <i className="ti ti-bulb" style={{ color: cfg.text, fontSize: "14px" }} />
                      <span style={{ fontSize: "12px", fontWeight: "500", color: C.textSecondary }}>
                        <strong>Action:</strong> {item.recommended_action}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}

// ── KPI Card Helper ──
function KpiCard({ label, value, badge, subtext, icon }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "9px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", fontWeight: "500", color: C.textSecondary }}>{label}</span>
        {icon && <i className={`ti ${icon}`} style={{ fontSize: "16px", color: C.textMuted }} />}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "2px 0" }}>
        <span style={{ fontSize: "22px", fontWeight: "800", color: C.textPrimary, letterSpacing: "-0.02em" }}>{value}</span>
        {badge}
      </div>
      {subtext && <span style={{ fontSize: "11px", color: C.textMuted }}>{subtext}</span>}
    </div>
  );
}

// ── Series Toggle Button ──
function SeriesToggleBtn({ active, label, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${color}18` : "transparent",
        color: active ? color : C.textSecondary,
        fontWeight: active ? "600" : "400",
        border: `1px solid ${active ? color : C.border}`,
        borderRadius: "6px",
        padding: "4px 10px",
        fontSize: "12px",
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        transition: "all 0.12s",
      }}
    >
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color }} />
      {label}
    </button>
  );
}

// ── Raw SVG Trend Chart ──
function SvgTrendChart({ periods, seriesData, seriesKey, hoveredIndex, onHover }) {
  const width = 800;
  const height = 220;
  const padding = { top: 20, right: 30, bottom: 40, left: 45 };

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Filter valid points
  const points = periods.map((p, i) => {
    const val = seriesData[i];
    return {
      period: p,
      index: i,
      value: val,
      hasVal: val !== null && val !== undefined,
    };
  });

  const validPoints = points.filter((p) => p.hasVal);

  if (validPoints.length === 0) {
    return (
      <div style={{ height: "180px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.textMuted }}>
        <i className="ti ti-chart-line" style={{ fontSize: "28px", marginBottom: "8px", color: C.border }} />
        <span style={{ fontSize: "13px" }}>No activity points recorded in this timeframe yet.</span>
      </div>
    );
  }

  const getX = (index) => {
    if (periods.length <= 1) return padding.left + plotWidth / 2;
    return padding.left + (index / (periods.length - 1)) * plotWidth;
  };

  const getY = (val) => {
    const clamped = Math.max(0, Math.min(100, val));
    return padding.top + plotHeight - (clamped / 100) * plotHeight;
  };

  // Build SVG path
  const linePoints = validPoints.map((p) => `${getX(p.index)},${getY(p.value)}`).join(" ");

  // Build area fill polygon
  const firstPoint = validPoints[0];
  const lastPoint = validPoints[validPoints.length - 1];
  const areaPoints = `${getX(firstPoint.index)},${padding.top + plotHeight} ` +
    linePoints +
    ` ${getX(lastPoint.index)},${padding.top + plotHeight}`;

  const hoveredPoint = hoveredIndex !== null && hoveredIndex !== undefined ? points[hoveredIndex] : null;

  return (
    <div style={{ position: "relative", width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", minWidth: "460px", display: "block" }}
        onMouseLeave={() => onHover(null)}
      >
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.accent} stopOpacity="0.25" />
            <stop offset="100%" stopColor={C.accent} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {[0, 25, 50, 75, 100].map((level) => {
          const y = getY(level);
          return (
            <g key={level}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + plotWidth}
                y2={y}
                stroke={C.border}
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill={C.textMuted}
                fontFamily="inherit"
              >
                {level}%
              </text>
            </g>
          );
        })}

        {/* Shaded Area Fill */}
        <polygon points={areaPoints} fill="url(#chartGradient)" />

        {/* Main Line */}
        <polyline
          fill="none"
          stroke={C.accent}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={linePoints}
        />

        {/* Data points */}
        {points.map((p, i) => {
          const cx = getX(i);
          const cy = p.hasVal ? getY(p.value) : padding.top + plotHeight;
          const isHovered = hoveredIndex === i;

          return (
            <g
              key={i}
              onMouseEnter={() => onHover(i)}
              style={{ cursor: "pointer" }}
            >
              {/* Invisible touch target */}
              <circle cx={cx} cy={cy} r="14" fill="transparent" />

              {p.hasVal ? (
                <>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? "6" : "4"}
                    fill={isHovered ? C.accent : C.cardBg}
                    stroke={C.accent}
                    strokeWidth={isHovered ? "2.5" : "2"}
                  />
                  {isHovered && (
                    <circle cx={cx} cy={cy} r="9" fill="none" stroke={C.accent} strokeWidth="1" strokeOpacity="0.4" />
                  )}
                </>
              ) : (
                <circle cx={cx} cy={padding.top + plotHeight} r="2" fill={C.border} />
              )}

              {/* X Axis Labels */}
              <text
                x={cx}
                y={padding.top + plotHeight + 18}
                textAnchor="middle"
                fontSize="11"
                fill={isHovered ? C.textPrimary : C.textMuted}
                fontWeight={isHovered ? "700" : "400"}
                fontFamily="inherit"
              >
                {p.period.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover floating card */}
      {hoveredPoint && hoveredPoint.hasVal && (
        <div
          style={{
            position: "absolute",
            top: "10px",
            right: "20px",
            background: C.cardBg,
            border: `1.5px solid ${C.focusBorder}`,
            borderRadius: "8px",
            padding: "8px 12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            pointerEvents: "none",
            zIndex: 10,
            fontSize: "12px",
          }}
        >
          <p style={{ margin: "0 0 4px", fontWeight: "700", color: C.textPrimary }}>
            {hoveredPoint.period.label_long}
          </p>
          <div style={{ display: "flex", gap: "10px", color: C.textSecondary }}>
            <span>Score: <strong style={{ color: C.accent }}>{Math.round(hoveredPoint.value)}%</strong></span>
            <span>Attendance: <strong>{hoveredPoint.period.attendance?.rate_pct !== null ? `${Math.round(hoveredPoint.period.attendance?.rate_pct)}%` : "—"}</strong></span>
            <span>Completed: <strong>{hoveredPoint.period.assignments?.completion_pct !== null ? `${Math.round(hoveredPoint.period.assignments?.completion_pct)}%` : "—"}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
