// src/api/attendance.js
import client from "./client";

export const createSession = (courseId, data) =>
  client.post(`/attendance/${courseId}/sessions`, data);

export const listSessions = (courseId) =>
  client.get(`/attendance/${courseId}/sessions`);

export const markAttendance = (sessionId, records) =>
  client.post(`/attendance/sessions/${sessionId}/mark`, { records });

export const getSessionRecords = (sessionId) =>
  client.get(`/attendance/sessions/${sessionId}/records`);

export const getAttendanceSummary = (courseId) =>
  client.get(`/attendance/${courseId}/summary`);

export const deleteSession = (sessionId) =>
  client.delete(`/attendance/sessions/${sessionId}`);
