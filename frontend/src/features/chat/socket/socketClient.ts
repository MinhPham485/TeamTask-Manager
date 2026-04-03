import { io, Socket } from "socket.io-client";
import { authStore } from "@/features/auth/store/authStore";
import { env } from "@/shared/config/env";

let socket: Socket | null = null;

export function getSocketClient() {
  if (socket) {
    return socket;
  }

  const socketUrl = env.socketUrl === "/socket.io" ? undefined : env.socketUrl;

  socket = io(socketUrl, {
    autoConnect: false,
    path: "/socket.io",
    auth: {
      token: authStore.getState().token,
    },
  });

  return socket;
}

export function reconnectSocketAuthToken() {
  if (!socket) {
    return;
  }

  socket.auth = { token: authStore.getState().token };
}

export function disconnectSocketClient() {
  if (!socket) {
    return;
  }

  socket.disconnect();
  socket = null;
}
