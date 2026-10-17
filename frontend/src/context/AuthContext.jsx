// src/context/AuthContext.jsx
import { createContext, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as authApi from "../api/auth";

const AuthContext = createContext(null);

const HOME_BY_ROLE = { admin: "/admin", teacher: "/teacher", student: "/student" };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const navigate = useNavigate(); // ← this line must be here

  const loginUser = async (email, password) => {
    const { data } = await authApi.login({ email, password });
    const userData = {
      id: data.user_id,
      fullName: data.full_name,
      email: data.email || email,
      role: data.role,
    };
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
    navigate(HOME_BY_ROLE[userData.role] || "/login", { replace: true });
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login", { replace: true });
  };

  return (
    <AuthContext.Provider value={{ user, loginUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);