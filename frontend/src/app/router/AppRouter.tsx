import { Navigate, Route, Routes } from "react-router-dom";
import { PrivateRoute, PublicOnlyRoute } from "@/app/router/RouteGuards";
import { AppShell } from "@/app/layouts/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { BoardPage } from "@/pages/BoardPage";
import { ChatPage } from "@/pages/ChatPage";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
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
          path="/board"
          element={
            <AppShell>
              <BoardPage />
            </AppShell>
          }
        />
        <Route
          path="/chat"
          element={
            <AppShell>
              <ChatPage />
            </AppShell>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
