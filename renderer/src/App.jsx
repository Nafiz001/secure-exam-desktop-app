import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowLeft } from "react-icons/fa";
import ProfileMenu from "./components/ProfileMenu";
import IconButton from "./components/IconButton";
import { ModalProvider, useModal } from "./components/modals/ModalProvider";
import { setUnauthorizedHandler } from "./api";
import StudentDashboard from "./features/student/StudentDashboard";
import TeacherDashboard from "./features/teacher/TeacherDashboard";
import LoginPage from "./pages/LoginPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";

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
  const [studentView, setStudentView] = useState("dashboard");
  const [teacherView, setTeacherView] = useState("list");
  const teacherDashboardRef = useRef(null);

  const handleStudentViewChange = useCallback((view) => {
    setStudentView(view);
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
        <header className="topbar">
          <div>{user ? <h1>{user.name}</h1> : null}</div>
          {/* Students join with a room code rather than signing in, so there's
              no logout. This is only shown on the join screen, where it is the
              sole route back to the start screen — once they're in the waiting
              room or an exam, the only ways out are that screen's own Leave
              button, submitting, or the timer running out. */}
          {studentView === "dashboard" ? (
            <IconButton
              icon={<FaArrowLeft size={20} />}
              label="Back"
              variant="ghost"
              className="topbar-back-button"
              onClick={handleLogout}
            />
          ) : null}
        </header>

        <div className="content-stack">
          <StudentDashboard token={token} user={user} onAuthenticated={handleLogin} onViewChange={handleStudentViewChange} />
        </div>
      </main>
    );
  }

  if (!token || !user) {
    return <LoginPage onLogin={handleLogin} onStudentJoin={() => setStudentMode(true)} />;
  }

  if (user.must_change_password) {
    return <ChangePasswordPage token={token} onChanged={handlePasswordChanged} onLogout={handleLogout} />;
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          {teacherView !== "list" ? (
            <IconButton
              icon={<FaArrowLeft size={20} />}
              label="Back"
              variant="ghost"
              className="topbar-back-button"
              onClick={() => teacherDashboardRef.current?.goBack()}
            />
          ) : (
            <>
              <h1>{user.name}</h1>
              <p className="muted small">{user.email}</p>
            </>
          )}
        </div>
        <ProfileMenu user={user} onLogout={handleLogout} />
      </header>

      <div className="content-stack">
        <TeacherDashboard ref={teacherDashboardRef} token={token} onViewChange={setTeacherView} />
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
