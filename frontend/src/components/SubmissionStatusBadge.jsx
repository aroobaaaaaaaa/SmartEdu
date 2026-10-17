// src/components/SubmissionStatusBadge.jsx
const STYLES = {
  processing: "bg-[#FBF3DC] text-[#8A6D1D]",
  extracted: "bg-[#FBF3DC] text-[#8A6D1D]",
  ai_evaluated: "bg-[#E3EEF5] text-[#1F4E6D]",
  teacher_reviewed: "bg-[#E3F0E8] text-[#1F4E3D]",
  failed: "bg-[#FBEAE8] text-[#9B3A30]",
};

const LABELS = {
  processing: "Processing…",
  extracted: "Extracting text…",
  ai_evaluated: "Awaiting teacher review",
  teacher_reviewed: "Graded",
  failed: "Failed",
};

export default function SubmissionStatusBadge({ status }) {
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${STYLES[status] || STYLES.processing}`}>
      {LABELS[status] || status}
    </span>
  );
}