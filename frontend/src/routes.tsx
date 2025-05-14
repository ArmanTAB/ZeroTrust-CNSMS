// Update routes.tsx to include agent management routes

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/Auth/LoginPage";
import RegisterPage from "./pages/Auth/RegisterPage";
import VerifyEmailPage from "./pages/Auth/VerifyEmailPage";
import ForgotPasswordPage from "./pages/Auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/Auth/ResetPasswordPage";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardPage from "./pages/Dashboard/DashboardPage";
import DevicesPage from "./pages/Devices/DevicesPage";
import DeviceDetailsPage from "./pages/Devices/DeviceDetailsPage";
import AccessLogsPage from "./pages/AccessLogs/AccessLogsPage";
import NotFoundPage from "./pages/NotFoundPage";
import ProfilePage from "./pages/Profile/ProfilePage";
import GoogleDrivePage from "./pages/GoogleDrive/GoogleDrivePage";

// Import Agent pages
import AgentDashboardPage from "./pages/Agent/AgentDashboardPage";
import AgentUsersPage from "./pages/Agent/AgentUsersPage";
import AgentUserFormPage from "./pages/Agent/AgentUserFormPage";
import AgentRulesPage from "./pages/Agent/AgentRulesPage";
import AgentRuleForm from "./pages/Agent/AgentRuleForm";

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/devices/:deviceId" element={<DeviceDetailsPage />} />
        <Route path="/access-logs" element={<AccessLogsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/google-drive" element={<GoogleDrivePage />} />

        {/* Agent Management Routes */}
        <Route path="/agent" element={<AgentDashboardPage />} />
        <Route path="/agent/users" element={<AgentUsersPage />} />
        <Route path="/agent/users/new" element={<AgentUserFormPage />} />
        <Route path="/agent/users/:id" element={<AgentUserFormPage />} />
        <Route path="/agent/rules" element={<AgentRulesPage />} />
        <Route path="/agent/rules/new" element={<AgentRuleForm />} />
        <Route path="/agent/rules/:id/:action" element={<AgentRuleForm />} />
      </Route>

      {/* Redirect from main page */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* 404 page for unknown routes */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRoutes;
