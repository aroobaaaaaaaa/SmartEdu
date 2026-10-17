// src/components/teacher/PerformanceMetricCards.jsx
// Modern KPI-card visualization for the three headline student metrics —
// deliberately a different visual language from the earlier ring-chart
// iterations: icon + big number + slim linear progress bar, the pattern
// used by most professional analytics dashboards. Reads at a glance with
// no interpretation needed, scales cleanly to mobile (cards stack via
// grid auto-fit rather than needing separate breakpoints).
import { C, T } from "../../theme";

const ENGAGEMENT_FILL = { low: 1 / 3, medium: 2 / 3, high: 1 };
const ENGAGEMENT_LABEL = { low: "Low", medium: "Medium", high: "High" };

function bandColor(pct, goodAt = 70, okAt = 40) {
  if (pct >= goodAt) return { text: C.successText, bg: C.successBg, border: C.successBorder };
  if (pct >= okAt) return { text: C.warningText, bg: C.warningBg, border: C.warningBorder };
  return { text: C.dangerText, bg: C.dangerBg, border: C.dangerBorder };
}

function MetricCard({ icon, label, value, hasData, fraction, band }) {
  const c = hasData ? band : { text: C.textMuted, bg: C.subtleBg, border: C.border };
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className={`ti ${icon}`} style={{ fontSize: "16px", color: c.text }} />
        </div>
        <span style={{ fontSize: "12.5px", fontWeight: "600", color: C.textSecondary }}>{label}</span>
      </div>
      <p style={{ fontSize: "26px", fontWeight: "700", color: C.textPrimary, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
        {hasData ? value : "—"}
      </p>
      <div style={{ height: "5px", borderRadius: "3px", background: C.subtleBg, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.round((hasData ? fraction : 0) * 100)}%`, background: c.text, borderRadius: "3px", transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}

/**
 * @param {number|null} gradeAverage   0-100, null if nothing graded yet
 * @param {number|null} attendanceRate 0-1, null if no sessions marked yet
 * @param {"low"|"medium"|"high"} chatbotEngagementLevel
 */
export default function PerformanceMetricCards({ gradeAverage, attendanceRate, chatbotEngagementLevel }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
      <MetricCard
        icon="ti-report"
        label="Grade average"
        hasData={gradeAverage !== null}
        value={`${Math.round(gradeAverage ?? 0)}%`}
        fraction={(gradeAverage ?? 0) / 100}
        band={bandColor(gradeAverage ?? 0)}
      />
      <MetricCard
        icon="ti-calendar-check"
        label="Attendance rate"
        hasData={attendanceRate !== null}
        value={`${Math.round((attendanceRate ?? 0) * 100)}%`}
        fraction={attendanceRate ?? 0}
        band={bandColor((attendanceRate ?? 0) * 100, 75, 50)}
      />
      <MetricCard
        icon="ti-message-chatbot"
        label="Chatbot engagement"
        hasData
        value={ENGAGEMENT_LABEL[chatbotEngagementLevel] ?? "—"}
        fraction={ENGAGEMENT_FILL[chatbotEngagementLevel] ?? 0}
        band={{ text: C.infoText, bg: C.infoBg, border: C.infoBorder }}
      />
    </div>
  );
}