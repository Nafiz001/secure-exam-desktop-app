import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../api";
import { useModal } from "../../components/modals/ModalProvider";

function formatDateTime(dateValue) {
  if (!dateValue) return "N/A";
  return new Date(dateValue).toLocaleString();
}

export default function AdminDashboard({ token }) {
  const { showAlert, showConfirm } = useModal();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [teachers, setTeachers] = useState([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [resetTargetId, setResetTargetId] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  const loadTeachers = useCallback(async () => {
    setLoadingTeachers(true);
    try {
      const result = await apiRequest("/auth/teachers", {}, token);
      setTeachers(result.data.teachers || []);
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to load teacher accounts." });
    } finally {
      setLoadingTeachers(false);
    }
  }, [showAlert, token]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  async function handleCreateTeacher(event) {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!name.trim() || !email.trim() || !password) {
      setError("Name, email, and initial password are required.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest(
        "/auth/register",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            password,
            role: "teacher"
          })
        },
        token
      );

      setSuccessMessage(
        `Teacher account created for ${email.trim()}. Share the initial password with them — they will be required to change it on first login.`
      );
      setName("");
      setEmail("");
      setPassword("");
      await loadTeachers();
    } catch (err) {
      setError(err.message || "Failed to create teacher account.");
    } finally {
      setLoading(false);
    }
  }

  function openResetPasswordFor(teacherId) {
    setResetTargetId(teacherId);
    setResetPasswordValue("");
  }

  function cancelResetPassword() {
    setResetTargetId(null);
    setResetPasswordValue("");
  }

  async function handleResetPassword(event, teacher) {
    event.preventDefault();

    if (!resetPasswordValue || resetPasswordValue.length < 6) {
      await showAlert({ title: "Validation", message: "Temporary password must be at least 6 characters." });
      return;
    }

    const confirmed = await showConfirm({
      title: "Reset Password",
      message: `Set a new temporary password for ${teacher.name} (${teacher.email})? Their current password will stop working immediately, and they'll be required to set a new one on next login.`,
      confirmText: "Reset Password",
      cancelText: "Cancel"
    });
    if (!confirmed) return;

    setResettingPassword(true);
    try {
      await apiRequest(
        `/auth/teachers/${teacher.id}/reset-password`,
        {
          method: "PUT",
          body: JSON.stringify({ newPassword: resetPasswordValue })
        },
        token
      );

      await showAlert({
        title: "Password Reset",
        message: `Temporary password set for ${teacher.name}. Share it with them — they'll be required to change it on next login.`
      });
      cancelResetPassword();
      await loadTeachers();
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to reset password." });
    } finally {
      setResettingPassword(false);
    }
  }

  return (
    <div className="content-stack">
      <section className="card">
        <h2>Admin Panel</h2>
        <p className="muted">Create teacher accounts with an initial password. Teachers must change it on first login.</p>

        {error ? <div className="error-box">{error}</div> : null}
        {successMessage ? <div className="card">{successMessage}</div> : null}

        <form className="form-stack" onSubmit={handleCreateTeacher}>
          <label>
            <span>Teacher Name</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>

          <label>
            <span>Teacher Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>

          <label>
            <span>Initial Password</span>
            <input
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Set a temporary password"
              required
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Teacher Account"}
          </button>
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Teacher Accounts</h2>
            <p className="muted">Passwords are hashed and never visible here. Use "Reset Password" if a teacher forgets theirs.</p>
          </div>
          <button className="secondary" onClick={loadTeachers} disabled={loadingTeachers}>
            Refresh
          </button>
        </div>

        {loadingTeachers ? <p className="muted">Loading teacher accounts...</p> : null}
        {!loadingTeachers && teachers.length === 0 ? <p className="muted">No teacher accounts created yet.</p> : null}

        {!loadingTeachers && teachers.length > 0 ? (
          <ul className="list teacher-list">
            {teachers.map((teacher) => (
              <li key={teacher.id} className="teacher-list-item">
                <strong>{teacher.name}</strong>
                <span>{teacher.email}</span>
                <span>
                  <span className={`teacher-chip ${teacher.must_change_password ? "teacher-chip-wait" : "teacher-chip-done"}`}>
                    {teacher.must_change_password ? "Password reset pending" : "Active"}
                  </span>
                  {" "}Created: {formatDateTime(teacher.created_at)}
                </span>

                {resetTargetId === teacher.id ? (
                  <form className="form-stack" onSubmit={(event) => handleResetPassword(event, teacher)}>
                    <label>
                      <span>New Temporary Password</span>
                      <input
                        type="text"
                        value={resetPasswordValue}
                        onChange={(event) => setResetPasswordValue(event.target.value)}
                        placeholder="Set a new temporary password"
                        required
                      />
                    </label>
                    <div className="actions-row teacher-actions">
                      <button type="submit" disabled={resettingPassword}>
                        {resettingPassword ? "Resetting..." : "Confirm Reset"}
                      </button>
                      <button className="secondary btn-inline" type="button" onClick={cancelResetPassword}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="actions-row teacher-actions">
                    <button className="secondary btn-inline" type="button" onClick={() => openResetPasswordFor(teacher.id)}>
                      Reset Password
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
