import client from "./client";

export const uploadDocument = (courseId, file) => {
  const formData = new FormData();
  formData.append("file", file);

  return client.post(`/documents/${courseId}/upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const listDocuments = (courseId) =>
  client.get(`/documents/${courseId}`);

export const deleteDocument = (courseId, documentId) =>
  client.delete(`/documents/${courseId}/${documentId}`);


// Add these to src/api/documents.js alongside existing functions
export const viewDocument = async (courseId, docId) => {
  const response = await client.get(
    `/documents/${courseId}/${docId}/download`,
    { responseType: "blob" }
  );
  const url = URL.createObjectURL(response.data);
  window.open(url, "_blank");
};

export const downloadDocument = async (courseId, docId, filename) => {
  const response = await client.get(
    `/documents/${courseId}/${docId}/download`,
    { responseType: "blob" }
  );
  const url = URL.createObjectURL(response.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "document.pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};