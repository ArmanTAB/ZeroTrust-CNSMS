// frontend/src/router.tsx - Update to include agent management routes
import { createBrowserRouter } from "react-router-dom";
import MainLayout from "./components/Layout/MainLayout";
import LoginPage from "./pages/Auth/LoginPage";
import RegisterPage from "./pages/Auth/RegisterPage";
import VerifyEmailPage from "./pages/Auth/VerifyEmailPage";
import ForgotPasswordPage from "./pages/Auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/Auth/ResetPasswordPage";
import DashboardPage from "./pages/Dashboard/DashboardPage";
import DevicesPage from "./pages/Devices/DevicesPage";
import DeviceDetailsPage from "./pages/Devices/DeviceDetailsPage";
import AccessLogsPage from "./pages/Access/AccessLogsPage";
import GoogleDrivePage from "./pages/GoogleDrive/GoogleDrivePage";
import SettingsPage from "./pages/Settings/SettingsPage";
import SecurityPage from "./pages/Security/SecurityPage";
import Profile2FAPage from "./pages/Profile/Profile2FAPage";
import NotFoundPage from "./pages/NotFoundPage";

// Agent Management Pages
import AgentUsersPage from "./pages/Agent/AgentUsersPage";
import AgentUserFormPage from "./pages/Agent/AgentUserFormPage";
import AgentRulesPage from "./pages/Agent/AgentRulesPage";
import AgentRuleFormPage from "./pages/Agent/AgentRuleFormPage";
import AgentDashboardPage from "./pages/Agent/AgentDashboardPage";

// Auth wrapper components
import AuthLayout from "./components/Layout/AuthLayout";
import ProtectedRoute from "./components/Auth/ProtectedRoute";

export const router = createBrowserRouter([
  // Auth routes
  {
    path: "/",
    element: <AuthLayout />,
    children: [
      {
        path: "login",
        element: <LoginPage />,
      },
      {
        path: "register",
        element: <RegisterPage />,
      },
      {
        path: "verify-email",
        element: <VerifyEmailPage />,
      },
      {
        path: "forgot-password",
        element: <ForgotPasswordPage />,
      },
      {
        path: "reset-password",
        element: <ResetPasswordPage />,
      },
    ],
  },

  // Protected routes
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/",
        element: <MainLayout />,
        children: [
          {
            path: "/",
            element: <DashboardPage />,
          },
          {
            path: "dashboard",
            element: <DashboardPage />,
          },
          {
            path: "devices",
            element: <DevicesPage />,
          },
          {
            path: "devices/:id",
            element: <DeviceDetailsPage />,
          },
          {
            path: "access-logs",
            element: <AccessLogsPage />,
          },
          {
            path: "google-drive",
            element: <GoogleDrivePage />,
          },
          {
            path: "settings",
            element: <SettingsPage />,
          },
          {
            path: "security",
            element: <SecurityPage />,
          },
          {
            path: "profile/2fa",
            element: <Profile2FAPage />,
          },

          // Agent Management Routes
          {
            path: "agent",
            element: <AgentDashboardPage />,
          },
          {
            path: "agent/users",
            element: <AgentUsersPage />,
          },
          {
            path: "agent/users/new",
            element: <AgentUserFormPage />,
          },
          {
            path: "agent/users/:id",
            element: <AgentUserFormPage />,
          },
          {
            path: "agent/rules",
            element: <AgentRulesPage />,
          },
          {
            path: "agent/rules/new",
            element: <AgentRuleFormPage />,
          },
          {
            path: "agent/rules/:id",
            element: <AgentRuleFormPage />,
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

export default router;
