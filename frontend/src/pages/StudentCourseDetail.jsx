// src/pages/StudentCourseDetail.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";
import Layout, { PageShell, Card, CardHeader } from "../components/Layout";
import StudentAssignmentsPanel from "../components/student/AssignmentsPanel";
import StudentProgressPanel from "../components/student/StudentProgressPanel";
import * as coursesApi from "../api/courses";
import * as documentsApi from "../api/documents";
import * as chatApi from "../api/chat";
import { C } from "../theme";

export default function StudentCourseDetail() {
  const { courseId } = useParams();
  const location     = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const activeTab    = searchParams.get("tab") || "materials";

  const [course,    setCourse]    = useState(null);
  const [documents, setDocuments] = useState([]);

  // Chat state & Multi-Session Management
  const [sessionId, setSessionId] = useState(() => {
    return localStorage.getItem(`smartedu_session_${courseId}`) || `sess_${Date.now()}`;
  });
  const [sessions, setSessions]   = useState([]);
  const [messages,  setMessages]  = useState([]);
  const [input,    setInput]    = useState("");
  const [chatting, setChatting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText]   = useState("");

  const abortRef = useRef(null);
  const endRef   = useRef(null);

  const loadHistory = useCallback(async (targetSessionId) => {
    const sid = typeof targetSessionId === "string" ? targetSessionId : sessionId;
    try {
      const [histRes, sessRes] = await Promise.all([
        chatApi.getChatHistory(courseId, sid),
        chatApi.listChatSessions(courseId).catch(() => ({ data: [] })),
      ]);

      if (sessRes.data) setSessions(sessRes.data);

      if (histRes.data && histRes.data.length > 0) {
        setMessages(histRes.data.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.message,
          createdAt: m.created_at,
        })));
      } else {
        setMessages([
          { role: "assistant", content: "Ask me anything about this course's material, lectures, assignments, or grades." },
        ]);
      }
    } catch {
      setMessages([
        { role: "assistant", content: "Ask me anything about this course's material, lectures, assignments, or grades." },
      ]);
    }
  }, [courseId, sessionId]);

  useEffect(() => {
    coursesApi.getCourse(courseId).then(({ data }) => setCourse(data));
    documentsApi.listDocuments(courseId).then(({ data }) =>
      setDocuments(data.filter((d) => d.status === "indexed"))
    );
    loadHistory();
  }, [courseId, loadHistory]);

  // Always keep localStorage in sync with the active session, including the very
  // first auto-generated sessionId (which otherwise never got persisted, causing
  // a fresh session — and therefore empty history — on every app reopen).
  useEffect(() => {
    localStorage.setItem(`smartedu_session_${courseId}`, sessionId);
  }, [courseId, sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatting]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const handleNewChat = () => {
    const newSessId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    setSessionId(newSessId);
    localStorage.setItem(`smartedu_session_${courseId}`, newSessId);
    setMessages([
      { role: "assistant", content: "Ask me anything about this course's material, lectures, assignments, or grades." },
    ]);
    chatApi.listChatSessions(courseId).then(res => setSessions(res.data || [])).catch(() => {});
  };

  const handleSwitchSession = (newSessId) => {
    if (!newSessId || newSessId === sessionId) return;
    setSessionId(newSessId);
    localStorage.setItem(`smartedu_session_${courseId}`, newSessId);
    loadHistory(newSessId);
  };

  const handleDeleteSession = async (sessIdToDelete) => {
    if (!confirm("Delete this entire chat session?")) return;
    try {
      await chatApi.deleteChatSession(sessIdToDelete);
      if (sessIdToDelete === sessionId) {
        handleNewChat();
      } else {
        loadHistory(sessionId);
      }
    } catch {
      alert("Couldn't delete chat session.");
    }
  };

  const handleSend = async (textOverride) => {
    const rawText = typeof textOverride === "string" ? textOverride : input;
    const question = (rawText || "").trim();
    if (!question || chatting) return;
    if (typeof textOverride !== "string") setInput("");

    setMessages((prev) => [...prev, { role: "user", content: question, createdAt: new Date().toISOString() }]);
    setChatting(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "", createdAt: new Date().toISOString() }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await chatApi.sendMessageStream(Number(courseId), question, sessionId, (partialText) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            role: "assistant",
            content: partialText,
          };
          return updated;
        });
      }, controller.signal);
      // Quietly refresh sessions list in background without touching messages state
      chatApi.listChatSessions(courseId).then(res => setSessions(res.data || [])).catch(() => {});
    } catch (err) {
      if (err.name === "AbortError") {
        setMessages((prev) => {
          const updated = [...prev];
          const last    = updated[updated.length - 1];
          if (last.role === "assistant" && last.content === "") {
            updated[updated.length - 1] = {
              ...last,
              content:  "Generation stopped.",
              isStopped: true,
            };
          } else {
            updated[updated.length - 1] = { ...last, isStopped: true };
          }
          return updated;
        });
      } else {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role:    "assistant",
            content: err.response?.status === 403
              ? "You don't have access to this course's material."
              : "Something went wrong. Please try again.",
            isError: true,
          };
          return updated;
        });
      }
    } finally {
      abortRef.current = null;
      setChatting(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleDeleteMessage = async (msgId, index) => {
    if (msgId) {
      try {
        await chatApi.deleteChatMessage(msgId);
      } catch { /* ignore */ }
    }
    setMessages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleStartEdit = (msg) => {
    setEditingId(msg.id || msg.content);
    setEditText(msg.content);
  };

  const handleSaveEdit = async (msgObj, index) => {
    if (!editText.trim()) return;
    const newText = editText.trim();
    setEditingId(null);
    if (msgObj.id) {
      try {
        await chatApi.editChatMessage(msgObj.id, newText);
      } catch { /* ignore */ }
    }
    handleSend(newText);
  };

  if (!course) return (
    <Layout>
      <PageShell title="Loading…">
        <p style={{ color: C.textMuted, fontSize: "14px" }}>Fetching course details…</p>
      </PageShell>
    </Layout>
  );

  const tabLabel = {
    materials:   "Lectures",
    assignments: "Assignments",
    progress:    "My Progress",
    chatbot:     "AI Assistant",
  }[activeTab] || "Lectures";

  return (
    <Layout>
      <PageShell title={tabLabel} subtitle={`${course.name} · ${course.code}`}>

        {/* ── Lecture Materials ── */}
        {activeTab === "materials" && (
          <>
            {course.description && (
              <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "14px 18px", marginBottom: "20px" }}>
                <p style={{ fontSize: "14px", color: C.textSecondary, lineHeight: "1.6", margin: 0 }}>{course.description}</p>
              </div>
            )}
            <Card>
              <CardHeader title="Lecture Materials" count={documents.length} />
              <div style={{ padding: "8px 0" }}>
                {documents.length === 0 ? (
                  <div style={{ padding: "40px 20px", textAlign: "center" }}>
                    <i className="ti ti-file-upload" style={{ fontSize: "30px", color: C.border, display: "block", marginBottom: "10px" }} />
                    <p style={{ fontSize: "14px", color: C.textMuted, margin: 0 }}>No lecture materials uploaded yet.</p>
                  </div>
                ) : (
                  documents.map((doc, i) => (
                    <DocRow
                      key={doc.id} doc={doc} last={i === documents.length - 1}
                      onView={() => documentsApi.viewDocument(courseId, doc.id)}
                      onDownload={() => documentsApi.downloadDocument(courseId, doc.id, doc.filename)}
                    />
                  ))
                )}
              </div>
            </Card>
          </>
        )}

        {/* ── Assignments ── */}
        {activeTab === "assignments" && (
          <StudentAssignmentsPanel courseId={courseId} />
        )}

        {/* ── Progress Analytics ── */}
        {activeTab === "progress" && (
          <StudentProgressPanel courseId={courseId} />
        )}

        {/* ── AI Chatbot ── */}
        {activeTab === "chatbot" && (
          <div style={{ background: C.cardBg, borderRadius: "10px", border: `1px solid ${C.border}`, display: "flex", height: "calc(100vh - 200px)", minHeight: "460px", overflow: "hidden" }}>

            {/* ── Sidebar: New Chat + Chat History ── */}
            <div style={{ width: "260px", flexShrink: 0, display: "flex", flexDirection: "column", background: C.subtleBg, borderRight: `1px solid ${C.border}` }}>
              <div style={{ padding: "14px 14px 10px" }}>
                <button
                  onClick={handleNewChat}
                  className="btn-interactive"
                  style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "9px 12px", borderRadius: "7px", background: C.primary, border: "none", color: C.primaryText, fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit" }}
                >
                  <i className="ti ti-plus" style={{ fontSize: "14px" }} />
                  New Chat
                </button>
              </div>

              <div style={{ padding: "4px 14px 6px", fontSize: "11px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                History
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
                {sessions.length === 0 ? (
                  <div style={{ padding: "10px 8px", fontSize: "12px", color: C.textMuted, lineHeight: "1.5" }}>
                    No past conversations yet — start chatting and it'll show up here.
                  </div>
                ) : (
                  sessions.map((s) => {
                    const isActive = s.session_id === sessionId;
                    return (
                      <div
                        key={s.session_id}
                        onClick={() => handleSwitchSession(s.session_id)}
                        className="btn-interactive"
                        style={{
                          display: "flex", alignItems: "center", gap: "6px",
                          padding: "9px 10px", borderRadius: "8px", marginBottom: "3px",
                          cursor: "pointer",
                          background: isActive ? C.cardBg : "transparent",
                          border: `1px solid ${isActive ? C.border : "transparent"}`,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: "12.5px", fontWeight: isActive ? "700" : "500",
                            color: isActive ? C.textPrimary : C.textSecondary,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {s.title}
                          </div>
                          {s.last_updated && (
                            <div style={{ fontSize: "10.5px", color: C.textMuted, marginTop: "1px" }}>
                              {new Date(s.last_updated).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.session_id); }}
                          title="Delete this chat"
                          style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", padding: "3px", display: "inline-flex", flexShrink: 0 }}
                        >
                          <i className="ti ti-trash" style={{ fontSize: "13px" }} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── Main chat pane ── */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

              {/* Header */}
              <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "8px", background: C.subtleBg }}>
                <i className="ti ti-sparkles" style={{ fontSize: "18px", color: C.accent }} />
                <span style={{ fontSize: "14px", fontWeight: "700", color: C.textPrimary }}>SmartEdu AI Assistant</span>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>
                {messages.map((msg, i) => (
                  <MessageBubble
                    key={msg.id || i}
                    msg={msg}
                    index={i}
                    isEditing={editingId === (msg.id || msg.content)}
                    editText={editText}
                    setEditText={setEditText}
                    onStartEdit={() => handleStartEdit(msg)}
                    onSaveEdit={() => handleSaveEdit(msg, i)}
                    onCancelEdit={() => setEditingId(null)}
                    onDelete={() => handleDeleteMessage(msg.id, i)}
                  />
                ))}

                {/* Typing indicator — shown only while streaming AND no content yet */}
                {chatting && messages[messages.length - 1]?.content === "" && (
                  <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "12px" }}>
                    <AssistantAvatar />
                    <div style={{ background: C.subtleBg, borderRadius: "12px", borderBottomLeftRadius: "3px", padding: "12px 16px", display: "flex", gap: "8px", alignItems: "center", border: `1px solid ${C.border}` }}>
                      <i className="ti ti-sparkles" style={{ fontSize: "15px", color: C.accent, animation: "spin 2s linear infinite" }} />
                      <span style={{ fontSize: "13px", fontWeight: "600", color: C.textSecondary }}>AI is processing course materials…</span>
                      <div style={{ display: "flex", gap: "4px", marginLeft: "4px" }}>
                        {[0, 150, 300].map((delay) => (
                          <span key={delay} style={{ width: "6px", height: "6px", background: C.accent, borderRadius: "50%", display: "inline-block", animation: "bounce 1s infinite", animationDelay: `${delay}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={endRef} style={{ height: "20px" }} />
              </div>

              {/* Suggestion Chips */}
              {messages.length <= 2 && !chatting && (
                <div style={{ padding: "0 20px 12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[
                    "Summarize available lectures",
                    "What assignments are due?",
                    "How is plagiarism evaluated?",
                    "Who is the course instructor?"
                  ].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => handleSend(chip)}
                      className="btn-interactive"
                      style={{
                        background: C.subtleBg, border: `1px solid ${C.border}`,
                        borderRadius: "16px", padding: "6px 12px", fontSize: "12px",
                        color: C.textSecondary, cursor: "pointer", fontFamily: "inherit"
                      }}
                    >
                      💡 {chip}
                    </button>
                  ))}
                </div>
              )}

              {/* Input row */}
              <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", gap: "10px", alignItems: "center" }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !chatting && handleSend()}
                  placeholder="Ask about this course, lectures, or assignments…"
                  disabled={chatting}
                  style={{ flex: 1, background: C.inputBg, border: "1.5px solid transparent", borderRadius: "7px", padding: "10px 13px", fontSize: "14px", color: C.textPrimary, fontFamily: "inherit", outline: "none", opacity: chatting ? 0.6 : 1 }}
                  onFocus={(e) => { e.target.style.borderColor = C.focusBorder; e.target.style.background = C.inputFocus; e.target.style.boxShadow = "0 0 0 3px rgba(17,17,17,0.08)"; }}
                  onBlur={(e)  => { e.target.style.borderColor = "transparent"; e.target.style.background = C.inputBg; e.target.style.boxShadow = "none"; }}
                />

                {chatting ? (
                  <button
                    onClick={handleStop}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "10px 16px", borderRadius: "7px", border: `1.5px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.dangerText, fontSize: "14px", fontWeight: "600", fontFamily: "inherit", cursor: "pointer", flexShrink: 0, transition: "background 0.12s" }}
                  >
                    <i className="ti ti-player-stop-filled" style={{ fontSize: "14px" }} />Stop
                  </button>
                ) : (
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim()}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "10px 18px", borderRadius: "7px", background: C.primary, color: C.primaryText, border: "none", fontSize: "14px", fontWeight: "600", fontFamily: "inherit", cursor: !input.trim() ? "not-allowed" : "pointer", opacity: !input.trim() ? 0.4 : 1, flexShrink: 0 }}
                  >
                    <i className="ti ti-send" style={{ fontSize: "15px" }} />Send
                  </button>
                )}
              </div>
              <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }`}</style>
            </div>
          </div>
        )}
      </PageShell>
    </Layout>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AssistantAvatar() {
  return (
    <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: "8px", alignSelf: "flex-end" }}>
      <i className="ti ti-sparkles" style={{ fontSize: "13px", color: C.primaryText }} />
    </div>
  );
}

function MessageBubble({ msg, index, isEditing, editText, setEditText, onStartEdit, onSaveEdit, onCancelEdit, onDelete }) {
  const isUser = msg.role === "user";
  const [hovered, setHovered] = useState(false);

  const bubbleBg =
    isUser        ? C.primary  :
    msg.isError   ? C.dangerBg :
    C.subtleBg;

  const bubbleColor =
    isUser        ? C.primaryText    :
    msg.isError   ? C.dangerText     :
    C.textPrimary;

  const formattedTime = msg.createdAt
    ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: "14px", alignItems: "flex-end", gap: "8px", position: "relative" }}
    >
      {!isUser && <AssistantAvatar />}
      <div style={{ maxWidth: "70%" }}>

        {isEditing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: C.cardBg, border: `1.5px solid ${C.focusBorder}`, borderRadius: "10px", padding: "10px" }}>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={2}
              style={{ width: "100%", background: C.inputBg, border: "none", outline: "none", fontSize: "13px", color: C.textPrimary, fontFamily: "inherit", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
              <button onClick={onCancelEdit} style={{ background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "4px 8px", fontSize: "11px", color: C.textSecondary, cursor: "pointer" }}>Cancel</button>
              <button onClick={onSaveEdit} style={{ background: C.primary, border: "none", borderRadius: "5px", padding: "4px 10px", fontSize: "11px", color: C.primaryText, fontWeight: "600", cursor: "pointer" }}>Save & Resend</button>
            </div>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <div style={{
              borderRadius: "12px", padding: "11px 15px", fontSize: "14px", lineHeight: "1.6",
              background: bubbleBg, color: bubbleColor,
              borderBottomRightRadius: isUser ? "3px" : "12px",
              borderBottomLeftRadius: !isUser  ? "3px" : "12px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
            }}>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content}</p>
            </div>

            {/* Hover Actions: Edit & Delete */}
            {hovered && (
              <div style={{
                position: "absolute",
                top: "-10px",
                right: isUser ? "4px" : "auto",
                left: !isUser ? "4px" : "auto",
                display: "flex",
                gap: "4px",
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: "16px",
                padding: "2px 6px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                zIndex: 5
              }}>
                {isUser && (
                  <button onClick={onStartEdit} title="Edit & resend" style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, padding: "2px" }}>
                    <i className="ti ti-pencil" style={{ fontSize: "12px" }} />
                  </button>
                )}
                <button onClick={onDelete} title="Delete message" style={{ background: "none", border: "none", cursor: "pointer", color: C.dangerText, padding: "2px" }}>
                  <i className="ti ti-trash" style={{ fontSize: "12px" }} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Timestamp & Status */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", justifyContent: isUser ? "flex-end" : "flex-start", paddingLeft: !isUser ? "2px" : 0, paddingRight: isUser ? "2px" : 0 }}>
          {formattedTime && <span style={{ fontSize: "10px", color: C.textMuted }}>{formattedTime}</span>}
          {msg.isStopped && (
            <span style={{ fontSize: "10px", color: C.textMuted, display: "flex", alignItems: "center", gap: "3px" }}>
              <i className="ti ti-player-stop-filled" style={{ fontSize: "10px" }} />Stopped
            </span>
          )}
        </div>

      </div>
    </div>
  );
}

function DocRow({ doc, last, onView, onDownload }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "14px 20px",
        borderBottom: last ? "none" : `1px solid ${C.border}`,
        background: hovered ? C.subtleBg : C.cardBg,
        transition: "background 0.12s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: C.accentTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-file-type-pdf" style={{ fontSize: "20px", color: C.accent }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: "14px", fontWeight: "600", color: C.textPrimary, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.filename}
          </p>
          {doc.created_at && (
            <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>
              Added {new Date(doc.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        <button
          onClick={onView}
          title="View PDF lecture"
          className="btn-interactive"
          style={{
            fontSize: "13px",
            fontWeight: "500",
            color: C.textPrimary,
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: "6px",
            padding: "6px 12px",
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            whiteSpace: "nowrap",
          }}
        >
          <i className="ti ti-eye" style={{ fontSize: "14px" }} />
          View
        </button>

        <button
          onClick={onDownload}
          title="Download PDF lecture"
          className="btn-interactive"
          style={{
            fontSize: "13px",
            fontWeight: "500",
            color: C.textSecondary,
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: "6px",
            padding: "6px 12px",
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            whiteSpace: "nowrap",
          }}
        >
          <i className="ti ti-download" style={{ fontSize: "14px" }} />
          Download
        </button>
      </div>
    </div>
  );
}