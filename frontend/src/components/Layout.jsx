// src/components/Layout.jsx
// Concept A — Executive Premium
// Sidebar: full charcoal black, red SE logomark, white nav text
// Mobile: sidebar hidden, hamburger top bar shown
// Tablet: icon-only collapsed sidebar
// Desktop: full sidebar with label text

import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import ChangePasswordModal from "./ChangePasswordModal";
import ProfileModal from "./ProfileModal";
import * as coursesApi from "../api/courses";
import { C, ROLE_COLORS, T } from "../theme";

const NAV = {
  admin: [
    { to: "/admin",         icon: "ti-layout-dashboard", label: "Dashboard" },
    { to: "/admin/users",   icon: "ti-users",            label: "Users"      },
    { to: "/admin/courses", icon: "ti-books",            label: "Courses"    },
  ],
  student: [
    { to: "/student", icon: "ti-layout-dashboard", label: "Dashboard" },
  ],
};

// Teacher course sub-nav tabs — mirrors TeacherCourseDetail TABS
const TEACHER_COURSE_TABS = [
  { tab: "materials",   icon: "ti-file-text",       label: "Lectures"    },
  { tab: "assignments", icon: "ti-clipboard-list",   label: "Assignments" },
  { tab: "students",    icon: "ti-users",             label: "Students"    },
  { tab: "attendance",  icon: "ti-calendar-event",     label: "Attendance"  },
  { tab: "analytics",   icon: "ti-chart-line",         label: "Analytics"   },
];

// Student course sub-nav tabs — mirrors StudentCourseDetail tabs
const STUDENT_COURSE_TABS = [
  { tab: "materials",   icon: "ti-file-text",       label: "Lectures"    },
  { tab: "assignments", icon: "ti-clipboard-list",   label: "Assignments" },
  { tab: "progress",    icon: "ti-chart-line",      label: "My Progress" },
  { tab: "chatbot",     icon: "ti-message-chatbot",  label: "AI Assistant" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const params    = useParams();
  const [showPw, setShowPw]           = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [collapsed, setCollapsed]     = useState(false);
  const [mobileOpen, setMobileOpen]   = useState(false);

  // Detect whether we're on a teacher course detail page
  const teacherCourseId = user?.role === "teacher" ? params.courseId : null;
  // Detect whether we're on a student course detail page
  const studentCourseId = user?.role === "student"  ? params.courseId : null;

  // Active tab from URL search param
  const searchParams  = new URLSearchParams(location.search);
  const activeTab     = searchParams.get("tab") || "materials";

  const navItems = NAV[user?.role] || [];
  const rc = ROLE_COLORS[user?.role] || ROLE_COLORS.student;
  const initials = (user?.fullName || "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const AlphaLogo = ({ size = "md" }) => {
    const s = size === "sm"
      ? { wrap: { padding: "5px 8px", borderRadius: "5px" }, red: { fontSize: "11px", padding: "3px 6px", borderRadius: "3px" }, txt: { fontSize: "7px", paddingLeft: "6px" } }
      : { wrap: { padding: "7px 10px", borderRadius: "6px" }, red: { fontSize: "13px", padding: "4px 7px", borderRadius: "4px" }, txt: { fontSize: "8px", paddingLeft: "7px" } };
    return (
      <div style={{ display: "inline-flex", background: "#111111", alignItems: "center", ...s.wrap }}>
        <span style={{ background: C.accent, color: "#fff", fontWeight: "800", lineHeight: 1, letterSpacing: "0.01em", ...s.red }}>alpha</span>
        <span style={{ color: "#fff", fontWeight: "700", lineHeight: "1.25", letterSpacing: "0.05em", textTransform: "uppercase", ...s.txt }}>ALPHA<br />EDUCATION<br />NETWORK</span>
      </div>
    );
  };

  const sidebarContent = (iconOnly = false) => (
    <>
      {/* Logo block */}
      <div style={{ padding: iconOnly ? "16px 0 14px" : "20px 16px 18px", borderBottom: `1px solid ${C.sidebarBorder}`, display: "flex", flexDirection: "column", alignItems: iconOnly ? "center" : "flex-start", gap: "8px" }}>
        {iconOnly ? (
          <div style={{ width: "32px", height: "32px", background: C.accent, borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: "800", color: "#fff" }}>SE</span>
          </div>
        ) : (
          <>
            <AlphaLogo size="md" />
            <span style={{ ...T.tiny, fontWeight: "600", color: C.sidebarMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>SmartEdu LMS</span>
          </>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: "2px" }}>

        {/* ── Teacher contextual nav ── */}
        {user?.role === "teacher" ? (
          <>
            {/* Dashboard always visible */}
            <NavLink to="/teacher" end onClick={() => setMobileOpen(false)}
              style={({ isActive }) => ({
                display: "flex", alignItems: "center",
                gap: iconOnly ? 0 : "11px",
                padding: iconOnly ? "11px" : "10px 12px",
                borderRadius: "7px", textDecoration: "none",
                ...T.navItem,
                fontWeight: isActive ? "500" : "400",
                color: isActive ? C.sidebarActive : C.sidebarText,
                background: isActive ? C.sidebarActiveBg : "transparent",
                justifyContent: iconOnly ? "center" : "flex-start",
                transition: "background 0.12s, color 0.12s",
              })}
            >
              <i className="ti ti-layout-dashboard" style={{ fontSize: "18px", flexShrink: 0 }} />
              {!iconOnly && <span>Dashboard</span>}
            </NavLink>

            {/* Course sub-nav — only when on a course detail page */}
            {teacherCourseId && !iconOnly && (
              <>
                <div style={{ padding: "10px 12px 4px", marginTop: "6px" }}>
                  <p style={{ fontSize: "10px", fontWeight: "700", color: C.sidebarMuted, letterSpacing: "0.09em", textTransform: "uppercase", margin: 0 }}>
                    Current course
                  </p>
                </div>

                {TEACHER_COURSE_TABS.map(({ tab, icon, label }) => {
                  const isActive = activeTab === tab;
                  return (
                    <button key={tab}
                      onClick={() => { navigate(`/teacher/courses/${teacherCourseId}?tab=${tab}`); setMobileOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: "11px",
                        padding: "10px 12px", borderRadius: "7px",
                        background: isActive ? C.sidebarActiveBg : "transparent",
                        border: "none",
                        borderLeft: isActive ? `3px solid ${C.accent}` : "3px solid transparent",
                        cursor: "pointer", fontFamily: "inherit",
                        ...T.navItem,
                        fontWeight: isActive ? "500" : "400",
                        color: isActive ? C.sidebarActive : C.sidebarText,
                        textAlign: "left", transition: "background 0.12s, color 0.12s",
                      }}
                    >
                      <i className={`ti ${icon}`} style={{ fontSize: "17px", flexShrink: 0 }} />
                      <span>{label}</span>
                    </button>
                  );
                })}

                <button
                  onClick={() => { navigate("/teacher"); setMobileOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: "9px", padding: "8px 12px", marginTop: "6px", borderRadius: "7px", background: "transparent", border: `1px dashed ${C.sidebarBorder}`, cursor: "pointer", fontFamily: "inherit", color: C.sidebarMuted, fontSize: "12px" }}
                >
                  <i className="ti ti-switch-horizontal" style={{ fontSize: "14px" }} />
                  <span>Switch course</span>
                </button>
              </>
            )}

            {/* Icon-only teacher course sub-nav */}
            {teacherCourseId && iconOnly && TEACHER_COURSE_TABS.map(({ tab, icon }) => {
              const isActive = activeTab === tab;
              return (
                <button key={tab}
                  onClick={() => navigate(`/teacher/courses/${teacherCourseId}?tab=${tab}`)}
                  title={tab}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "11px", borderRadius: "7px", background: isActive ? C.sidebarActiveBg : "transparent", border: "none", cursor: "pointer", color: isActive ? C.sidebarActive : C.sidebarText }}
                >
                  <i className={`ti ${icon}`} style={{ fontSize: "18px" }} />
                </button>
              );
            })}
          </>
        ) : user?.role === "student" ? (
          /* ── Student contextual nav ── */
          <>
            {/* Dashboard always visible */}
            <NavLink to="/student" end onClick={() => setMobileOpen(false)}
              style={({ isActive }) => ({
                display: "flex", alignItems: "center",
                gap: iconOnly ? 0 : "11px",
                padding: iconOnly ? "11px" : "10px 12px",
                borderRadius: "7px", textDecoration: "none",
                ...T.navItem,
                fontWeight: isActive ? "500" : "400",
                color: isActive ? C.sidebarActive : C.sidebarText,
                background: isActive ? C.sidebarActiveBg : "transparent",
                justifyContent: iconOnly ? "center" : "flex-start",
                transition: "background 0.12s, color 0.12s",
              })}
            >
              <i className="ti ti-layout-dashboard" style={{ fontSize: "18px", flexShrink: 0 }} />
              {!iconOnly && <span>Dashboard</span>}
            </NavLink>

            {/* Course sub-nav — only when on a course detail page */}
            {studentCourseId && !iconOnly && (
              <>
                <div style={{ padding: "10px 12px 4px", marginTop: "6px" }}>
                  <p style={{ fontSize: "10px", fontWeight: "700", color: C.sidebarMuted, letterSpacing: "0.09em", textTransform: "uppercase", margin: 0 }}>
                    Current course
                  </p>
                </div>

                {STUDENT_COURSE_TABS.map(({ tab, icon, label }) => {
                  const isActive = activeTab === tab;
                  return (
                    <button key={tab}
                      onClick={() => { navigate(`/student/courses/${studentCourseId}?tab=${tab}`); setMobileOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: "11px",
                        padding: "10px 12px", borderRadius: "7px",
                        background: isActive ? C.sidebarActiveBg : "transparent",
                        border: "none",
                        borderLeft: isActive ? `3px solid ${C.accent}` : "3px solid transparent",
                        cursor: "pointer", fontFamily: "inherit",
                        ...T.navItem,
                        fontWeight: isActive ? "500" : "400",
                        color: isActive ? C.sidebarActive : C.sidebarText,
                        textAlign: "left", transition: "background 0.12s, color 0.12s",
                      }}
                    >
                      <i className={`ti ${icon}`} style={{ fontSize: "17px", flexShrink: 0 }} />
                      <span>{label}</span>
                    </button>
                  );
                })}

                <button
                  onClick={() => { navigate("/student"); setMobileOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: "9px", padding: "8px 12px", marginTop: "6px", borderRadius: "7px", background: "transparent", border: `1px dashed ${C.sidebarBorder}`, cursor: "pointer", fontFamily: "inherit", color: C.sidebarMuted, fontSize: "12px" }}
                >
                  <i className="ti ti-switch-horizontal" style={{ fontSize: "14px" }} />
                  <span>Switch course</span>
                </button>
              </>
            )}

            {/* Icon-only student course sub-nav */}
            {studentCourseId && iconOnly && STUDENT_COURSE_TABS.map(({ tab, icon }) => {
              const isActive = activeTab === tab;
              return (
                <button key={tab}
                  onClick={() => navigate(`/student/courses/${studentCourseId}?tab=${tab}`)}
                  title={tab}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "11px", borderRadius: "7px", background: isActive ? C.sidebarActiveBg : "transparent", border: "none", cursor: "pointer", color: isActive ? C.sidebarActive : C.sidebarText }}
                >
                  <i className={`ti ${icon}`} style={{ fontSize: "18px" }} />
                </button>
              );
            })}
          </>
        ) : (
          /* ── Admin nav ── */
          navItems.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} end
              onClick={() => setMobileOpen(false)}
              style={({ isActive }) => ({
                display: "flex", alignItems: "center",
                gap: iconOnly ? 0 : "11px",
                padding: iconOnly ? "11px" : "10px 12px",
                borderRadius: "7px", textDecoration: "none",
                ...T.navItem,
                fontWeight: isActive ? "500" : "400",
                color: isActive ? C.sidebarActive : C.sidebarText,
                background: isActive ? C.sidebarActiveBg : "transparent",
                justifyContent: iconOnly ? "center" : "flex-start",
                transition: "background 0.12s, color 0.12s",
              })}
            >
              <i className={`ti ${icon}`} style={{ fontSize: "18px", flexShrink: 0 }} />
              {!iconOnly && <span>{label}</span>}
            </NavLink>
          ))
        )}
      </nav>

      {/* User + actions */}
      <div style={{ borderTop: `1px solid ${C.sidebarBorder}`, padding: "12px 8px" }}>
        {!iconOnly && (
          <div
            onClick={() => setShowProfile(true)}
            className="btn-interactive"
            title="Click to view profile details"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 12px",
              borderRadius: "7px",
              background: "rgba(255,255,255,0.05)",
              marginBottom: "6px",
              cursor: "pointer",
              transition: "background 0.15s ease",
            }}
          >
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: "12px", fontWeight: "700", color: "#fff" }}>{initials}</span>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: "13px", fontWeight: "500", color: "#fff", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.fullName}</p>
              <span style={{ ...T.tiny, fontWeight: "500", padding: "1px 6px", borderRadius: "20px", background: rc.bg, color: rc.text, textTransform: "capitalize" }}>{user?.role}</span>
            </div>
            <i className="ti ti-user" style={{ fontSize: "15px", color: C.sidebarMuted }} />
          </div>
        )}
        <SbBtn icon="ti-lock" label="Change password" iconOnly={iconOnly} onClick={() => setShowPw(true)} />
        <SbBtn icon="ti-logout" label="Sign out" iconOnly={iconOnly} danger onClick={() => { logout(); navigate("/login", { replace: true }); }} />
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", background: C.pageBg }}>

      {/* ── Desktop sidebar (≥1024px) ───────────────────────────── */}
      <aside className="desktop-sidebar" style={{
        width: collapsed ? "64px" : "232px",
        minHeight: "100vh",
        background: C.sidebarBg,
        display: "flex", flexDirection: "column",
        transition: "width 0.18s ease",
        flexShrink: 0,
        position: "sticky", top: 0, maxHeight: "100vh", overflowY: "auto",
      }}>
        {/* Collapse toggle */}
        <button onClick={() => setCollapsed(!collapsed)}
          style={{ position: "absolute", top: "14px", right: collapsed ? "50%" : "12px", transform: collapsed ? "translateX(50%)" : "none", background: "none", border: "none", cursor: "pointer", color: C.sidebarMuted, fontSize: "16px", padding: "2px", display: "flex", alignItems: "center", zIndex: 10, transition: "right 0.18s, transform 0.18s" }}>
          <i className={collapsed ? "ti ti-layout-sidebar-right" : "ti ti-layout-sidebar-left"} />
        </button>
        <div style={{ paddingTop: collapsed ? "0" : "0", display: "flex", flexDirection: "column", height: "100%" }}>
          {sidebarContent(collapsed)}
        </div>
      </aside>

      {/* ── Mobile top bar (<768px) ─────────────────────────────── */}
      <div className="mobile-topbar" style={{ display: "none", background: C.sidebarBg, position: "sticky", top: 0, zIndex: 100, alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.sidebarBorder}` }}>
        <AlphaLogo size="sm" />
        <button onClick={() => setMobileOpen(!mobileOpen)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: "22px", padding: "2px", display: "flex", alignItems: "center" }}>
          <i className={mobileOpen ? "ti ti-x" : "ti ti-menu-2"} />
        </button>
      </div>

      {/* ── Mobile drawer overlay ───────────────────────────────── */}
      {mobileOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
          <div style={{ width: "240px", background: C.sidebarBg, display: "flex", flexDirection: "column", overflowY: "auto" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.sidebarBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <AlphaLogo size="sm" />
              <button onClick={() => setMobileOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.sidebarMuted, fontSize: "20px", padding: "2px", display: "flex", alignItems: "center" }}>
                <i className="ti ti-x" />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>{sidebarContent(false)}</div>
          </div>
          <div style={{ flex: 1, background: "rgba(0,0,0,0.6)" }} onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </main>

      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} />}
      {showProfile && (
        <ProfileModal
          onClose={() => setShowProfile(false)}
          onChangePassword={() => setShowPw(true)}
          onLogout={() => { logout(); navigate("/login", { replace: true }); }}
        />
      )}

      <style>{`
        * { box-sizing: border-box; }
        @media (max-width: 767px) {
          .desktop-sidebar { display: none !important; }
          .mobile-topbar { display: flex !important; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .desktop-sidebar { width: 64px !important; }
        }
      `}</style>
    </div>
  );
}

function SbBtn({ icon, label, iconOnly, danger, onClick }) {
  return (
    <button onClick={onClick} title={label}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: iconOnly ? 0 : "10px", padding: "8px 12px", borderRadius: "6px", background: "none", border: "none", cursor: "pointer", color: danger ? "#F87171" : C.sidebarText, fontSize: "13px", fontFamily: "inherit", justifyContent: iconOnly ? "center" : "flex-start", marginBottom: "2px" }}>
      <i className={`ti ${icon}`} style={{ fontSize: "17px" }} />
      {!iconOnly && label}
    </button>
  );
}

// ── Course Switcher Dropdown in Header ─────────────────────────────────────

function CourseSwitcherDropdown() {
  const { user } = useAuth();
  const params = useParams();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const activeCourseId = params.courseId;
  const role = user?.role;

  useEffect(() => {
    if (role === "student") {
      coursesApi.listEnrolledCourses().then(res => setCourses(res.data || [])).catch(() => {});
    } else if (role === "teacher") {
      coursesApi.listTeachingCourses().then(res => setCourses(res.data || [])).catch(() => {});
    }
  }, [role]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!role || (role !== "student" && role !== "teacher") || courses.length === 0) {
    return null;
  }

  const activeCourse = courses.find(c => String(c.id) === String(activeCourseId));

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        className="btn-interactive"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 14px",
          borderRadius: "20px",
          background: C.subtleBg,
          border: `1px solid ${activeCourse ? C.accent : C.border}`,
          color: C.textPrimary,
          fontSize: "13px",
          fontWeight: "600",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
      >
        <i className="ti ti-books" style={{ fontSize: "16px", color: C.accent }} />
        <span style={{ maxWidth: "180px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {activeCourse ? activeCourse.name : "My Courses"}
        </span>
        <i className="ti ti-chevron-down" style={{ fontSize: "14px", color: C.textMuted, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
      </button>

      {open && (
        <div
          className="animate-slide-up"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            zIndex: 150,
            width: "260px",
            background: C.cardBg,
            borderRadius: "10px",
            border: `1px solid ${C.border}`,
            boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
            padding: "6px",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}` }}>
            <p style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
              Quick Course Switcher
            </p>
          </div>
          <div style={{ maxHeight: "240px", overflowY: "auto", padding: "4px 0" }}>
            {courses.map((c) => {
              const isSelected = String(c.id) === String(activeCourseId);
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setOpen(false);
                    if (role === "teacher") {
                      navigate(`/teacher/courses/${c.id}`);
                    } else {
                      navigate(`/student/courses/${c.id}`);
                    }
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    background: isSelected ? C.accentTint : "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    color: isSelected ? C.accentText : C.textPrimary,
                    fontSize: "13px",
                    fontWeight: isSelected ? "600" : "400",
                    transition: "background 0.12s ease",
                  }}
                >
                  <div style={{ minWidth: 0, paddingRight: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "600", display: "block", color: isSelected ? C.accentText : C.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.name}
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: "500", display: "block", color: C.textMuted }}>
                      {c.code}
                    </span>
                  </div>
                  {isSelected && <i className="ti ti-check" style={{ fontSize: "16px", color: C.accent }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Top Header Controls (Course Switcher + Theme Toggle + User Profile Clickable) ──

function TopHeaderControls({ onOpenProfile }) {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const rc = ROLE_COLORS[user?.role] || ROLE_COLORS.student;
  const initials = (user?.fullName || "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
      <CourseSwitcherDropdown />

      {/* Light / Dark Mode Toggle Button */}
      <button
        type="button"
        onClick={toggleTheme}
        title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        className="btn-interactive"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 13px",
          borderRadius: "20px",
          background: C.subtleBg,
          border: `1px solid ${C.border}`,
          color: C.textPrimary,
          fontSize: "13px",
          fontWeight: "600",
          cursor: "pointer",
          transition: "all 0.15s ease",
          boxShadow: "0 2px 6px rgba(0,0,0,0.04)"
        }}
      >
        <i className={`ti ${isDark ? "ti-sun" : "ti-moon"}`} style={{ fontSize: "16px", color: isDark ? "#F59E0B" : "#6366F1" }} />
        <span>{isDark ? "Light" : "Dark"}</span>
      </button>

      {/* Clickable Profile Card in Header */}
      {user && (
        <div
          onClick={onOpenProfile}
          className="btn-interactive"
          title="Click to view profile details"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 10px 4px 6px",
            borderRadius: "20px",
            background: C.subtleBg,
            border: `1px solid ${C.border}`,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#fff" }}>{initials}</span>
          </div>
          <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary, whiteSpace: "nowrap" }}>{user.fullName}</span>
          <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 7px", borderRadius: "12px", background: rc.bg, color: rc.text, textTransform: "capitalize", letterSpacing: "0.02em" }}>
            {user.role}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Shared page primitives ──────────────────────────────────────────────────

export function PageShell({ title, subtitle, action, children }) {
  const [showProfile, setShowProfile] = useState(false);
  const [showPw, setShowPw]           = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="animate-fade-in" style={{ padding: "clamp(20px, 4vw, 40px) clamp(16px, 4vw, 40px)", maxWidth: "1200px", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ ...T.pageTitle, color: C.textPrimary, margin: 0 }}>{title}</h1>
          {subtitle && <p style={{ ...T.pageSubtitle, color: C.textMuted, margin: "6px 0 0" }}>{subtitle}</p>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", flexShrink: 0 }}>
          <TopHeaderControls onOpenProfile={() => setShowProfile(true)} />
          {action && <div>{action}</div>}
        </div>
      </div>
      {children}

      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} />}
      {showProfile && (
        <ProfileModal
          onClose={() => setShowProfile(false)}
          onChangePassword={() => setShowPw(true)}
          onLogout={() => { logout(); navigate("/login", { replace: true }); }}
        />
      )}
    </div>
  );
}

export function Card({ children, style = {}, elevate = false }) {
  return (
    <div className={elevate ? "card-hover-elevate" : ""} style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, ...style }}>
      {children}
    </div>
  );
}

export function CardHeader({ title, count, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ ...T.cardTitle, color: C.textPrimary }}>{title}</span>
        {count !== undefined && (
          <span style={{ ...T.tiny, fontWeight: "600", padding: "2px 8px", borderRadius: "20px", background: C.subtleBg, color: C.textMuted }}>{count}</span>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function Btn({ children, onClick, variant = "primary", size = "md", disabled, type = "button", style = {} }) {
  const sizes = {
    sm: { padding: "6px 12px",  borderRadius: "6px",  fontSize: "13px" },
    md: { padding: "9px 16px",  borderRadius: "7px",  fontSize: "14px" },
    lg: { padding: "11px 20px", borderRadius: "8px",  fontSize: "14px" },
  };
  const variants = {
    primary:   { background: C.primary,    color: C.primaryText,   border: "none" },
    accent:    { background: C.accent,     color: "#fff",           border: "none" },
    secondary: { background: C.subtleBg,   color: C.textPrimary,   border: `1px solid ${C.border}` },
    danger:    { background: C.dangerBg,   color: C.dangerText,    border: `1px solid ${C.dangerBorder}` },
    ghost:     { background: "transparent",color: C.textSecondary, border: `1px solid ${C.border}` },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="btn-interactive"
      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: "600", fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, letterSpacing: "0.01em", transition: "all 0.15s ease", ...sizes[size], ...(variants[variant] || variants.primary), ...style }}>
      {children}
    </button>
  );
}

export function Badge({ children, variant = "neutral" }) {
  const v = {
    neutral: { bg: C.subtleBg,    txt: C.textMuted,     border: C.border },
    primary: { bg: "#F3F4F6",     txt: C.textPrimary,   border: C.border },
    accent:  { bg: C.accentTint,  txt: C.accentText,    border: C.dangerBorder },
    success: { bg: C.successBg,   txt: C.successText,   border: C.successBorder },
    warning: { bg: C.warningBg,   txt: C.warningText,   border: C.warningBorder },
    danger:  { bg: C.dangerBg,    txt: C.dangerText,    border: C.dangerBorder },
    info:    { bg: C.infoBg,      txt: C.infoText,      border: C.infoBorder },
  }[variant] || { bg: C.subtleBg, txt: C.textMuted, border: C.border };
  return (
    <span style={{ ...T.badge, padding: "3px 9px", borderRadius: "20px", whiteSpace: "nowrap", background: v.bg, color: v.txt, border: `1px solid ${v.border}` }}>
      {children}
    </span>
  );
}

export function Alert({ children, variant = "error" }) {
  if (!children) return null;
  const v = {
    error:   { bg: C.dangerBg,  txt: C.dangerText,  border: C.dangerBorder,  icon: "ti-alert-circle"   },
    success: { bg: C.successBg, txt: C.successText, border: C.successBorder, icon: "ti-circle-check"   },
    warning: { bg: C.warningBg, txt: C.warningText, border: C.warningBorder, icon: "ti-alert-triangle" },
    info:    { bg: C.infoBg,    txt: C.infoText,    border: C.infoBorder,    icon: "ti-info-circle"    },
  }[variant] || { bg: C.dangerBg, txt: C.dangerText, border: C.dangerBorder, icon: "ti-alert-circle" };
  return (
    <div style={{ ...T.bodyText, borderRadius: "7px", padding: "11px 14px", marginBottom: "16px", display: "flex", gap: "10px", alignItems: "flex-start", background: v.bg, color: v.txt, border: `1px solid ${v.border}` }}>
      <i className={`ti ${v.icon}`} style={{ fontSize: "17px", flexShrink: 0, marginTop: "1px" }} />
      <span>{children}</span>
    </div>
  );
}

export function Input({ label, required, hint, ...props }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      {label && (
        <label style={{ display: "block", ...T.formLabel, color: C.textSecondary, marginBottom: "6px" }}>
          {label}{required && <span style={{ color: C.accent, marginLeft: "3px" }}>*</span>}
        </label>
      )}
      <input {...props}
        style={{ width: "100%", background: C.inputBg, border: `1.5px solid transparent`, borderRadius: "7px", padding: "10px 13px", ...T.inputText, color: C.textPrimary, fontFamily: "inherit", outline: "none", ...props.style }}
        onFocus={(e) => { e.target.style.borderColor = C.focusBorder; e.target.style.background = C.inputFocus; e.target.style.boxShadow = "0 0 0 3px rgba(17,17,17,0.08)"; props.onFocus?.(e); }}
        onBlur={(e)  => { e.target.style.borderColor = "transparent"; e.target.style.background = C.inputBg; e.target.style.boxShadow = "none"; props.onBlur?.(e); }}
      />
      {hint && <p style={{ ...T.caption, color: C.textMuted, margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}

export function Select({ label, required, children, hint, ...props }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      {label && (
        <label style={{ display: "block", ...T.formLabel, color: C.textSecondary, marginBottom: "6px" }}>
          {label}{required && <span style={{ color: C.accent, marginLeft: "3px" }}>*</span>}
        </label>
      )}
      <div style={{ position: "relative" }}>
        <select {...props}
          style={{ width: "100%", appearance: "none", background: C.inputBg, border: `1.5px solid transparent`, borderRadius: "7px", padding: "10px 36px 10px 13px", ...T.inputText, color: C.textPrimary, fontFamily: "inherit", outline: "none", ...props.style }}>
          {children}
        </select>
        <div style={{ position: "absolute", right: "11px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.textMuted, fontSize: "15px" }}>
          <i className="ti ti-chevron-down" />
        </div>
      </div>
      {hint && <p style={{ ...T.caption, color: C.textMuted, margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}