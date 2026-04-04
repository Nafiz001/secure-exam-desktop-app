import { useMemo, useState } from "react";
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

  if (!token || !user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="muted">Logged in as</p>
          <h1>{user.name}</h1>
          <p className="muted small">{user.email}</p>
        </div>
        {!(user.role === "student" && isStudentExamMode) ? (
          <button className="danger" onClick={handleLogout}>
            Logout
          </button>
        ) : null}
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
