// src/components/BadgePill.jsx
import { useState } from "react";

const BADGE_CONFIGS = {
  first_submitter: {
    icon: "ti-rocket",
    title: "First Submitter",
    bg: "#EFF6FF",
    border: "#BFDBFE",
    text: "#1D4ED8",
    gradient: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
  },
  high_achiever: {
    icon: "ti-trophy",
    title: "High Achiever",
    bg: "#FEF3C7",
    border: "#FDE68A",
    text: "#B45309",
    gradient: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
  },
  perfect_score: {
    icon: "ti-star",
    title: "Perfect Score",
    bg: "#D1FAE5",
    border: "#A7F3D0",
    text: "#047857",
    gradient: "linear-gradient(135deg, #10B981 0%, #047857 100%)",
  },
  consistent_performer: {
    icon: "ti-flame",
    title: "Consistent Performer",
    bg: "#F3E8FF",
    border: "#E9D5FF",
    text: "#7E22CE",
    gradient: "linear-gradient(135deg, #A855F7 0%, #7E22CE 100%)",
  },
  top_contributor: {
    icon: "ti-award",
    title: "Top Contributor",
    bg: "#CFFAFE",
    border: "#A5F3FC",
    text: "#0E7490",
    gradient: "linear-gradient(135deg, #06B6D4 0%, #0E7490 100%)",
  },
};

export default function BadgePill({ badge, size = "md", showTooltip = true }) {
  const [hovered, setHovered] = useState(false);
  const cfg = BADGE_CONFIGS[badge.code] || {
    icon: badge.badge_icon || "ti-award",
    title: badge.title || "Achievement",
    bg: "#F3F4F6",
    border: "#E5E7EB",
    text: "#374151",
    gradient: "linear-gradient(135deg, #6B7280 0%, #374151 100%)",
  };

  const isSmall = size === "sm";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: isSmall ? "4px" : "6px",
        padding: isSmall ? "2px 7px" : "4px 10px",
        borderRadius: "20px",
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.text,
        fontSize: isSmall ? "11px" : "12px",
        fontWeight: "600",
        cursor: "pointer",
        transition: "all 0.15s ease",
        transform: hovered ? "translateY(-1px)" : "none",
        boxShadow: hovered ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
      }}
    >
      <div
        style={{
          width: isSmall ? "16px" : "20px",
          height: isSmall ? "16px" : "20px",
          borderRadius: "50%",
          background: cfg.gradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          flexShrink: 0,
        }}
      >
        <i className={`ti ${cfg.icon}`} style={{ fontSize: isSmall ? "10px" : "12px" }} />
      </div>

      <span>{cfg.title}</span>

      {showTooltip && hovered && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1E293B",
            color: "#F8FAFC",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "11px",
            lineHeight: "1.4",
            whiteSpace: "nowrap",
            zIndex: 100,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontWeight: "700", marginBottom: "2px" }}>{cfg.title}</div>
          <div style={{ opacity: 0.9 }}>{badge.description || "Earned achievement"}</div>
          {badge.earned_at && (
            <div style={{ fontSize: "10px", opacity: 0.7, marginTop: "4px" }}>
              Earned {new Date(badge.earned_at).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
