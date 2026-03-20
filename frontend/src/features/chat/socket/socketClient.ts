import { io, Socket } from "socket.io-client";
import { env } from "@/shared/config/env";
import { authStore } from "@/features/auth/store/authStore";

let socket: Socket | null = null;

export function getSocketClient() {
  if (socket) {
    return socket;
  }

  socket = io(env.socketUrl, {
    autoConnect: false,
    transports: ["websocket"],
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
