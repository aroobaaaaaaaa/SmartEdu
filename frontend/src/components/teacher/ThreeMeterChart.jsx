// src/components/teacher/ThreeMeterChart.jsx
// Three independent circular meters — Option A from the design review.
// Deliberately NOT a concentric multi-ring chart: each metric reads on its
// own with no legend lookup required. Zero dependencies, same raw-SVG
// convention as the rest of the app.
import { C, T } from "../../theme";

const SIZE = 84;
const CENTER = SIZE / 2;
const RADIUS = 34;
const STROKE = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ENGAGEMENT_FILL = { low: 1 / 3, medium: 2 / 3, high: 1 };
const ENGAGEMENT_LABEL = { low: "Low", medium: "Medium", high: "High" };

function colorForGrade(pct) {
  if (pct >= 70) return C.successText;
  if (pct >= 40) return C.warningText;
  return C.dangerText;
}

function colorForAttendance(pct) {
  if (pct >= 75) return C.successText;
  if (pct >= 50) return C.warningText;
  return C.dangerText;
}

function Meter({ fraction, color, valueLabel, subLabel, hasData = true }) {
  const filled = Math.max(0, Math.min(1, fraction));
  const dash = CIRCUMFERENCE * filled;
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: "84px", height: "84px" }}>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke={C.subtleBg} strokeWidth={STROKE} />
        {hasData && filled > 0 && (
          <circle
            cx={CENTER} cy={CENTER} r={RADIUS}
            fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
          />
        )}
        <text x={CENTER} y={CENTER + 5} textAnchor="middle" style={{ fontSize: hasData ? "18px" : "14px", fontWeight: "700", fill: C.textPrimary, fontFamily: "inherit" }}>
          {hasData ? valueLabel : "—"}
        </text>
      </svg>
      <p style={{ fontSize: "12.5px", color: C.textSecondary, margin: "6px 0 0" }}>{subLabel}</p>
    </div>
  );
}

/**
 * @param {number|null} gradeAverage   0-100, null if nothing graded yet
 * @param {number|null} attendanceRate 0-1, null if no sessions marked yet
 * @param {"low"|"medium"|"high"} chatbotEngagementLevel
 */
export default function ThreeMeterChart({ gradeAverage, attendanceRate, chatbotEngagementLevel }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
      <Meter
        hasData={gradeAverage !== null}
        fraction={(gradeAverage ?? 0) / 100}
        color={colorForGrade(gradeAverage ?? 0)}
        valueLabel={`${Math.round(gradeAverage ?? 0)}%`}
        subLabel="Grade average"
      />
      <Meter
        hasData={attendanceRate !== null}
        fraction={attendanceRate ?? 0}
        color={colorForAttendance((attendanceRate ?? 0) * 100)}
        valueLabel={`${Math.round((attendanceRate ?? 0) * 100)}%`}
        subLabel="Attendance rate"
      />
      <Meter
        hasData
        fraction={ENGAGEMENT_FILL[chatbotEngagementLevel] ?? 0}
        color={C.infoText}
        valueLabel={ENGAGEMENT_LABEL[chatbotEngagementLevel] ?? "—"}
        subLabel="Chatbot engagement"
      />
    </div>
  );
}