import { useState } from "react";
import { apiRequest } from "../../api";

export default function AdminDashboard({ token }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

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
    } catch (err) {
      setError(err.message || "Failed to create teacher account.");
    } finally {
      setLoading(false);
    }
  }

  return (
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
  );
}
