// src/api/assignments.js
import client from "./client";

export const createAssignment = (courseId, data) =>
  client.post(`/assignments/${courseId}`, data);
export const listAssignments = (courseId) => client.get(`/assignments/${courseId}`);

export const getAssignmentDetail = (assignmentId) =>
  client.get(`/assignments/detail/${assignmentId}`);

export const submitAssignment = (assignmentId, file) => {
  const formData = new FormData();
  formData.append("file", file);
  return client.post(`/assignments/${assignmentId}/submit`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const getSubmissionStatus = (submissionId) =>
  client.get(`/assignments/submissions/${submissionId}`);

export const listSubmissions = (assignmentId) =>
  client.get(`/assignments/${assignmentId}/submissions`);

export const getAiEvaluation = (submissionId) =>
  client.get(`/assignments/submissions/${submissionId}/ai-evaluation`);

export const reviewSubmission = (submissionId, data) =>
  client.post(`/assignments/submissions/${submissionId}/review`, data);

export const getFinalGrade = (submissionId) =>
  client.get(`/assignments/submissions/${submissionId}/grade`);

export const getMySubmissionForAssignment = (assignmentId) =>
  client.get(`/assignments/${assignmentId}/my-submission`);

export const deleteAssignment = (assignmentId) => client.delete(`/assignments/${assignmentId}`);

export const extendDeadline = (assignmentId, newDueDate, reason) =>
  client.put(`/assignments/${assignmentId}/extend-deadline`, { new_due_date: newDueDate, reason });

export const getDeadlineHistory = (assignmentId) =>
  client.get(`/assignments/${assignmentId}/deadline-history`);

export const getAssignmentBadges = (assignmentId) =>
  client.get(`/assignments/${assignmentId}/badges`);

export const viewSubmissionFile = async (submissionId) => {
  try {
    const response = await client.get(`/assignments/submissions/${submissionId}/file`, { responseType: "blob" });
    const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
    window.open(blobUrl, "_blank");
  } catch (err) {
    alert(err.response?.status === 404 ? "File not found." : "Couldn't open this file.");
  }
};

export const downloadSubmissionFile = async (submissionId, filename = "submission.pdf") => {
  try {
    const response = await client.get(`/assignments/submissions/${submissionId}/file`, { responseType: "blob" });
    const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    alert(err.response?.status === 404 ? "File not found." : "Couldn't download this file.");
  }
};

export const deleteMySubmission = (submissionId) =>
  client.delete(`/assignments/submissions/${submissionId}`);

export const getAssignmentRubric = (assignmentId) =>
  client.get(`/assignments/${assignmentId}/rubric`);

export const getPlagiarismReport = (submissionId) =>
  client.get(`/assignments/submissions/${submissionId}/plagiarism`);

export const recomputePlagiarism = (assignmentId) =>
  client.post(`/assignments/${assignmentId}/plagiarism/recompute`);

export const reprocessOcr = (submissionId) =>
  client.post(`/assignments/submissions/${submissionId}/reprocess-ocr`);