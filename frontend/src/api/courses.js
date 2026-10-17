// src/api/courses.js
import client from "./client";

export const createCourse = (data) => client.post("/courses/", data);
export const listTeachingCourses = () => client.get("/courses/teaching");
export const listEnrolledCourses = () => client.get("/courses/enrolled");
export const getCourse = (courseId) => client.get(`/courses/${courseId}`);
export const enrollStudent = (courseId, studentEmail) =>
  client.post(`/courses/${courseId}/enroll`, { student_email: studentEmail });
export const listRoster = (courseId) => client.get(`/courses/${courseId}/students`);
export const removeStudent = (courseId, studentId) =>
  client.delete(`/courses/${courseId}/students/${studentId}`);