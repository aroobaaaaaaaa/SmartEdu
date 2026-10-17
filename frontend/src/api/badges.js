// src/api/badges.js
import client from "./client";

export const getMyBadges = () => client.get("/badges/my-badges");
export const getAssignmentBadges = (assignmentId) => client.get(`/badges/assignment/${assignmentId}`);
