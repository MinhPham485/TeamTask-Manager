import { create } from "zustand";
import { User } from "@/shared/types/models";

type AuthState = {
  token: string | null;
  user: User | null;
  currentGroupId: string | null;
  isHydrated: boolean;
  isAuthReady: boolean;
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  setSession: (payload: { token: string; user: User }) => void;
  clearSession: () => void;
  setCurrentGroup: (groupId: string | null) => void;
  markHydrated: () => void;
  markAuthReady: () => void;
};

const TOKEN_KEY = "teamtask.token";

export const authStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  currentGroupId: null,
  isHydrated: false,
  isAuthReady: false,
  setToken: (token) => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      set({ token });
      return;
    }

    localStorage.removeItem(TOKEN_KEY);
    set({ token: null });
  },
  setUser: (user) => set({ user }),
  setSession: ({ token, user }) => {
    localStorage.setItem(TOKEN_KEY, token);
    set({ token, user, isAuthReady: true });
  },
  clearSession: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, user: null, currentGroupId: null, isAuthReady: true });
  },
  setCurrentGroup: (groupId) => set({ currentGroupId: groupId }),
  markHydrated: () => set({ isHydrated: true }),
  markAuthReady: () => set({ isAuthReady: true }),
}));

export function hydrateAuthToken() {
  const token = localStorage.getItem(TOKEN_KEY);

  if (token) {
    authStore.setState({ token, isHydrated: true });
    return;
  }

  authStore.setState({ isHydrated: true });
}
