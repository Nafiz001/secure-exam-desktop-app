const API_BASE_URL =
  window.location.protocol === "file:" || !window.location.hostname
    ? "http://localhost:5000/api"
    : `${window.location.protocol}//${window.location.hostname}:5000/api`;

let unauthorizedHandler = null;

// Registered once by the app shell so any 401 response (expired/invalid
// token) can force a logout, instead of leaving the user stuck on a
// page that keeps failing requests silently.
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

function handleUnauthorized(message) {
  if (unauthorizedHandler) {
    unauthorizedHandler(message);
  }
}

export async function apiRequest(path, options = {}, token = null) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    if (response.status === 401 && token) {
      handleUnauthorized(data.message);
    }
    const error = new Error(data.message || "Request failed");
    error.data = data.data;
    throw error;
  }

  return data;
}

export async function apiUpload(path, file, token = null) {
  const formData = new FormData();
  formData.append("image", file);

  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: formData
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    if (response.status === 401 && token) {
      handleUnauthorized(data.message);
    }
    throw new Error(data.message || "Upload failed");
  }

  return data;
}

export function resolveUploadUrl(uploadPath) {
  if (!uploadPath) return "";
  // Question images are base64 data URIs (embedded in the DB row itself so
  // they're visible from any machine, not just whichever one received the
  // upload) — return as-is, nothing to resolve against a server origin.
  if (/^data:/i.test(uploadPath)) return uploadPath;
  if (/^https?:\/\//i.test(uploadPath)) return uploadPath;
  const serverOrigin = API_BASE_URL.replace(/\/api\/?$/, "");
  return `${serverOrigin}${uploadPath}`;
}

export { API_BASE_URL };
