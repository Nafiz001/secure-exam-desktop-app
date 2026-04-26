import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  GraduationCap,
  LayoutDashboard,
  UserPlus,
  UserCheck,
  UserX,
  Upload,
  X,
  Check,
  Search,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  BookOpenCheck,
  Info,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { apiRequest } from "../../api";
import { useModal } from "../../components/modals/ModalProvider";
import {
  Button,
  IconButton,
  Input,
  Textarea,
  FormField,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardBody,
  Badge,
  Stat,
  Spinner,
  EmptyState,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../../components/ui";
import { cn } from "../../lib/cn";

// ─── helpers ─────────────────────────────────────────────────────────────────

function PasswordInput({ value, onChange, id, placeholder, required }) {
  const [shown, setShown] = useState(false);
  return (
    <Input
      id={id}
      type={shown ? "text" : "password"}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      autoComplete="new-password"
      rightIcon={
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Hide password" : "Show password"}
          className="pointer-events-auto hover:text-ink transition-colors"
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  );
}

function StatusPill({ status }) {
  return status === "active" ? (
    <Badge variant="success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      Active
    </Badge>
  ) : (
    <Badge variant="neutral">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-subtle" />
      Inactive
    </Badge>
  );
}

function Alert({ tone = "error", children }) {
  if (!children) return null;
  const config = {
    error: {
      Icon: AlertCircle,
      classes: "border-danger-subtle bg-danger-subtle/40 text-danger",
    },
    success: {
      Icon: CheckCircle2,
      classes: "border-success-subtle bg-success-subtle/40 text-success",
    },
    info: {
      Icon: Info,
      classes: "border-info-subtle bg-info-subtle/40 text-info",
    },
  }[tone];
  const { Icon, classes } = config;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm",
        classes
      )}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function StatsPanel({ token }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    apiRequest("/admin/stats", {}, token)
      .then((r) => setStats(r.data))
      .catch(() => {});
  }, [token]);

  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-ink-muted text-sm py-8">
        <Spinner /> Loading stats…
      </div>
    );
  }

  const cards = [
    { icon: GraduationCap, label: "Active Teachers", value: stats.active_teachers, tone: "primary" },
    { icon: Users, label: "Inactive Teachers", value: stats.inactive_teachers, tone: "neutral" },
    { icon: Users, label: "Active Students", value: stats.active_students, tone: "success" },
    { icon: Users, label: "Inactive Students", value: stats.inactive_students, tone: "neutral" },
    { icon: BookOpenCheck, label: "Total Exams", value: stats.total_exams, tone: "info" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((c) => (
        <Stat
          key={c.label}
          icon={c.icon}
          label={c.label}
          value={c.value}
          tone={c.tone}
        />
      ))}
    </div>
  );
}

// ─── Table primitives (admin-specific) ──────────────────────────────────────

function Table({ children }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-surface">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function Th({ children, className }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-subtle bg-bg",
        className
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }) {
  return (
    <td className={cn("px-4 py-3 text-ink border-t border-border align-middle", className)}>
      {children}
    </td>
  );
}

// ─── Teachers ────────────────────────────────────────────────────────────────

function TeacherPanel({ token }) {
  const { showConfirm } = useModal();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", password: "" });

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
        body: JSON.stringify(form),
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
        body: JSON.stringify({ status: next }),
      }, token);
      setSuccess(`User ${next === "active" ? "activated" : "deactivated"}.`);
      load();
    } catch (err) { setError(err.message); }
  }

  function startEdit(teacher) {
    setEditingId(teacher.id);
    setEditForm({ name: teacher.name || "", email: teacher.email || "", password: "" });
    setError(""); setSuccess("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: "", email: "", password: "" });
  }

  async function saveEdit(id) {
    setError(""); setSuccess("");
    const payload = {};
    if (editForm.name.trim()) payload.name = editForm.name.trim();
    if (editForm.email.trim()) payload.email = editForm.email.trim();
    if (editForm.password) payload.password = editForm.password;
    if (Object.keys(payload).length === 0) { setError("Nothing to update."); return; }
    setLoading(true);
    try {
      await apiRequest(`/admin/users/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }, token);
      setSuccess("Teacher updated.");
      cancelEdit();
      load();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function deleteTeacher(teacher) {
    setError(""); setSuccess("");
    const ok = await showConfirm({
      title: "Delete Teacher",
      message: `Permanently delete ${teacher.email}? Their exams and data will be removed. This cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
    });
    if (!ok) return;
    setLoading(true);
    try {
      await apiRequest(`/admin/users/${teacher.id}`, { method: "DELETE" }, token);
      setSuccess(`Teacher ${teacher.email} deleted.`);
      load();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Teachers</CardTitle>
          <CardDescription>
            Instructors with exam creation and grading permissions.
          </CardDescription>
        </div>
        <Button
          variant={showForm ? "secondary" : "primary"}
          size="sm"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? (
            <>
              <X className="h-4 w-4" /> Cancel
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" /> Add Teacher
            </>
          )}
        </Button>
      </CardHeader>

      <CardBody className="space-y-4">
        <Alert tone="error">{error}</Alert>
        <Alert tone="success">{success}</Alert>

        {showForm ? (
          <form
            onSubmit={handleCreate}
            className="rounded-lg border border-border bg-bg p-4 space-y-4"
          >
            <h4 className="text-sm font-semibold text-ink">New Teacher Account</h4>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Name" htmlFor="teacher-name">
                <Input
                  id="teacher-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Dr. John Smith"
                />
              </FormField>
              <FormField label="Email" htmlFor="teacher-email" required>
                <Input
                  id="teacher-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="teacher@kuet.ac.bd"
                  required
                />
              </FormField>
              <FormField label="Password" htmlFor="teacher-password" required>
                <PasswordInput
                  id="teacher-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Min 6 characters"
                  required
                />
              </FormField>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" /> Create Teacher
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : null}

        {teachers.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No teachers yet"
            description="Create the first teacher account to get started."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => {
                const isEditing = editingId === t.id;
                return (
                  <tr key={t.id} className="hover:bg-bg/60 transition-colors align-top">
                    <Td className="font-medium">
                      {isEditing ? (
                        <Input
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="Name"
                        />
                      ) : (
                        t.name || "—"
                      )}
                    </Td>
                    <Td className="text-ink-muted">
                      {isEditing ? (
                        <div className="space-y-2">
                          <Input
                            value={editForm.email}
                            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                            placeholder="Email"
                            type="email"
                          />
                          <PasswordInput
                            value={editForm.password}
                            onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                            placeholder="New password (leave blank to keep)"
                          />
                        </div>
                      ) : (
                        t.email
                      )}
                    </Td>
                    <Td><StatusPill status={t.status} /></Td>
                    <Td className="text-ink-muted text-xs tabular-nums">
                      {new Date(t.created_at).toLocaleDateString()}
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <IconButton
                              aria-label="Save changes"
                              tooltip="Save"
                              variant="primary"
                              size="sm"
                              onClick={() => saveEdit(t.id)}
                              disabled={loading}
                            >
                              <Check className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                              aria-label="Cancel edit"
                              tooltip="Cancel"
                              variant="secondary"
                              size="sm"
                              onClick={cancelEdit}
                              disabled={loading}
                            >
                              <X className="h-4 w-4" />
                            </IconButton>
                          </>
                        ) : (
                          <>
                            <IconButton
                              aria-label="Edit teacher"
                              tooltip="Edit"
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(t)}
                            >
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                            {t.status === "active" ? (
                              <IconButton
                                aria-label="Deactivate teacher"
                                tooltip="Deactivate"
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleStatus(t.id, t.status)}
                                className="text-warning hover:bg-warning-subtle"
                              >
                                <UserX className="h-4 w-4" />
                              </IconButton>
                            ) : (
                              <IconButton
                                aria-label="Activate teacher"
                                tooltip="Activate"
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleStatus(t.id, t.status)}
                                className="text-success hover:bg-success-subtle"
                              >
                                <UserCheck className="h-4 w-4" />
                              </IconButton>
                            )}
                            <IconButton
                              aria-label="Delete teacher"
                              tooltip="Delete"
                              variant="danger"
                              size="sm"
                              onClick={() => deleteTeacher(t)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

// ─── Students ────────────────────────────────────────────────────────────────

function StudentPanel({ token }) {
  const { showConfirm } = useModal();
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tab, setTab] = useState("list"); // list | add | csv
  const [form, setForm] = useState({ roll: "", password: "", email: "", name: "" });
  const [csvText, setCsvText] = useState("");
  const [csvResult, setCsvResult] = useState(null);
  const fileRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", roll_number: "", password: "" });

  const load = useCallback(() => {
    apiRequest("/admin/users?role=student", {}, token)
      .then((r) => setStudents(r.data.users))
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? students.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.roll_number || "").includes(q) ||
            s.email.toLowerCase().includes(q)
        )
      : students;
  }, [search, students]);

  async function handleAddStudent(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!form.roll || !form.password) { setError("Roll and password required."); return; }
    setLoading(true);
    try {
      await apiRequest("/admin/create-student", {
        method: "POST",
        body: JSON.stringify(form),
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
        body: JSON.stringify({ csvContent: csvText }),
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
        body: JSON.stringify({ status: next }),
      }, token);
      setSuccess(`Student ${next === "active" ? "activated" : "deactivated"}.`);
      load();
    } catch (err) { setError(err.message); }
  }

  function startEdit(student) {
    setEditingId(student.id);
    setEditForm({
      name: student.name || "",
      email: student.email || "",
      roll_number: student.roll_number || "",
      password: "",
    });
    setError(""); setSuccess("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: "", email: "", roll_number: "", password: "" });
  }

  async function saveEdit(id) {
    setError(""); setSuccess("");
    const payload = {};
    if (editForm.name.trim()) payload.name = editForm.name.trim();
    if (editForm.email.trim()) payload.email = editForm.email.trim();
    if (editForm.roll_number.trim()) payload.roll_number = editForm.roll_number.trim();
    if (editForm.password) payload.password = editForm.password;
    if (Object.keys(payload).length === 0) { setError("Nothing to update."); return; }
    setLoading(true);
    try {
      await apiRequest(`/admin/users/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }, token);
      setSuccess("Student updated.");
      cancelEdit();
      load();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function deleteStudent(student) {
    setError(""); setSuccess("");
    const ok = await showConfirm({
      title: "Delete Student",
      message: `Permanently delete ${student.name} (${student.roll_number || student.email})? Their exam history will also be removed. This cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
    });
    if (!ok) return;
    setLoading(true);
    try {
      await apiRequest(`/admin/users/${student.id}`, { method: "DELETE" }, token);
      setSuccess(`Student ${student.name} deleted.`);
      load();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Students</CardTitle>
          <CardDescription>
            Exam takers. Can be added individually or in bulk via CSV.
          </CardDescription>
        </div>
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setError(""); setSuccess(""); }}>
          <TabsList>
            <TabsTrigger value="list">
              <Users className="h-4 w-4" /> All
            </TabsTrigger>
            <TabsTrigger value="add">
              <UserPlus className="h-4 w-4" /> Add
            </TabsTrigger>
            <TabsTrigger value="csv">
              <FileSpreadsheet className="h-4 w-4" /> CSV
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardBody className="space-y-4">
        <Alert tone="error">{error}</Alert>
        <Alert tone="success">{success}</Alert>

        {tab === "list" ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="max-w-md w-full">
                <Input
                  type="text"
                  placeholder="Search by name, roll, or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  leftIcon={<Search className="h-4 w-4" />}
                />
              </div>
              <p className="text-xs text-ink-muted">
                {filtered.length} of {students.length} student(s)
              </p>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={Users}
                title={students.length === 0 ? "No students yet" : "No students match your search"}
                description={
                  students.length === 0
                    ? "Add a student individually or upload a CSV to get started."
                    : "Try a different search term."
                }
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Roll</Th>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Status</Th>
                    <Th>Created</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const isEditing = editingId === s.id;
                    return (
                      <tr key={s.id} className="hover:bg-bg/60 transition-colors align-top">
                        <Td>
                          {isEditing ? (
                            <Input
                              value={editForm.roll_number}
                              onChange={(e) => setEditForm((f) => ({ ...f, roll_number: e.target.value }))}
                              maxLength={7}
                              placeholder="7-digit roll"
                              className="font-mono"
                            />
                          ) : (
                            <code className="text-xs font-mono bg-bg px-2 py-0.5 rounded">
                              {s.roll_number || "—"}
                            </code>
                          )}
                        </Td>
                        <Td className="font-medium">
                          {isEditing ? (
                            <Input
                              value={editForm.name}
                              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                              placeholder="Name"
                            />
                          ) : (
                            s.name
                          )}
                        </Td>
                        <Td className="text-ink-muted text-xs">
                          {isEditing ? (
                            <div className="space-y-2">
                              <Input
                                value={editForm.email}
                                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                                placeholder="Email"
                                type="email"
                              />
                              <PasswordInput
                                value={editForm.password}
                                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                                placeholder="New password (leave blank to keep)"
                              />
                            </div>
                          ) : (
                            s.email
                          )}
                        </Td>
                        <Td><StatusPill status={s.status} /></Td>
                        <Td className="text-ink-muted text-xs tabular-nums">
                          {new Date(s.created_at).toLocaleDateString()}
                        </Td>
                        <Td className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isEditing ? (
                              <>
                                <IconButton
                                  aria-label="Save changes"
                                  tooltip="Save"
                                  variant="primary"
                                  size="sm"
                                  onClick={() => saveEdit(s.id)}
                                  disabled={loading}
                                >
                                  <Check className="h-4 w-4" />
                                </IconButton>
                                <IconButton
                                  aria-label="Cancel edit"
                                  tooltip="Cancel"
                                  variant="secondary"
                                  size="sm"
                                  onClick={cancelEdit}
                                  disabled={loading}
                                >
                                  <X className="h-4 w-4" />
                                </IconButton>
                              </>
                            ) : (
                              <>
                                <IconButton
                                  aria-label="Edit student"
                                  tooltip="Edit"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => startEdit(s)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </IconButton>
                                {s.status === "active" ? (
                                  <IconButton
                                    aria-label="Deactivate student"
                                    tooltip="Deactivate"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleStatus(s.id, s.status)}
                                    className="text-warning hover:bg-warning-subtle"
                                  >
                                    <UserX className="h-4 w-4" />
                                  </IconButton>
                                ) : (
                                  <IconButton
                                    aria-label="Activate student"
                                    tooltip="Activate"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleStatus(s.id, s.status)}
                                    className="text-success hover:bg-success-subtle"
                                  >
                                    <UserCheck className="h-4 w-4" />
                                  </IconButton>
                                )}
                                <IconButton
                                  aria-label="Delete student"
                                  tooltip="Delete"
                                  variant="danger"
                                  size="sm"
                                  onClick={() => deleteStudent(s)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </IconButton>
                              </>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </>
        ) : null}

        {tab === "add" ? (
          <form
            onSubmit={handleAddStudent}
            className="rounded-lg border border-border bg-bg p-4 space-y-4"
          >
            <h4 className="text-sm font-semibold text-ink">New Student Account</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Roll Number"
                htmlFor="student-roll"
                required
                hint="7 digits, e.g. 2007001"
              >
                <Input
                  id="student-roll"
                  type="text"
                  maxLength={7}
                  value={form.roll}
                  onChange={(e) => setForm((f) => ({ ...f, roll: e.target.value }))}
                  placeholder="2007001"
                  required
                />
              </FormField>
              <FormField
                label="Password"
                htmlFor="student-password"
                required
                hint="Minimum 6 characters"
              >
                <PasswordInput
                  id="student-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Student password"
                  required
                />
              </FormField>
              <FormField label="Name" htmlFor="student-name" hint="Optional">
                <Input
                  id="student-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                />
              </FormField>
              <FormField label="Email" htmlFor="student-email" hint="Auto-generated if blank">
                <Input
                  id="student-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="student@kuet.ac.bd"
                />
              </FormField>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setTab("list")}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" /> Create Student
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : null}

        {tab === "csv" ? (
          <form
            onSubmit={handleCSVUpload}
            className="rounded-lg border border-border bg-bg p-4 space-y-4"
          >
            <div>
              <h4 className="text-sm font-semibold text-ink">Bulk upload via CSV</h4>
              <p className="text-xs text-ink-muted mt-1">
                CSV needs a header row with columns:{" "}
                <code className="rounded bg-surface border border-border px-1.5 py-0.5 text-[11px]">roll</code>,{" "}
                <code className="rounded bg-surface border border-border px-1.5 py-0.5 text-[11px]">password</code>
                , and optionally{" "}
                <code className="rounded bg-surface border border-border px-1.5 py-0.5 text-[11px]">name</code>,{" "}
                <code className="rounded bg-surface border border-border px-1.5 py-0.5 text-[11px]">email</code>.
              </p>
            </div>

            <FormField label="Choose CSV file" htmlFor="csv-file">
              <label className="flex items-center gap-3 cursor-pointer rounded-md border border-dashed border-border-strong bg-surface px-4 py-3 hover:bg-bg/50 transition-colors">
                <Upload className="h-4 w-4 text-ink-muted" />
                <span className="text-sm text-ink-muted">
                  Click to select a .csv file
                </span>
                <input
                  id="csv-file"
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileLoad}
                  className="sr-only"
                />
              </label>
            </FormField>

            <FormField label="Or paste CSV content" htmlFor="csv-text">
              <Textarea
                id="csv-text"
                rows={8}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={"roll,password,name\n2007001,pass123,Alice\n2007002,pass456,Bob"}
                className="font-mono text-xs"
              />
            </FormField>

            <div className="flex justify-end">
              <Button type="submit" disabled={loading || !csvText.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" /> Upload Students
                  </>
                )}
              </Button>
            </div>

            {csvResult ? (
              <div className="rounded-md border border-border bg-surface p-3 text-sm">
                <p className="font-medium text-ink">
                  <CheckCircle2 className="inline h-4 w-4 text-success mr-1 -mt-0.5" />
                  {csvResult.created} created · {csvResult.skipped} skipped
                </p>
                {csvResult.errors.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                    {csvResult.errors.map((e, i) => (
                      <li key={i}>
                        <code className="text-danger">{e.roll}</code>: {e.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}

// ─── Main Admin Dashboard ─────────────────────────────────────────────────────

export default function AdminDashboard({ token }) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="mx-auto max-w-[1400px] w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Admin Panel</h1>
          <p className="text-sm text-ink-muted mt-1">
            Institution control — manage users, access, and platform settings.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutDashboard className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="teachers">
            <GraduationCap className="h-4 w-4" /> Teachers
          </TabsTrigger>
          <TabsTrigger value="students">
            <Users className="h-4 w-4" /> Students
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">
              Platform Overview
            </h2>
            <StatsPanel token={token} />
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>How Invigilo works</CardTitle>
                <CardDescription>
                  Quick reference on accounts and access.
                </CardDescription>
              </div>
              <Info className="h-5 w-5 text-info" />
            </CardHeader>
            <CardBody>
              <ul className="space-y-3 text-sm text-ink-muted">
                <li className="flex gap-3">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Only Admin can create Teacher and Student accounts — no public registration.</span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>
                    Students can log in with <strong className="text-ink">email + password</strong> or
                    by <strong className="text-ink">Roll Number + Password</strong>.
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>
                    Students can also enter an exam directly via a{" "}
                    <strong className="text-ink">Room Key + Roll Number</strong> without logging in.
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Deactivating a user immediately blocks all future logins for that account.</span>
                </li>
              </ul>
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="teachers">
          <TeacherPanel token={token} />
        </TabsContent>

        <TabsContent value="students">
          <StudentPanel token={token} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
