import { useState } from "react";
import { apiRequest } from "../api";
import { useModal } from "../components/modals/ModalProvider";

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
  }
];

export default function LoginPage({ onLogin, onStudentJoin }) {
  const { showAlert } = useModal();
  const [activeRole, setActiveRole] = useState("teacher");
  const [authMode, setAuthMode] = useState("login"); // "login" | "create" (teacher only)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  function switchRole(role) {
    setActiveRole(role);
    setAuthMode("login");
    setError("");
  }

  async function handleForgotPassword() {
    await showAlert({
      title: "Forgot Password",
      message:
        activeRole === "teacher"
          ? "Teacher passwords can only be reset by an admin. Please contact your admin — they can set a new temporary password for your account from the Admin Panel."
          : "Please contact the system administrator to have your password reset."
    });
  }

  async function handleSubmit(event) {
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

  async function handleCreateAccount(event) {
    event.preventDefault();
    setError("");

    if (!signupName.trim() || !signupEmail.trim() || !signupPassword) {
      setError("Name, email, and password are required.");
      return;
    }
    if (signupPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const result = await apiRequest("/auth/register-teacher", {
        method: "POST",
        body: JSON.stringify({
          name: signupName.trim(),
          email: signupEmail.trim(),
          password: signupPassword
        })
      });

      onLogin(result.data.token, result.data.user);
    } catch (err) {
      setError(err.message || "Failed to create account.");
    } finally {
      setLoading(false);
    }
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
              onClick={() => switchRole(role.key)}
            >
              <span className="role-icon" aria-hidden="true">{role.icon}</span>
              <strong>{role.label}</strong>
              <span>{role.subtitle}</span>
              <small>{role.cue}</small>
            </button>
          ))}

          <button type="button" className="role-card" onClick={onStudentJoin}>
            <span className="role-icon" aria-hidden="true">ST</span>
            <strong>Student</strong>
            <span>Exam participation and submission</span>
            <small>No account needed — join with a room code</small>
          </button>
        </div>

        {error ? <div className="error-box">{error}</div> : null}

        {activeRole === "teacher" && authMode === "create" ? (
          <form className="form-stack" onSubmit={handleCreateAccount}>
            <h3 className="auth-form-title">Create Teacher Account</h3>

            <label>
              <span>Full Name</span>
              <input
                type="text"
                value={signupName}
                onChange={(event) => setSignupName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
              />
            </label>

            <label>
              <span>Email</span>
              <input
                type="email"
                value={signupEmail}
                onChange={(event) => setSignupEmail(event.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                required
              />
            </label>

            <label>
              <span>Password</span>
              <input
                type="password"
                value={signupPassword}
                onChange={(event) => setSignupPassword(event.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                required
              />
            </label>

            <label>
              <span>Confirm Password</span>
              <input
                type="password"
                value={signupConfirmPassword}
                onChange={(event) => setSignupConfirmPassword(event.target.value)}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                required
              />
            </label>

            <button type="submit" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </button>

            <button type="button" className="secondary" onClick={() => { setAuthMode("login"); setError(""); }}>
              Already have an account? Log in
            </button>
          </form>
        ) : (
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

            <button type="button" className="secondary" onClick={handleForgotPassword}>
              Forgot password?
            </button>

            {activeRole === "teacher" ? (
              <button type="button" className="secondary" onClick={() => { setAuthMode("create"); setError(""); }}>
                New teacher? Create Account
              </button>
            ) : null}
          </form>
        )}
      </section>

      <footer className="login-credits">
        <p>Developed by: Dewan Salman Rahman Zisan, Md. Nafiz Ahmed</p>
        <p>Supervised By: Waliul Islam Sumon</p>
      </footer>
    </main>
  );
}
