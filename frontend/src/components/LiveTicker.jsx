// src/components/LiveTicker.jsx
import { useState, useEffect, useRef } from "react";
import { C } from "../theme";

export default function LiveTicker({ items = [] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (items.length <= 1 || isPaused) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 5000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [items.length, isPaused]);

  if (!items || items.length === 0) return null;

  const currentItem = items[currentIndex];

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % items.length);
  };

  const getTypeStyle = (type) => {
    switch (type) {
      case "deadline":
        return { bg: C.dangerBg, border: C.dangerBorder, text: C.dangerText, icon: "ti-alarm" };
      case "announcement":
        return { bg: C.warningBg, border: C.warningBorder, text: C.warningText, icon: "ti-speakerphone" };
      case "lecture":
        return { bg: C.accentTint, border: C.border, text: C.accentText, icon: "ti-file-text" };
      case "badge":
        return { bg: C.successBg, border: C.successBorder, text: C.successText, icon: "ti-award" };
      default:
        return { bg: C.subtleBg, border: C.border, text: C.textSecondary, icon: "ti-bell" };
    }
  };

  const style = getTypeStyle(currentItem.type);

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: "10px",
        padding: "14px 18px",
        marginBottom: "22px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
        position: "relative",
        overflow: "hidden",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
        
        {/* Left Icon & Text Content */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "8px",
              background: style.bg,
              border: `1px solid ${style.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <i className={`ti ${currentItem.icon || style.icon}`} style={{ fontSize: "19px", color: style.text }} />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
              {currentItem.badge && (
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: "700",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    padding: "2px 7px",
                    borderRadius: "4px",
                    background: style.bg,
                    color: style.text,
                    border: `1px solid ${style.border}`,
                    flexShrink: 0,
                  }}
                >
                  {currentItem.badge}
                </span>
              )}
              <h4
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: C.textPrimary,
                  margin: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {currentItem.title}
              </h4>
            </div>

            {currentItem.subtitle && (
              <p
                style={{
                  fontSize: "12px",
                  color: C.textMuted,
                  margin: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {currentItem.subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right Actions & Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
          {currentItem.onAction && (
            <button
              onClick={currentItem.onAction}
              className="btn-interactive"
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: C.accentText,
                background: C.subtleBg,
                border: `1px solid ${C.border}`,
                borderRadius: "6px",
                padding: "6px 12px",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {currentItem.actionText || "View"}
              <i className="ti ti-arrow-right" style={{ fontSize: "12px" }} />
            </button>
          )}

          {/* Navigation Controls */}
          {items.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button
                onClick={handlePrev}
                title="Previous update"
                style={{
                  background: "none",
                  border: `1px solid ${C.border}`,
                  borderRadius: "50%",
                  width: "24px",
                  height: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: C.textSecondary,
                  padding: 0,
                }}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: "12px" }} />
              </button>

              <div style={{ display: "flex", gap: "4px", padding: "0 4px" }}>
                {items.map((_, idx) => (
                  <span
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    style={{
                      width: idx === currentIndex ? "14px" : "6px",
                      height: "6px",
                      borderRadius: "3px",
                      background: idx === currentIndex ? C.accent : C.border,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                title="Next update"
                style={{
                  background: "none",
                  border: `1px solid ${C.border}`,
                  borderRadius: "50%",
                  width: "24px",
                  height: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: C.textSecondary,
                  padding: 0,
                }}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: "12px" }} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
