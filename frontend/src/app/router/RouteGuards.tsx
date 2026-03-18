import { Navigate, Outlet, useLocation } from "react-router-dom";
import { authStore } from "@/features/auth/store/authStore";

function AuthGatePlaceholder() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Preparing session...</h1>
        <p>Please wait while we restore your authentication state.</p>
      </div>
    </div>
  );
}

export function PrivateRoute() {
  const { token, isHydrated, isAuthReady } = authStore();
  const location = useLocation();

  if (!isHydrated || !isAuthReady) {
    return <AuthGatePlaceholder />;
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { token, isHydrated, isAuthReady } = authStore();

  if (!isHydrated || !isAuthReady) {
    return <AuthGatePlaceholder />;
  }

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
