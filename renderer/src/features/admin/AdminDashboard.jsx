import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../../api";

// ─── helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  return (
    <span className={`admin-badge ${status === "active" ? "admin-badge-active" : "admin-badge-inactive"}`}>
      {status === "active" ? "Active" : "Inactive"}
    </span>
  );
}

function ErrorBox({ msg }) {
  return msg ? <div className="error-box">{msg}</div> : null;
}

function SuccessBox({ msg }) {
  return msg ? <div className="admin-success-box">{msg}</div> : null;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function StatsPanel({ token }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    apiRequest("/admin/stats", {}, token)
      .then((r) => setStats(r.data))
      .catch(() => {});
  }, [token]);

  if (!stats) return <div className="muted">Loading stats…</div>;

  const cards = [
    { label: "Active Teachers",   value: stats.active_teachers,   color: "blue" },
    { label: "Inactive Teachers", value: stats.inactive_teachers, color: "gray" },
    { label: "Active Students",   value: stats.active_students,   color: "green" },
    { label: "Inactive Students", value: stats.inactive_students, color: "gray" },
    { label: "Total Exams",       value: stats.total_exams,       color: "purple" }
  ];

  return (
    <div className="admin-stats-grid">
      {cards.map((c) => (
        <div key={c.label} className={`admin-stat-card admin-stat-${c.color}`}>
          <div className="admin-stat-value">{c.value}</div>
          <div className="admin-stat-label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Teachers ────────────────────────────────────────────────────────────────

function TeacherPanel({ token }) {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "" });

  const load = useCallback(() => {
    apiRequest("/admin/users?role=teacher", {}, token)
      .then((r) => setTeachers(r.data.users))
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!form.email || !form.password) { setError("Email and password required."); return; }
    setLoading(true);
    try {
      await apiRequest("/admin/create-teacher", {
        method: "POST",
        body: JSON.stringify(form)
      }, token);
      setSuccess(`Teacher ${form.email} created.`);
      setForm({ email: "", password: "", name: "" });
      setShowForm(false);
      load();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function toggleStatus(id, current) {
    setError(""); setSuccess("");
    const next = current === "active" ? "inactive" : "active";
    try {
      await apiRequest(`/admin/users/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: next })
      }, token);
      setSuccess(`User ${next === "active" ? "activated" : "deactivated"}.`);
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h3>Teachers</h3>
        <button type="button" className="btn-sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ Add Teacher"}
        </button>
      </div>

      <ErrorBox msg={error} />
      <SuccessBox msg={success} />

      {showForm && (
        <form className="admin-form" onSubmit={handleCreate}>
          <h4>New Teacher Account</h4>
          <div className="admin-form-row">
            <label>
              <span>Name (optional)</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Dr. John Smith"
              />
            </label>
            <label>
              <span>Email *</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="teacher@kuet.ac.bd"
                required
              />
            </label>
            <label>
              <span>Password *</span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min 6 characters"
                required
              />
            </label>
          </div>
          <button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create Teacher"}
          </button>
        </form>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Status</th>
            <th>Created</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {teachers.length === 0 && (
            <tr><td colSpan={5} className="muted center-text">No teachers yet</td></tr>
          )}
          {teachers.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.email}</td>
              <td><StatusBadge status={t.status} /></td>
              <td className="muted small">{new Date(t.created_at).toLocaleDateString()}</td>
              <td>
                <button
                  type="button"
                  className={`btn-sm ${t.status === "active" ? "btn-danger-sm" : "btn-success-sm"}`}
                  onClick={() => toggleStatus(t.id, t.status)}
                >
                  {t.status === "active" ? "Deactivate" : "Activate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Students ────────────────────────────────────────────────────────────────

function StudentPanel({ token }) {
  const [students, setStudents]   = useState([]);
  const [filtered, setFiltered]   = useState([]);
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");
  const [tab, setTab]             = useState("list"); // list | add | csv
  const [form, setForm]           = useState({ roll: "", password: "", email: "", name: "" });
  const [csvText, setCsvText]     = useState("");
  const [csvResult, setCsvResult] = useState(null);
  const fileRef                   = useRef(null);

  const load = useCallback(() => {
    apiRequest("/admin/users?role=student", {}, token)
      .then((r) => { setStudents(r.data.users); setFiltered(r.data.users); })
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q ? students.filter(
        (s) => s.name.toLowerCase().includes(q) ||
               (s.roll_number || "").includes(q) ||
               s.email.toLowerCase().includes(q)
      ) : students
    );
  }, [search, students]);

  async function handleAddStudent(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!form.roll || !form.password) { setError("Roll and password required."); return; }
    setLoading(true);
    try {
      await apiRequest("/admin/create-student", {
        method: "POST",
        body: JSON.stringify(form)
      }, token);
      setSuccess(`Student ${form.roll} created.`);
      setForm({ roll: "", password: "", email: "", name: "" });
      setTab("list");
      load();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleCSVUpload(e) {
    e.preventDefault();
    setError(""); setSuccess(""); setCsvResult(null);
    if (!csvText.trim()) { setError("Paste CSV content or choose a file."); return; }
    setLoading(true);
    try {
      const r = await apiRequest("/admin/upload-students", {
        method: "POST",
        body: JSON.stringify({ csvContent: csvText })
      }, token);
      setCsvResult(r.data);
      setSuccess(`Done. Created: ${r.data.created}, Skipped: ${r.data.skipped}`);
      load();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function handleFileLoad(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result || "");
    reader.readAsText(file);
  }

  async function toggleStatus(id, current) {
    setError(""); setSuccess("");
    const next = current === "active" ? "inactive" : "active";
    try {
      await apiRequest(`/admin/users/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: next })
      }, token);
      setSuccess(`Student ${next === "active" ? "activated" : "deactivated"}.`);
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h3>Students</h3>
        <div className="admin-tab-row">
          {["list", "add", "csv"].map((t) => (
            <button
              key={t}
              type="button"
              className={`btn-sm ${tab === t ? "btn-active" : ""}`}
              onClick={() => { setTab(t); setError(""); setSuccess(""); }}
            >
              {t === "list" ? "All Students" : t === "add" ? "+ Add Student" : "CSV Upload"}
            </button>
          ))}
        </div>
      </div>

      <ErrorBox msg={error} />
      <SuccessBox msg={success} />

      {tab === "list" && (
        <>
          <input
            className="admin-search"
            type="text"
            placeholder="Search by name, roll, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <table className="admin-table">
            <thead>
              <tr>
                <th>Roll</th>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="muted center-text">No students found</td></tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td><code>{s.roll_number || "—"}</code></td>
                  <td>{s.name}</td>
                  <td className="muted small">{s.email}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td className="muted small">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      type="button"
                      className={`btn-sm ${s.status === "active" ? "btn-danger-sm" : "btn-success-sm"}`}
                      onClick={() => toggleStatus(s.id, s.status)}
                    >
                      {s.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{filtered.length} of {students.length} student(s)</p>
        </>
      )}

      {tab === "add" && (
        <form className="admin-form" onSubmit={handleAddStudent}>
          <h4>New Student Account</h4>
          <div className="admin-form-row">
            <label>
              <span>Roll Number * (7 digits)</span>
              <input
                type="text"
                maxLength={7}
                value={form.roll}
                onChange={(e) => setForm((f) => ({ ...f, roll: e.target.value }))}
                placeholder="e.g. 2007001"
                required
              />
            </label>
            <label>
              <span>Password * (min 6 chars)</span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Student password"
                required
              />
            </label>
            <label>
              <span>Name (optional)</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </label>
            <label>
              <span>Email (optional)</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Auto-generated if left blank"
              />
            </label>
          </div>
          <button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create Student"}
          </button>
        </form>
      )}

      {tab === "csv" && (
        <form className="admin-form" onSubmit={handleCSVUpload}>
          <h4>Bulk Upload via CSV</h4>
          <p className="muted small">
            CSV must have a header row with columns: <strong>roll</strong>, <strong>password</strong>, and optionally <strong>name</strong>, <strong>email</strong>.
            Example: <code>roll,password,name</code> / <code>2007001,pass123,Alice</code>
          </p>

          <label>
            <span>Choose CSV file</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileLoad}
            />
          </label>

          <label>
            <span>Or paste CSV content directly</span>
            <textarea
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={"roll,password,name\n2007001,pass123,Alice\n2007002,pass456,Bob"}
              className="admin-csv-textarea"
            />
          </label>

          <button type="submit" disabled={loading || !csvText.trim()}>
            {loading ? "Uploading…" : "Upload Students"}
          </button>

          {csvResult && (
            <div className="admin-csv-result">
              <strong>Result:</strong> {csvResult.created} created, {csvResult.skipped} skipped
              {csvResult.errors.length > 0 && (
                <ul className="admin-csv-errors">
                  {csvResult.errors.map((e, i) => (
                    <li key={i}><code>{e.roll}</code>: {e.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}

// ─── Main Admin Dashboard ─────────────────────────────────────────────────────

export default function AdminDashboard({ token }) {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { key: "overview",  label: "Overview" },
    { key: "teachers",  label: "Teachers" },
    { key: "students",  label: "Students" }
  ];

  return (
    <section className="admin-dashboard">
      <div className="admin-header">
        <h2>Admin Panel</h2>
        <p className="muted">Institution control — manage users, access, and platform settings.</p>
      </div>

      <nav className="admin-nav">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`admin-nav-btn ${activeTab === t.key ? "admin-nav-btn-active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && (
        <div>
          <h3 className="admin-sub-heading">Platform Overview</h3>
          <StatsPanel token={token} />
          <div className="admin-info-box">
            <h4>How it works</h4>
            <ul>
              <li>Only Admin can create Teacher and Student accounts — no public registration.</li>
              <li>Students can log in with their <strong>email + password</strong> OR by entering just their <strong>Roll Number + Password</strong>.</li>
              <li>Students can also enter an exam directly using a <strong>Room Key + Roll Number</strong> (no account login required on the page).</li>
              <li>Deactivating a user immediately blocks all future logins for that account.</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === "teachers" && <TeacherPanel token={token} />}
      {activeTab === "students" && <StudentPanel token={token} />}
    </section>
  );
}
