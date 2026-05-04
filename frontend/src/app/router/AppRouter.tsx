import { Navigate, Route, Routes } from "react-router-dom";
import { PrivateRoute, PublicOnlyRoute } from "@/app/router/RouteGuards";
import { AppShell } from "@/app/layouts/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { WorkspacePage } from "@/pages/WorkspacePage";
import { GroupDetailPage } from "@/pages/GroupDetailPage";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route element={<PrivateRoute />}>
        <Route
          path="/"
          element={
            <AppShell>
              <Navigate to="/dashboard" replace />
            </AppShell>
          }
        />
        <Route
          path="/dashboard"
          element={
            <AppShell>
              <DashboardPage />
            </AppShell>
          }
        />
        <Route
          path="/groups/:groupId"
          element={
            <AppShell>
              <GroupDetailPage />
            </AppShell>
          }
        />
        <Route
          path="/workspace"
          element={
            <AppShell>
              <WorkspacePage />
            </AppShell>
          }
        />
        <Route
          path="/board"
          element={
            <AppShell>
              <Navigate to="/workspace?tab=board" replace />
            </AppShell>
          }
        />
        <Route
          path="/chat"
          element={
            <AppShell>
              <Navigate to="/workspace?tab=chat" replace />
            </AppShell>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
