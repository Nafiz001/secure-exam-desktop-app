import { useState } from "react";
import {
  ShieldCheck,
  GraduationCap,
  User,
  Mail,
  Lock,
  LogIn,
  KeyRound,
  Hash,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";
import { apiRequest } from "../api";
import { Button, Input, FormField, Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui";
import { Logo, LogoMark } from "../components/brand/Logo";
import { cn } from "../lib/cn";

// ─── Tab 1: Login (Admin / Teacher / Student) ─────────────────────────────────

const ROLES = [
  { key: "admin", icon: ShieldCheck, label: "Admin" },
  { key: "teacher", icon: GraduationCap, label: "Teacher" },
  { key: "student", icon: User, label: "Student" },
];

function LoginTab({ onLogin }) {
  const [role, setRole] = useState("student");
  const [identifier, setId] = useState("");
  const [password, setPass] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
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
      const body = isRoll
        ? { roll_number: identifier.trim(), password }
        : { email: identifier.trim(), password };

      const result = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const loggedRole = String(result?.data?.user?.role || "").toLowerCase();
      if (loggedRole !== role) {
        setError(
          `This account is registered as "${loggedRole}". Please select the correct role.`
        );
        return;
      }

      onLogin(result.data.token, result.data.user);
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-ink-subtle uppercase tracking-wide mb-2">
          I am signing in as
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const active = role === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  setRole(r.key);
                  setId("");
                  setError("");
                }}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border px-3 py-4 text-sm font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                  active
                    ? "border-primary bg-primary-subtle text-primary-hover shadow-xs"
                    : "border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink"
                )}
              >
                <Icon
                  className={cn(
                    "h-6 w-6",
                    active ? "text-primary" : "text-ink-subtle"
                  )}
                />
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger-subtle bg-danger-subtle/40 px-3 py-2.5 text-sm text-danger"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormField
          label={isStudent ? "Email or Roll Number" : "Email"}
          htmlFor="login-identifier"
        >
          <Input
            id="login-identifier"
            type={isStudent ? "text" : "email"}
            value={identifier}
            onChange={(e) => setId(e.target.value)}
            placeholder={isStudent ? "your@email.com or 2007001" : "your@email.com"}
            autoComplete="username"
            required
            leftIcon={isStudent ? <Hash className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
          />
        </FormField>

        <FormField label="Password" htmlFor="login-password">
          <Input
            id="login-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
            leftIcon={<Lock className="h-4 w-4" />}
            rightIcon={
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="pointer-events-auto hover:text-ink transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            }
          />
        </FormField>

        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              Sign in as {role.charAt(0).toUpperCase() + role.slice(1)}
            </>
          )}
        </Button>
      </form>
    </div>
  );
}

// ─── Tab 2: Enter Exam (Room Key + Roll, no login) ────────────────────────────

function EnterExamTab({ onLogin }) {
  const [roomCode, setRoom] = useState("");
  const [roll, setRoll] = useState("");
  const [error, setError] = useState("");
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
        body: JSON.stringify({ roomCode: roomCode.trim(), roll: roll.trim() }),
      });

      onLogin(result.data.token, result.data.user);
    } catch (err) {
      setError(err.message || "Could not join exam.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-primary-subtle bg-primary-subtle/40 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <KeyRound className="h-4 w-4" />
        </div>
        <p className="text-sm text-ink-muted leading-relaxed">
          Enter the Room Key provided by your teacher and your 7-digit Roll Number to
          join an exam directly — no login required.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger-subtle bg-danger-subtle/40 px-3 py-2.5 text-sm text-danger"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormField label="Room Key" htmlFor="enter-room">
          <Input
            id="enter-room"
            type="text"
            value={roomCode}
            onChange={(e) => setRoom(e.target.value.toUpperCase())}
            placeholder="AB3X7Y"
            maxLength={6}
            required
            leftIcon={<KeyRound className="h-4 w-4" />}
            className="uppercase tracking-[0.3em] text-base font-semibold text-center"
          />
        </FormField>

        <FormField label="Roll Number" htmlFor="enter-roll">
          <Input
            id="enter-roll"
            type="text"
            inputMode="numeric"
            value={roll}
            onChange={(e) => setRoll(e.target.value.replace(/\D/g, "").slice(0, 7))}
            placeholder="7-digit roll e.g. 2007001"
            maxLength={7}
            required
            leftIcon={<Hash className="h-4 w-4" />}
          />
        </FormField>

        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Joining…
            </>
          ) : (
            <>
              <KeyRound className="h-4 w-4" />
              Enter Exam
            </>
          )}
        </Button>
      </form>
    </div>
  );
}

// ─── Main LoginPage ───────────────────────────────────────────────────────────

const HERO_FEATURES = [
  "Face-detection proctoring with live violation alerts",
  "Lockdown during exams — screen sharing and process monitoring",
  "Institution-managed accounts, no public registration",
];

export default function LoginPage({ onLogin }) {
  const [activeTab, setActiveTab] = useState("login");

  return (
    <main className="min-h-screen w-full bg-bg flex items-stretch">
      <div className="mx-auto grid w-full max-w-[1200px] lg:grid-cols-[1.1fr_1fr]">
        {/* Hero panel */}
        <section className="relative hidden lg:flex flex-col justify-between px-12 py-14 overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 20% 20%, var(--color-primary-subtle) 0%, transparent 45%), radial-gradient(circle at 80% 80%, rgba(124,58,237,0.08) 0%, transparent 50%)",
            }}
          />
          <div className="relative">
            <Logo size={36} />
          </div>
          <div className="relative space-y-6 max-w-md">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">
                Institution Portal
              </p>
              <h1 className="text-4xl font-semibold text-ink leading-tight tracking-tight">
                Secure exams,
                <br />
                without the friction.
              </h1>
              <p className="text-base text-ink-muted mt-4 leading-relaxed">
                A proctored desktop exam platform for KUET. Accounts are managed
                by administrators — students simply sign in or enter an exam
                room.
              </p>
            </div>
            <ul className="space-y-3">
              {HERO_FEATURES.map((text) => (
                <li key={text} className="flex items-start gap-3 text-sm text-ink-muted">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative text-xs text-ink-subtle">
            © {new Date().getFullYear()} Invigilo · Khulna University of Engineering &amp; Technology
          </div>
        </section>

        {/* Auth panel */}
        <section className="flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            {/* Mobile logo */}
            <div className="mb-6 flex lg:hidden items-center justify-center gap-2">
              <LogoMark size={28} />
              <span className="font-semibold text-lg tracking-tight text-ink">Invigilo</span>
            </div>

            <div className="rounded-xl border border-border bg-surface shadow-sm p-6 sm:p-8">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="login" className="justify-center">
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger value="exam" className="justify-center">
                    <KeyRound className="h-4 w-4" />
                    Enter Exam
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <LoginTab onLogin={onLogin} />
                </TabsContent>
                <TabsContent value="exam">
                  <EnterExamTab onLogin={onLogin} />
                </TabsContent>
              </Tabs>
            </div>

            <p className="mt-6 text-center text-xs text-ink-subtle">
              Need an account? Contact your institution administrator.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
