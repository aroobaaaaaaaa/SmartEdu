// src/pages/admin/AdminUsers.jsx
import { useState, useEffect } from "react";
import Layout, { PageShell, Card, Btn, Alert, Input } from "../../components/Layout";
import * as adminApi from "../../api/admin";
import { getErrorMessage } from "../../utils/errorMessage";
import { C, T } from "../../theme";

export default function AdminUsers() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ full_name: "", email: "", role: "student", registration_number: "" });
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [filter, setFilter]     = useState("all");

  const load = () => {
    setLoading(true);
    adminApi.listUsers()
      .then(({ data }) => setUsers(data))
      .catch((err) => setError(getErrorMessage(err, "Could not load users.")))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (form.role === "student" && !form.registration_number.trim()) {
      setError("Registration number is required for student accounts."); return;
    }
    try {
      const { data } = await adminApi.createUser({
        email: form.email, full_name: form.full_name, role: form.role,
        ...(form.role === "student" ? { registration_number: form.registration_number.trim() } : {}),
      });
      setSuccess(data.message || "Account created.");
      setForm({ full_name: "", email: "", role: "student", registration_number: "" });
      setShowForm(false); load();
    } catch (err) { setError(getErrorMessage(err, "Could not create account.")); }
  };

  const act = async (fn, errMsg) => {
    setError("");
    try { await fn(); load(); } catch (err) { setError(getErrorMessage(err, errMsg)); }
  };

  const visible = users.filter((u) => filter === "all" ? u.role !== "admin" : u.role === filter);

  return (
    <Layout>
      <PageShell
        title="Users"
        subtitle={`${users.filter((u) => u.role !== "admin").length} accounts`}
        action={
          <Btn onClick={() => { setShowForm(!showForm); setError(""); setSuccess(""); }}>
            <i className={`ti ${showForm ? "ti-x" : "ti-plus"}`} style={{ fontSize: "15px" }} />
            {showForm ? "Cancel" : "New account"}
          </Btn>
        }
      >
        <Alert variant="error">{error}</Alert>
        <Alert variant="success">{success}</Alert>

        {/* Create form */}
        {showForm && (
          <Card style={{ padding: "22px", marginBottom: "20px" }}>
            <p style={{ fontSize: "16px", fontWeight: "600", color: C.textPrimary, margin: "0 0 18px" }}>Create new account</p>

            {/* Role toggle */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", ...T.formLabel, color: C.textSecondary, marginBottom: "8px" }}>Role</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {["student", "teacher"].map((r) => (
                  <button key={r} type="button" onClick={() => setForm({ ...form, role: r, registration_number: "" })}
                    style={{ padding: "10px", borderRadius: "7px", border: `1.5px solid ${form.role === r ? C.primary : C.border}`, background: form.role === r ? C.primary : C.cardBg, color: form.role === r ? C.primaryText : C.textSecondary, fontSize: "14px", fontWeight: form.role === r ? "600" : "400", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreate}>
              <Input label="Full name" required placeholder="e.g. Arooba Malik" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              <Input label="Email address" required type="email" placeholder="e.g. student@alpha.edu.pk" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              {form.role === "student" && (
                <Input label="Registration number" required placeholder="e.g. BCS-F21-123" value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} />
              )}
              <div style={{ background: C.infoBg, border: `1px solid ${C.infoBorder}`, borderRadius: "7px", padding: "11px 13px", marginBottom: "16px", fontSize: "14px", color: C.infoText, display: "flex", gap: "9px", alignItems: "flex-start" }}>
                <i className="ti ti-mail" style={{ fontSize: "16px", flexShrink: 0, marginTop: "1px" }} />
                A setup email will be sent. The account is locked until the user sets their password.
              </div>
              <Btn type="submit" size="lg" style={{ width: "100%", justifyContent: "center" }}>
                <i className="ti ti-send" style={{ fontSize: "15px" }} />Create account & send email
              </Btn>
            </form>
          </Card>
        )}

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
          {["all", "student", "teacher"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "6px 14px", borderRadius: "6px", border: `1px solid ${filter === f ? C.primary : C.border}`, fontSize: "13px", fontWeight: filter === f ? "600" : "400", cursor: "pointer", fontFamily: "inherit", background: filter === f ? C.primary : C.cardBg, color: filter === f ? C.primaryText : C.textSecondary, textTransform: "capitalize" }}>
              {f === "all" ? "All users" : `${f}s`}
            </button>
          ))}
        </div>

        {/* Table — horizontally scrollable on small screens */}
        <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            {loading ? (
              <div style={{ padding: "48px", textAlign: "center", color: C.textMuted, ...T.bodyText }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ padding: "48px", textAlign: "center", color: C.textMuted, ...T.bodyText }}>No users found.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "640px" }}>
                <thead>
                  <tr style={{ background: C.subtleBg, borderBottom: `1px solid ${C.border}` }}>
                    {["Name", "Email", "Reg. No.", "Role", "Status", ""].map((h) => (
                      <th key={h} style={{ padding: "11px 16px", textAlign: "left", ...T.tableHeader, color: C.textMuted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((u, i) => (
                    <tr key={u.id} style={{ borderBottom: i < visible.length - 1 ? `1px solid ${C.border}` : "none", background: i % 2 === 1 ? C.subtleBg : C.cardBg }}>
                      <td style={{ padding: "13px 16px", ...T.tableCell, fontWeight: "600", color: C.textPrimary }}>{u.full_name}</td>
                      <td style={{ padding: "13px 16px", ...T.tableCell, color: C.textSecondary }}>{u.email}</td>
                      <td style={{ padding: "13px 16px", ...T.tableCell, color: C.textMuted, fontFamily: "monospace" }}>{u.registration_number || (u.role === "student" ? "—" : "")}</td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ ...T.badge, padding: "3px 9px", borderRadius: "5px", background: u.role === "teacher" ? C.successBg : C.infoBg, color: u.role === "teacher" ? C.successText : C.infoText, border: `1px solid ${u.role === "teacher" ? C.successBorder : C.infoBorder}`, textTransform: "capitalize" }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        {!u.has_set_password
                          ? <span style={{ ...T.badge, padding: "3px 9px", borderRadius: "5px", background: C.warningBg, color: C.warningText, border: `1px solid ${C.warningBorder}` }}>Pending email</span>
                          : u.is_active
                          ? <span style={{ ...T.badge, padding: "3px 9px", borderRadius: "5px", background: C.successBg, color: C.successText, border: `1px solid ${C.successBorder}` }}>Active</span>
                          : <span style={{ ...T.badge, padding: "3px 9px", borderRadius: "5px", background: C.subtleBg, color: C.textMuted, border: `1px solid ${C.border}` }}>Deactivated</span>
                        }
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          {!u.has_set_password && (
                            <button onClick={() => act(async () => { const { data } = await adminApi.resendSetupEmail(u.id); setSuccess(data.message || "Email resent."); }, "Could not resend.")} style={{ fontSize: "13px", color: C.accent, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontWeight: "500" }}>Resend</button>
                          )}
                          {u.has_set_password && (
                            u.is_active
                              ? <button onClick={() => act(() => adminApi.deactivateUser(u.id), "Could not deactivate.")} style={{ fontSize: "13px", color: C.warningText, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontWeight: "500" }}>Deactivate</button>
                              : <button onClick={() => act(() => adminApi.activateUser(u.id), "Could not activate.")} style={{ fontSize: "13px", color: C.successText, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontWeight: "500" }}>Activate</button>
                          )}
                          <button onClick={() => { if (!confirm(`Delete ${u.full_name}'s account permanently?`)) return; act(() => adminApi.deleteUser(u.id), "Could not delete."); }} style={{ fontSize: "13px", color: C.dangerText, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontWeight: "500" }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </PageShell>
    </Layout>
  );
}