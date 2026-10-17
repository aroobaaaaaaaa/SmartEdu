// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherCourseDetail from "./pages/TeacherCourseDetail";
import StudentDashboard from "./pages/StudentDashboard";
import StudentCourseDetail from "./pages/StudentCourseDetail";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminCourses from "./pages/admin/AdminCourses";
import AdminCourseDetail from "./pages/admin/AdminCourseDetail";
import TeacherSubmissions from "./pages/TeacherSubmissions";
import ForgotPassword from "./pages/ForgotPassword";
import SetPassword from "./pages/SetPassword";
import AIHeroPreview from "./pages/AIHeroPreview";

const HOME_BY_ROLE = { admin: "/admin", teacher: "/teacher", student: "/student" };

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/preview/ai-hero" element={<AIHeroPreview />} />

      <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute requiredRole="admin"><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/courses" element={<ProtectedRoute requiredRole="admin"><AdminCourses /></ProtectedRoute>} />
      <Route path="/admin/courses/:courseId" element={<ProtectedRoute requiredRole="admin"><AdminCourseDetail /></ProtectedRoute>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/reset-password" element={<SetPassword />} />
      <Route path="/teacher" element={<ProtectedRoute requiredRole="teacher"><TeacherDashboard /></ProtectedRoute>} />
      <Route path="/teacher/courses/:courseId" element={<ProtectedRoute requiredRole="teacher"><TeacherCourseDetail /></ProtectedRoute>} />

      <Route path="/student" element={<ProtectedRoute requiredRole="student"><StudentDashboard /></ProtectedRoute>} />
      <Route path="/student/courses/:courseId" element={<ProtectedRoute requiredRole="student"><StudentCourseDetail /></ProtectedRoute>} />
      <Route path="/teacher/assignments/:assignmentId/submissions" element={
        <ProtectedRoute requiredRole="teacher"><TeacherSubmissions /></ProtectedRoute>
      } />
      <Route path="/" element={<HomeRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}