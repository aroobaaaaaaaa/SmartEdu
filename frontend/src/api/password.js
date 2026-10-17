// src/api/password.js
import client from "./client";

export const forgotPassword = (email) =>
  client.post("/password/forgot", { email });

export const setPassword = (token, newPassword) =>
  client.post("/password/set", { token, new_password: newPassword });

export const changePassword = (currentPassword, newPassword) =>
  client.post("/password/change", {
    current_password: currentPassword,
    new_password: newPassword,
  });