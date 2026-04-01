import { io, Socket } from "socket.io-client";
import { authStore } from "@/features/auth/store/authStore";

let socket: Socket | null = null;

export function getSocketClient() {
  if (socket) {
    return socket;
  }

  socket = io("/socket.io", {
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
