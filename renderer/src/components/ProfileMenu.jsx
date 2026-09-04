import { useEffect, useRef, useState } from "react";

export default function ProfileMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initial = (user?.name || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="profile-menu" ref={containerRef}>
      <button
        type="button"
        className="profile-menu-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
        title={user?.name || "Account"}
      >
        <span className="profile-menu-avatar" aria-hidden="true">{initial}</span>
      </button>

      {open ? (
        <div className="profile-menu-dropdown">
          <div className="profile-menu-header">
            <strong>{user?.name}</strong>
            <span className="muted small">{user?.email}</span>
          </div>
          <button
            type="button"
            className="profile-menu-item profile-menu-item-danger"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}
