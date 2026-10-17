// src/utils/errorMessage.js
/**
 * Safely extracts a human-readable string from any Axios error response.
 * Handles three formats FastAPI can return:
 *   - Plain string:  { "detail": "Email already registered" }
 *   - Pydantic list: { "detail": [{ "msg": "...", "loc": [...] }] }
 *   - Unexpected:    anything else → fallback message
 */
export function getErrorMessage(err, fallback = "Something went wrong.") {
  const detail = err?.response?.data?.detail;

  if (!detail) return fallback;

  // Plain string — the common case
  if (typeof detail === "string") return detail;

  // Pydantic validation error — array of { msg, loc, type, input }
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        const field = e.loc?.filter((l) => l !== "body").join(" → ") || "";
        return field ? `${field}: ${e.msg}` : e.msg;
      })
      .join(". ");
  }

  return fallback;
}