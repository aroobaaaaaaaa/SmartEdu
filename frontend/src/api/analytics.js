// src/api/analytics.js
import client from "./client";

export const getCourseRisk = (courseId) =>
  client.get(`/analytics/${courseId}/risk`);

export const recomputeCourseRisk = (courseId) =>
  client.post(`/analytics/${courseId}/risk/recompute`);

export const getStudentProgress = (courseId, studentId, granularity = "weekly", periods = null) => {
  const params = { granularity };
  if (periods) params.periods = periods;
  return client.get(`/analytics/${courseId}/students/${studentId}/progress`, { params });
};

export const getMyProgress = (courseId, granularity = "weekly", periods = null) => {
  const params = { granularity };
  if (periods) params.periods = periods;
  return client.get(`/analytics/${courseId}/my-progress`, { params });
};

export const getCourseProgressOverview = (courseId, granularity = "weekly", periods = null) => {
  const params = { granularity };
  if (periods) params.periods = periods;
  return client.get(`/analytics/${courseId}/progress-overview`, { params });
};
