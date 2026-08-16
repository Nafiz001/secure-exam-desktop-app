import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalProvider, useModal } from "./components/modals/ModalProvider";
import { setUnauthorizedHandler } from "./api";
import AdminDashboard from "./features/admin/AdminDashboard";
import StudentDashboard from "./features/student/StudentDashboard";
import TeacherDashboard from "./features/teacher/TeacherDashboard";
import LoginPage from "./pages/LoginPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";

function DashboardContent({ token, user }) {
  const content = useMemo(() => {
    if (user.role === "teacher") return <TeacherDashboard token={token} />;
    return <AdminDashboard token={token} />;
  }, [token, user]);

  return content;
}

function AppShell() {
  const { showAlert } = useModal();
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
  const [studentMode, setStudentMode] = useState(false);
  const [studentInExam, setStudentInExam] = useState(false);

  const handleStudentViewChange = useCallback((view) => {
    setStudentInExam(view === "exam");
  }, []);

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
    setStudentMode(false);
    setStudentInExam(false);
  }

  function handlePasswordChanged() {
    const updatedUser = { ...user, must_change_password: false };
    localStorage.setItem("user", JSON.stringify(updatedUser));
    setUser(updatedUser);
  }

  const handlingSessionExpiryRef = useRef(false);

  useEffect(() => {
    setUnauthorizedHandler(async (message) => {
      if (handlingSessionExpiryRef.current) return;
      handlingSessionExpiryRef.current = true;

      handleLogout();
      try {
        await showAlert({
          title: "Session Expired",
          message: message || "Your session has expired. Please log in again."
        });
      } finally {
        handlingSessionExpiryRef.current = false;
      }
    });

    return () => setUnauthorizedHandler(null);
  }, [showAlert]);

  const isStudent = studentMode || (token && user && user.role === "student");

  if (isStudent) {
    return (
      <main className="page">
        {user ? (
          <header className="topbar">
            <div>
              <p className="muted">Logged in as</p>
              <h1>{user.name}</h1>
            </div>
            {/* Hidden during an active exam so a student can't abandon it via
                Logout instead of submitting. */}
            {!studentInExam ? (
              <button className="danger" onClick={handleLogout}>
                Logout
              </button>
            ) : null}
          </header>
        ) : (
          <div className="student-join-topbar">
            <button className="secondary" onClick={handleLogout}>
              Back
            </button>
          </div>
        )}

        <div className="content-stack">
          <StudentDashboard token={token} user={user} onAuthenticated={handleLogin} onViewChange={handleStudentViewChange} />
        </div>
      </main>
    );
  }

  if (!token || !user) {
    return <LoginPage onLogin={handleLogin} onStudentJoin={() => setStudentMode(true)} />;
  }

  if (user.role !== "admin" && user.must_change_password) {
    return <ChangePasswordPage token={token} onChanged={handlePasswordChanged} onLogout={handleLogout} />;
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
