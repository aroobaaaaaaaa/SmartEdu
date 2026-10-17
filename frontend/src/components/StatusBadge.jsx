// src/components/StatusBadge.jsx
const STYLES = {
  processing: "bg-[#FBF3DC] text-[#8A6D1D]",
  indexed: "bg-[#E3F0E8] text-[#1F4E3D]",
  failed: "bg-[#FBEAE8] text-[#9B3A30]",
};

const LABELS = {
  processing: "Processing…",
  indexed: "Ready",
  failed: "Failed",
};

export default function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${STYLES[status] || STYLES.processing}`}>
      {LABELS[status] || status}
    </span>
  );
}