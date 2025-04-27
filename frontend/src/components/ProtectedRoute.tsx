// src/components/ProtectedRoute.tsx
import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../store/AuthContext";

interface ProtectedRouteProps {
  redirectPath?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  redirectPath = "/login",
}) => {
  const { isAuthenticated, loading, user } = useAuth();

  // Показываем индикатор загрузки, пока проверяем аутентификацию
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Если пользователь не аутентифицирован, перенаправляем на страницу входа
  if (!isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  // Если пользователь аутентифицирован, но не верифицирован, перенаправляем на страницу верификации
  if (isAuthenticated && user && !user.is_verified) {
    return (
      <Navigate to="/verify-email" state={{ email: user.email }} replace />
    );
  }

  // Если пользователь аутентифицирован, показываем дочерние маршруты
  return <Outlet />;
};

export default ProtectedRoute;
