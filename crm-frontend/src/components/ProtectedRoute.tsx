import { Navigate, Outlet } from 'react-router-dom';

interface ProtectedRouteProps {
  allowedRoles?: string[];
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const jwt = localStorage.getItem('jwt');
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;

  if (!jwt || !user) {
    return <Navigate to="/login" replace />;
  }

  // Handle role structure
  const userRole = user.role?.type || user.role?.name?.toLowerCase() || user.role;

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // If user is admin trying to access employee area or vice-versa
    const homePath = userRole === 'admin' ? '/admin/leads' : '/employee/leads';
    return <Navigate to={homePath} replace />;
  }

  return <Outlet />;
}
