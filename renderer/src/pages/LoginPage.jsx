import { useState } from "react";
import { apiRequest } from "../api";
import { useModal } from "../components/modals/ModalProvider";

const ROLE_OPTIONS = [
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
  const [authMode, setAuthMode] = useState("login"); // "login" | "create" | "verify" | "forgot" | "reset" (teacher only)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  const [verifyEmailAddr, setVerifyEmailAddr] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [resending, setResending] = useState(false);

  const [forgotEmail, setForgotEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const isRolePickerVisible = authMode === "login" || authMode === "create";

  function switchRole(role) {
    setActiveRole(role);
    setAuthMode("login");
    setError("");
    setInfoMessage("");
  }

  function goToForgotPassword() {
    setError("");
    setInfoMessage("");
    setForgotEmail(email.trim());
    setAuthMode("forgot");
  }

  async function handleRequestResetCode(event) {
    event.preventDefault();
    setError("");
    setInfoMessage("");

    if (!forgotEmail.trim()) {
      setError("Please enter your account email.");
      return;
    }

    setLoading(true);
    try {
      const result = await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: forgotEmail.trim() })
      });
      setInfoMessage(result.message || "If an account with that email exists, a reset code has been sent.");
      setAuthMode("reset");
    } catch (err) {
      setError(err.message || "Failed to send reset code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setError("");

    if (!resetCode.trim() || !resetNewPassword) {
      setError("Please enter the code and a new password.");
      return;
    }
    if (resetNewPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          email: forgotEmail.trim(),
          code: resetCode.trim(),
          newPassword: resetNewPassword
        })
      });
      await showAlert({ title: "Password Reset", message: "Your password has been reset. You can now log in." });
      setResetCode("");
      setResetNewPassword("");
      setResetConfirmPassword("");
      setEmail(forgotEmail.trim());
      setPassword("");
      setAuthMode("login");
    } catch (err) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault();
    setError("");

    if (!verifyCode.trim()) {
      setError("Please enter the verification code.");
      return;
    }

    setLoading(true);
    try {
      const result = await apiRequest("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email: verifyEmailAddr.trim(), code: verifyCode.trim() })
      });
      onLogin(result.data.token, result.data.user);
    } catch (err) {
      setError(err.message || "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    setError("");
    setResending(true);
    try {
      await apiRequest("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: verifyEmailAddr.trim() })
      });
      await showAlert({ title: "Code Sent", message: "A new verification code has been sent to your email." });
    } catch (err) {
      setError(err.message || "Failed to resend code.");
    } finally {
      setResending(false);
    }
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
      if (err.data?.needsVerification) {
        setVerifyEmailAddr(err.data.email || email.trim());
        setAuthMode("verify");
        setError("");
      } else {
        setError(err.message || "Login failed.");
      }
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

      setVerifyEmailAddr(result.data.email || signupEmail.trim());
      setAuthMode("verify");
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
          Professional and streamlined access for Teacher and Student roles.
          Fast, focused, and exam-ready.
        </p>
      </section>

      <section className="card auth-card-wide">
        {/* The role picker is only meaningful when choosing how to sign in —
            it's noise once you're partway through verifying or resetting. */}
        {isRolePickerVisible ? (
          <>
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
          </>
        ) : null}

        {error ? <div className="error-box">{error}</div> : null}

        {activeRole === "teacher" && authMode === "verify" ? (
          <form className="form-stack" onSubmit={handleVerifyCode}>
            <h3 className="auth-form-title">Verify Your Email</h3>
            <p className="muted">
              We sent a 6-digit code to <strong>{verifyEmailAddr}</strong>. Enter it below to activate your account.
            </p>

            <label>
              <span>Verification Code</span>
              <input
                type="text"
                inputMode="numeric"
                value={verifyCode}
                onChange={(event) => setVerifyCode(event.target.value)}
                placeholder="123456"
                maxLength={6}
                autoComplete="one-time-code"
                required
              />
            </label>

            <button type="submit" disabled={loading}>
              {loading ? "Verifying..." : "Verify & Continue"}
            </button>

            <button type="button" className="secondary" onClick={handleResendCode} disabled={resending}>
              {resending ? "Resending..." : "Resend code"}
            </button>

            <button type="button" className="secondary" onClick={() => { setAuthMode("login"); setError(""); }}>
              Back to Log In
            </button>
          </form>
        ) : activeRole === "teacher" && authMode === "forgot" ? (
          <form className="form-stack" onSubmit={handleRequestResetCode}>
            <h3 className="auth-form-title">Forgot Password</h3>
            <p className="muted">Enter your account email and we'll send you a reset code.</p>

            <label>
              <span>Email</span>
              <input
                type="email"
                value={forgotEmail}
                onChange={(event) => setForgotEmail(event.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                required
              />
            </label>

            <button type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Code"}
            </button>

            <button type="button" className="secondary" onClick={() => { setAuthMode("login"); setError(""); }}>
              Back to Log In
            </button>
          </form>
        ) : activeRole === "teacher" && authMode === "reset" ? (
          <form className="form-stack" onSubmit={handleResetPassword}>
            <h3 className="auth-form-title">Reset Password</h3>
            {infoMessage ? <p className="muted">{infoMessage}</p> : null}

            <label>
              <span>Reset Code</span>
              <input
                type="text"
                inputMode="numeric"
                value={resetCode}
                onChange={(event) => setResetCode(event.target.value)}
                placeholder="123456"
                maxLength={6}
                autoComplete="one-time-code"
                required
              />
            </label>

            <label>
              <span>New Password</span>
              <input
                type="password"
                value={resetNewPassword}
                onChange={(event) => setResetNewPassword(event.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                required
              />
            </label>

            <label>
              <span>Confirm New Password</span>
              <input
                type="password"
                value={resetConfirmPassword}
                onChange={(event) => setResetConfirmPassword(event.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                required
              />
            </label>

            <button type="submit" disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>

            <button type="button" className="secondary" onClick={() => { setAuthMode("forgot"); setError(""); }}>
              Didn't get a code? Try again
            </button>

            <button type="button" className="secondary" onClick={() => { setAuthMode("login"); setError(""); }}>
              Back to Log In
            </button>
          </form>
        ) : activeRole === "teacher" && authMode === "create" ? (
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

            <button type="button" className="secondary" onClick={goToForgotPassword}>
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
