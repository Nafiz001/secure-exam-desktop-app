import { useEffect, useMemo, useState } from "react";
import { ModalProvider } from "./components/modals/ModalProvider";
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
    return <AdminDashboard />;
  }, [onStudentExamModeChange, token, user]);

  return content;
}

function AppShell() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [isStudentExamMode, setIsStudentExamMode] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
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

  function handleLogin(nextToken, nextUser) {
    localStorage.setItem("token", nextToken);
    localStorage.setItem("user", JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setIsStudentExamMode(false);
  }

  useEffect(() => {
    document.body.classList.toggle("theme-dark", theme === "dark");
    document.body.classList.toggle("theme-light", theme !== "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  if (!token || !user) {
    return (
      <>
        <button
          type="button"
          className="theme-toggle theme-toggle-floating"
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
        >
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="muted">Logged in as</p>
          <h1>{user.name}</h1>
          <p className="muted small">{user.email}</p>
        </div>
        <div className="topbar-actions">
          {!(user.role === "student" && isStudentExamMode) ? (
            <>
              <button type="button" className="theme-toggle" onClick={toggleTheme}>
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </button>
              <button className="danger" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="content-stack">
        <DashboardContent
          token={token}
          user={user}
          onStudentExamModeChange={setIsStudentExamMode}
        />
      </div>
    </main>
  );
}

export default function App() {
  return (
    <ModalProvider>
      <AppShell />
    </ModalProvider>
  );
}
