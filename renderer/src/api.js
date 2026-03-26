const API_BASE_URL =
  window.location.protocol === "file:" || !window.location.hostname
    ? "http://localhost:5000/api"
    : `${window.location.protocol}//${window.location.hostname}:5000/api`;

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
    throw new Error(data.message || "Request failed");
  }

  return data;
}

export { API_BASE_URL };
