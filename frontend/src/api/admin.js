// src/api/admin.js
import client from "./client";

export const createUser = (data) => client.post("/admin/users", data);
export const listUsers = (role) => client.get("/admin/users", { params: role ? { role } : {} });
export const deactivateUser = (userId) => client.patch(`/admin/users/${userId}/deactivate`);
export const activateUser = (userId) => client.patch(`/admin/users/${userId}/activate`);

export const createCourse = (data) => client.post("/admin/courses", data);
export const listAllCourses = () => client.get("/admin/courses");
export const deleteCourse = (courseId) => client.delete(`/admin/courses/${courseId}`);
export const listCourseStudents = (courseId) => client.get(`/admin/courses/${courseId}/students`);

export const assignTeacher = (courseId, teacherEmail) =>
  client.post(`/admin/courses/${courseId}/assign-teacher`, { teacher_email: teacherEmail });
export const unassignTeacher = (courseId, teacherId) =>
  client.delete(`/admin/courses/${courseId}/assign-teacher/${teacherId}`);

export const enrollStudent = (courseId, studentEmail) =>
  client.post(`/admin/courses/${courseId}/enroll`, { student_identifier: studentEmail });

export const unenrollStudent = (courseId, studentId) =>
  client.delete(`/admin/courses/${courseId}/enroll/${studentId}`);

export const deleteUser = (userId) => client.delete(`/admin/users/${userId}`);
export const resendSetupEmail = (userId) => client.post(`/admin/users/${userId}/resend-setup-email`);