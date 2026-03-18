import { PropsWithChildren, useEffect } from "react";
import { authApi } from "@/features/auth/api/authApi";
import { authStore, hydrateAuthToken } from "@/features/auth/store/authStore";

export function AuthBootstrap({ children }: PropsWithChildren) {
  const token = authStore((state) => state.token);
  const isHydrated = authStore((state) => state.isHydrated);
  const isAuthReady = authStore((state) => state.isAuthReady);
  const setUser = authStore((state) => state.setUser);
  const clearSession = authStore((state) => state.clearSession);
  const markAuthReady = authStore((state) => state.markAuthReady);

  useEffect(() => {
    hydrateAuthToken();
  }, []);

  useEffect(() => {
    if (!isHydrated || isAuthReady) {
      return;
    }

    if (!token) {
      markAuthReady();
      return;
    }

    const bootstrapProfile = async () => {
      try {
        const profile = await authApi.profile();
        setUser(profile);
      } catch {
        clearSession();
      } finally {
        markAuthReady();
      }
    };

    void bootstrapProfile();
  }, [token, isHydrated, isAuthReady, setUser, clearSession, markAuthReady]);

  return <>{children}</>;
}
