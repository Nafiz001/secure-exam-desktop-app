import { useState } from "react";
import { apiRequest } from "../api";

// ─── Tab 1: Login (Admin / Teacher / Student) ─────────────────────────────────

function LoginTab({ onLogin }) {
  const [role, setRole]       = useState("student");
  const [identifier, setId]   = useState(""); // email or roll
  const [password, setPass]   = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const isStudent = role === "student";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!identifier.trim() || !password) {
      setError("Please enter your credentials.");
      return;
    }

    setLoading(true);
    try {
      const isRoll = isStudent && /^\d{7}$/.test(identifier.trim());
      const body   = isRoll
        ? { roll_number: identifier.trim(), password }
        : { email: identifier.trim(), password };

      const result = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify(body)
      });

      const loggedRole = String(result?.data?.user?.role || "").toLowerCase();
      if (loggedRole !== role) {
        setError(`This account is registered as "${loggedRole}". Please select the correct role.`);
        return;
      }

      onLogin(result.data.token, result.data.user);
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  const ROLES = [
    { key: "admin",   icon: "AD", label: "Admin" },
    { key: "teacher", icon: "TR", label: "Teacher" },
    { key: "student", icon: "ST", label: "Student" }
  ];

  return (
    <div className="login-tab-content">
      <div className="role-grid-compact">
        {ROLES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`role-card-compact ${role === r.key ? "role-card-active" : ""}`}
            onClick={() => { setRole(r.key); setId(""); setError(""); }}
          >
            <span className="role-icon-sm">{r.icon}</span>
            <span>{r.label}</span>
          </button>
        ))}
      </div>

      {error && <div className="error-box">{error}</div>}

      <form className="form-stack" onSubmit={handleSubmit}>
        <label>
          <span>{isStudent ? "Email or Roll Number" : "Email"}</span>
          <input
            type={isStudent ? "text" : "email"}
            value={identifier}
            onChange={(e) => setId(e.target.value)}
            placeholder={isStudent ? "your@email.com or 2007001" : "your@email.com"}
            autoComplete="username"
            required
          />
        </label>

        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Signing in…" : `Sign in as ${role.charAt(0).toUpperCase() + role.slice(1)}`}
        </button>
      </form>
    </div>
  );
}

// ─── Tab 2: Enter Exam (Room Key + Roll, no login) ────────────────────────────

function EnterExamTab({ onLogin }) {
  const [roomCode, setRoom]   = useState("");
  const [roll, setRoll]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!roomCode.trim() || !roll.trim()) {
      setError("Room Key and Roll Number are required.");
      return;
    }

    if (!/^\d{7}$/.test(roll.trim())) {
      setError("Roll number must be exactly 7 digits.");
      return;
    }

    setLoading(true);
    try {
      const result = await apiRequest("/exams/join-by-room", {
        method: "POST",
        body: JSON.stringify({ roomCode: roomCode.trim(), roll: roll.trim() })
      });

      onLogin(result.data.token, result.data.user);
    } catch (err) {
      setError(err.message || "Could not join exam.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-tab-content">
      <div className="enter-exam-hero">
        <div className="enter-exam-icon">🔑</div>
        <p className="muted">Enter the Room Key provided by your teacher and your 7-digit Roll Number to join an exam directly — no login required.</p>
      </div>

      {error && <div className="error-box">{error}</div>}

      <form className="form-stack" onSubmit={handleSubmit}>
        <label>
          <span>Room Key</span>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoom(e.target.value.toUpperCase())}
            placeholder="e.g. AB3X7Y"
            maxLength={6}
            style={{ textTransform: "uppercase", letterSpacing: "0.2em", fontSize: "1.2rem" }}
            required
          />
        </label>

        <label>
          <span>Roll Number</span>
          <input
            type="text"
            value={roll}
            onChange={(e) => setRoll(e.target.value.replace(/\D/g, "").slice(0, 7))}
            placeholder="7-digit roll  e.g. 2007001"
            maxLength={7}
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Joining…" : "Enter Exam"}
        </button>
      </form>
    </div>
  );
}

// ─── Main LoginPage ───────────────────────────────────────────────────────────

export default function LoginPage({ onLogin }) {
  const [activeTab, setActiveTab] = useState("login");

  return (
    <main className="page login-page-shell">
      <section className="auth-hero-panel">
        <p className="auth-badge">Institution Portal</p>
        <h1>Invigilo</h1>
        <p className="auth-hero-copy">
          Secure, institution-controlled exam platform for KUET.
          Accounts are managed by Admin — no public registration.
        </p>
      </section>

      <section className="card auth-card-wide">
        <div className="login-main-tabs">
          <button
            type="button"
            className={`login-main-tab ${activeTab === "login" ? "login-main-tab-active" : ""}`}
            onClick={() => setActiveTab("login")}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`login-main-tab ${activeTab === "exam" ? "login-main-tab-active" : ""}`}
            onClick={() => setActiveTab("exam")}
          >
            Enter Exam
          </button>
        </div>

        {activeTab === "login" && <LoginTab onLogin={onLogin} />}
        {activeTab === "exam"  && <EnterExamTab onLogin={onLogin} />}
      </section>
    </main>
  );
}
