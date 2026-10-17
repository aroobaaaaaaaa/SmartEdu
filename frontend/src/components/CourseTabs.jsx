// src/components/CourseTabs.jsx
const TABS = [
  { id: "materials", label: "Lecture Materials" },
  { id: "assignments", label: "Assignments" },
  { id: "chatbot", label: "AI Assistant" },
];

// src/components/CourseTabs.jsx
export default function CourseTabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 border-b border-[#E8E4DC] mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            active === tab.id
              ? "border-[#1F4E3D] text-[#1F4E3D]"
              : "border-transparent text-[#6B6B6B] hover:text-[#1A1A1A]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}