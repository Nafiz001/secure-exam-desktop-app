import { useState } from "react";
import { apiRequest } from "../api";

export default function ChangePasswordPage({ token, onChanged, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest(
        "/auth/change-password",
        {
          method: "POST",
          body: JSON.stringify({ currentPassword, newPassword })
        },
        token
      );

      onChanged();
    } catch (err) {
      setError(err.message || "Failed to change password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page login-page-shell">
      <section className="auth-hero-panel">
        <p className="auth-badge">Secure Access Portal</p>
        <h1>Invigilo</h1>
        <p className="auth-hero-copy">For security, you must set a new password before continuing.</p>
      </section>

      <section className="card auth-card-wide">
        <h2>Change Your Password</h2>
        <p className="muted">This is your first login. Please set a new password to access your dashboard.</p>

        {error ? <div className="error-box">{error}</div> : null}

        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            <span>Current (Temporary) Password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <label>
            <span>New Password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <label>
            <span>Confirm New Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>

        <button className="secondary" onClick={onLogout} type="button">
          Cancel and Logout
        </button>
      </section>
    </main>
  );
}
