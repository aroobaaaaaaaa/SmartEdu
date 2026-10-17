// src/theme.js
// SmartEdu · Alpha College — Concept A "Executive Premium"
// Single source of truth. No dark mode.

export const C = {
  // ── Surfaces ──────────────────────────────────────────────────────
  pageBg:       "var(--page-bg)",
  cardBg:       "var(--card-bg)",
  subtleBg:     "var(--subtle-bg)",
  border:       "var(--border)",
  borderStrong: "var(--border-strong)",

  // ── Text ──────────────────────────────────────────────────────────
  textPrimary:   "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textMuted:     "var(--text-muted)",

  // ── Brand — Alpha charcoal + red ──────────────────────────────────
  primary:       "var(--primary)",
  primaryText:   "var(--primary-text)",
  primaryHover:  "var(--primary-hover)",

  accent:        "var(--accent)",
  accentHover:   "var(--accent-hover)",
  accentTint:    "var(--accent-tint)",
  accentText:    "var(--accent-text)",

  // ── AI Brand Highlights — Crimson & Silver Metallic ───────────────
  aiGlowRed:     "var(--ai-glow-red)",
  aiGlowCrimson: "var(--ai-glow-crimson)",
  aiGlowSilver:  "var(--ai-glow-silver)",
  aiHeroBg:      "var(--ai-hero-bg)",
  aiCardBg:      "var(--ai-card-bg)",
  aiBorder:      "var(--ai-border)",

  // ── Motion & Animation Easing Tokens ──────────────────────────────
  transitionFast: "0.15s ease",
  transitionBase: "0.25s cubic-bezier(0.16, 1, 0.3, 1)",
  transitionSlow: "0.4s cubic-bezier(0.16, 1, 0.3, 1)",

  // ── Sidebar — dark field ──────────────────────────────────────────
  sidebarBg:        "var(--sidebar-bg)",
  sidebarBorder:    "var(--sidebar-border)",
  sidebarText:      "var(--sidebar-text)",
  sidebarTextHover: "rgba(255,255,255,0.75)",
  sidebarActive:    "var(--sidebar-active)",
  sidebarActiveBg:  "var(--sidebar-active-bg)",
  sidebarMuted:     "var(--sidebar-muted)",

  // ── Inputs ────────────────────────────────────────────────────────
  inputBg:      "var(--input-bg)",
  inputFocus:   "var(--input-focus)",
  focusBorder:  "var(--focus-border)",

  // ── Semantic ──────────────────────────────────────────────────────
  successBg:     "var(--success-bg)",
  successText:   "var(--success-text)",
  successBorder: "var(--success-border)",

  warningBg:     "var(--warning-bg)",
  warningText:   "var(--warning-text)",
  warningBorder: "var(--warning-border)",

  dangerBg:      "var(--danger-bg)",
  dangerText:    "var(--danger-text)",
  dangerBorder:  "var(--danger-border)",

  infoBg:        "var(--info-bg)",
  infoText:      "var(--info-text)",
  infoBorder:    "var(--info-border)",

  // ── Stat card accent bars (left border) ───────────────────────────
  statCourses:  "var(--stat-courses)",
  statTeachers: "var(--stat-teachers)",
  statStudents: "var(--stat-students)",
  statPending:  "var(--stat-pending)",

  // ── Misc ──────────────────────────────────────────────────────────
  footerText: "var(--text-muted)",
};

// Role badge colours
export const ROLE_COLORS = {
  admin:   { bg: "var(--subtle-bg)",  text: "var(--text-primary)" },
  teacher: { bg: "var(--success-bg)", text: "var(--success-text)" },
  student: { bg: "var(--info-bg)",    text: "var(--info-text)" },
};

// ── Typography scale — University ERP, spacious & readable ────────────────
export const T = {
  pageTitle:      { fontSize: "28px", fontWeight: "700", letterSpacing: "-0.03em", lineHeight: "1.2" },
  pageSubtitle:   { fontSize: "14px", fontWeight: "500", letterSpacing: "0.04em", textTransform: "uppercase" },
  sectionHeading: { fontSize: "16px", fontWeight: "700", letterSpacing: "-0.01em" },
  cardTitle:      { fontSize: "15px", fontWeight: "600" },
  navItem:        { fontSize: "14px", fontWeight: "400" },
  formLabel:      { fontSize: "14px", fontWeight: "500" },
  inputText:      { fontSize: "15px" },
  buttonText:     { fontSize: "14px", fontWeight: "600", letterSpacing: "0.01em" },
  tableHeader:    { fontSize: "11px", fontWeight: "700", letterSpacing: "0.07em", textTransform: "uppercase" },
  tableCell:      { fontSize: "14px" },
  badge:          { fontSize: "11px", fontWeight: "600" },
  statValue:      { fontSize: "32px", fontWeight: "700", letterSpacing: "-0.04em", lineHeight: "1" },
  statLabel:      { fontSize: "11px", fontWeight: "700", letterSpacing: "0.07em", textTransform: "uppercase" },
  statSub:        { fontSize: "12px", fontWeight: "400" },
  bodyText:       { fontSize: "14px", lineHeight: "1.6" },
  caption:        { fontSize: "12px" },
  tiny:           { fontSize: "11px" },
};