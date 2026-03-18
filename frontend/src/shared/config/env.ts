const fallbackApiUrl = "http://localhost:5000";
const fallbackSocketUrl = "http://localhost:5000";

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? fallbackApiUrl,
  socketUrl: import.meta.env.VITE_SOCKET_URL ?? fallbackSocketUrl,
} as const;
