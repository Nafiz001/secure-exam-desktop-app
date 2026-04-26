import { useEffect, useMemo, useState } from "react";
import { LogOut, ChevronDown, ShieldCheck, GraduationCap, User } from "lucide-react";
import { ModalProvider, useModal } from "./components/modals/ModalProvider";
import {
  TooltipProvider,
  Toaster,
  IconButton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Badge,
} from "./components/ui";
import { Logo } from "./components/brand/Logo";
import AdminDashboard from "./features/admin/AdminDashboard";
import StudentDashboard from "./features/student/StudentDashboard";
import TeacherDashboard from "./features/teacher/TeacherDashboard";
import LoginPage from "./pages/LoginPage";

function DashboardContent({ token, user, onStudentExamModeChange }) {
  const content = useMemo(() => {
    if (user.role === "student") {
      return (
        <StudentDashboard
          token={token}
          user={user}
          onExamModeChange={onStudentExamModeChange}
        />
      );
    }
    if (user.role === "teacher") return <TeacherDashboard token={token} />;
    return <AdminDashboard token={token} />;
  }, [onStudentExamModeChange, token, user]);

  return content;
}

function RoleBadge({ role }) {
  const map = {
    admin: { icon: ShieldCheck, label: "Admin", tone: "info" },
    teacher: { icon: GraduationCap, label: "Teacher", tone: "primary" },
    student: { icon: User, label: "Student", tone: "success" },
  };
  const cfg = map[role] || { icon: User, label: role, tone: "neutral" };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.tone} size="md" className="capitalize">
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function UserMenu({ user, onLogout }) {
  const initials = (user.name || user.email || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface pl-1 pr-3 py-1 hover:border-border-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          aria-label="Open user menu"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-subtle text-primary-hover font-semibold text-xs">
            {initials}
          </span>
          <span className="text-left hidden sm:block leading-tight">
            <span className="block text-sm font-medium text-ink truncate max-w-[180px]">
              {user.name || user.email}
            </span>
            <span className="block text-[11px] text-ink-subtle capitalize">
              {user.role}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-ink-subtle group-hover:text-ink transition-colors" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[240px]">
        <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
        <div className="px-2 pb-2">
          <p className="text-sm font-medium text-ink truncate">
            {user.name || user.email}
          </p>
          {user.email ? (
            <p className="text-xs text-ink-muted truncate">{user.email}</p>
          ) : null}
          <div className="mt-2">
            <RoleBadge role={user.role} />
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onLogout();
          }}
          className="text-danger focus:bg-danger-subtle focus:text-danger"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppShell() {
  const { showConfirm } = useModal();
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [isStudentExamMode, setIsStudentExamMode] = useState(false);
  const [user, setUser] = useState(() => {
    const rawUser = localStorage.getItem("user");
    if (!rawUser) {
      return null;
    }

    try {
      return JSON.parse(rawUser);
    } catch (error) {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      return null;
    }
  });

  useEffect(() => {
    document.body.classList.remove("theme-dark", "theme-light");
    localStorage.removeItem("theme");
  }, []);

  function handleLogin(nextToken, nextUser) {
    localStorage.setItem("token", nextToken);
    localStorage.setItem("user", JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  function performLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setIsStudentExamMode(false);
  }

  async function requestLogout() {
    const ok = await showConfirm({
      title: "Sign out of Invigilo?",
      message: "You will be returned to the login page.",
      confirmText: "Sign out",
      cancelText: "Stay signed in",
    });
    if (ok) performLogout();
  }

  if (!token || !user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const hideTopbar = user.role === "student" && isStudentExamMode;

  return (
    <div className="min-h-screen w-full bg-bg text-ink flex flex-col">
      {!hideTopbar ? (
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-surface/95 backdrop-blur px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Logo size={28} />
            <div className="hidden sm:flex items-center gap-2 pl-4 border-l border-border">
              <RoleBadge role={user.role} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <UserMenu user={user} onLogout={requestLogout} />
            <IconButton
              aria-label="Sign out"
              tooltip="Sign out"
              variant="ghost"
              onClick={requestLogout}
              className="hover:bg-danger-subtle hover:text-danger"
            >
              <LogOut className="h-4 w-4" />
            </IconButton>
          </div>
        </header>
      ) : null}

      <div className="flex-1 w-full">
        <DashboardContent
          token={token}
          user={user}
          onStudentExamModeChange={setIsStudentExamMode}
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <TooltipProvider>
      <ModalProvider>
        <AppShell />
        <Toaster />
      </ModalProvider>
    </TooltipProvider>
  );
}
