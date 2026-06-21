import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { UserRole } from "../types";

interface RoleGuardProps {
  allowedRoles: UserRole[];
  redirectPath?: string;
}

const RoleGuard: React.FC<RoleGuardProps> = ({
  allowedRoles,
  redirectPath = "/dashboard",
}) => {
  const { user } = useAuth();

  // If user doesn't exist or their role is not in the list of allowed roles
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to={redirectPath} replace />;
  }

  // If the user has permission, render the child routes
  return <Outlet />;
};

export default RoleGuard;
