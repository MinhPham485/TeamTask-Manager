const fallbackApiUrl = "";
const fallbackSocketUrl = "/socket.io";

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? fallbackApiUrl,
  socketUrl: import.meta.env.VITE_SOCKET_URL ?? fallbackSocketUrl,
} as const;
