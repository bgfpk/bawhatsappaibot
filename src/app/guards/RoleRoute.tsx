import React, { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

interface RoleRouteProps {
  isAllowed: boolean;
  fallbackPath?: string;
  children: ReactNode;
}

export const RoleRoute: React.FC<RoleRouteProps> = ({
  isAllowed,
  fallbackPath = '/dashboard',
  children,
}) => {
  if (!isAllowed) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
};
