import axios from "axios";
import { authStore } from "@/features/auth/store/authStore";
import { env } from "@/shared/config/env";

export const http = axios.create({
  baseURL: `${env.apiBaseUrl}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

http.interceptors.request.use((config) => {
  const token = authStore.getState().token;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authStore.getState().clearSession();
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);
