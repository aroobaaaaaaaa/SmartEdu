// src/api/client.js
import axios from "axios";

const client = axios.create({
  baseURL: "http://localhost:8000/api",
});

// Attach the JWT to every request automatically, if we have one
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the backend ever says 401 (expired/invalid token), force logout
// instead of leaving the user stuck on a broken page
// src/api/client.js
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthEndpoint = error.config?.url?.includes("/auth/login") || error.config?.url?.includes("/auth/register");

    if (error.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default client;