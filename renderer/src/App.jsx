import { useMemo, useState } from "react";
import { ModalProvider } from "./components/modals/ModalProvider";
import AdminDashboard from "./features/admin/AdminDashboard";
import StudentDashboard from "./features/student/StudentDashboard";
import TeacherDashboard from "./features/teacher/TeacherDashboard";
import LoginPage from "./pages/LoginPage";

function DashboardContent({ token, user }) {
  const content = useMemo(() => {
    if (user.role === "student") return <StudentDashboard token={token} user={user} />;
    if (user.role === "teacher") return <TeacherDashboard token={token} />;
    return <AdminDashboard />;
  }, [token, user]);

  return content;
}

function AppShell() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
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
        <button className="danger" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <div className="content-stack">
        <DashboardContent token={token} user={user} />
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
