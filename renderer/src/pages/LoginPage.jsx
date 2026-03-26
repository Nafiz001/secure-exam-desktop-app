import { useState } from "react";
import { apiRequest } from "../api";

const ROLE_OPTIONS = [
  {
    key: "admin",
    icon: "AD",
    label: "Admin Login",
    subtitle: "System control and oversight",
    cue: "Audit users, roles, and platform settings"
  },
  {
    key: "teacher",
    icon: "TR",
    label: "Teacher Login",
    subtitle: "Exam creation and management",
    cue: "Create papers, monitor participants, review submissions"
  },
  {
    key: "student",
    icon: "ST",
    label: "Student Login",
    subtitle: "Exam participation and submission",
    cue: "Join quickly and start your assessment flow"
  }
];

export default function LoginPage({ onLogin }) {
  const [activeRole, setActiveRole] = useState("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRoleLogin(event) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      const result = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password
        })
      });

      const loggedInRole = String(result?.data?.user?.role || "").toLowerCase();
      if (loggedInRole !== activeRole) {
        setError(`This account is ${loggedInRole || "unknown"}. Please choose the correct login card.`);
        return;
      }

      onLogin(result.data.token, result.data.user);
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRollLogin(event) {
    event.preventDefault();
    setError("");

    if (!rollNumber.trim()) {
      setError("Please enter your roll number.");
      return;
    }

    setLoading(true);
    try {
      const result = await apiRequest("/auth/student-roll-login", {
        method: "POST",
        body: JSON.stringify({
          roll_number: rollNumber.trim()
        })
      });

      onLogin(result.data.token, result.data.user);
    } catch (err) {
      setError(err.message || "Direct student login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    await handleRoleLogin(event);
  }

  return (
    <main className="page login-page-shell">
      <section className="auth-hero-panel">
        <p className="auth-badge">Secure Access Portal</p>
        <h1>Invigilo</h1>
        <p className="auth-hero-copy">
          Professional and streamlined access for Admin, Teacher, and Student roles.
          Fast, focused, and exam-ready.
        </p>
      </section>

      <section className="card auth-card-wide">
        <h2>Choose Login Type</h2>
        <p className="muted">Select your role and continue with the appropriate sign-in method.</p>

        <div className="role-grid">
          {ROLE_OPTIONS.map((role) => (
            <button
              key={role.key}
              type="button"
              className={`role-card ${activeRole === role.key ? "role-card-active" : ""}`}
              onClick={() => {
                setActiveRole(role.key);
                setError("");
              }}
            >
              <span className="role-icon" aria-hidden="true">{role.icon}</span>
              <strong>{role.label}</strong>
              <span>{role.subtitle}</span>
              <small>{role.cue}</small>
            </button>
          ))}
        </div>

        {error ? <div className="error-box">{error}</div> : null}

        <form className="form-stack" onSubmit={handleSubmit}>
          <h3 className="auth-form-title">{ROLE_OPTIONS.find((r) => r.key === activeRole)?.label}</h3>

          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : `Continue as ${activeRole.charAt(0).toUpperCase()}${activeRole.slice(1)}`}
          </button>
        </form>

        {activeRole === "student" ? (
          <div className="student-direct-panel">
            <h3>Student Direct Login</h3>
            <p className="muted small">
              No email/password required. Enter your roll number for direct access.
            </p>
            <form className="form-stack" onSubmit={handleRollLogin}>
              <label>
                <span>Roll Number</span>
                <input
                  type="text"
                  value={rollNumber}
                  onChange={(event) => setRollNumber(event.target.value)}
                  placeholder="e.g. 2007001"
                />
              </label>
              <button type="submit" disabled={loading}>
                {loading ? "Checking..." : "Login Using Roll Number"}
              </button>
            </form>
          </div>
        ) : null}
      </section>
    </main>
  );
}
