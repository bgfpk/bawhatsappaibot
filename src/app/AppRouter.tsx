import { StageAccountApplication } from '../staging/StageAccountApplication';
import React, { useState, useEffect, Suspense } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { PublicAuthApplication } from './PublicAuthApplication';
import { RouteLoadingFallback } from './RouteLoadingFallback';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { LazyProtectedDashboardApplication } from '../routes/lazy-routes';
import { CRM_UI_ENABLED, INBOX_UI_ENABLED } from '../config/product-flags';

export const ScrollToTop: React.FC = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const element = document.getElementById(hash.replace(/^#/, ''));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
};

export const AppRouter: React.FC = () => {
  const location = useLocation();
  const path = location.pathname.toLowerCase().replace(/\/+$/, '') || '/';

  const [hasSession, setHasSession] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem('currentUser'));
    } catch {
      return false;
    }
  });

  const signedOut = React.useCallback(() => setHasSession(false), []);

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        setHasSession(Boolean(localStorage.getItem('currentUser')));
      } catch {
        setHasSession(false);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const isPublicAuthRoute = import.meta.env.BLACKARROW_STAGE || path === '/login' || path === '/signup' || path === '/magic-link';

  if (path === '/billing/account') {
    return <Navigate to="/settings/billing" replace />;
  }

  if (path === '/terminal') {
    return <Navigate to="/live-monitor" replace />;
  }

  if (!CRM_UI_ENABLED && (path === '/crm' || path.startsWith('/crm/'))) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!INBOX_UI_ENABLED && (path === '/inbox' || path.startsWith('/inbox/'))) {
    return <Navigate to="/dashboard" replace />;
  }

  // If user is accessing public auth routes and has no active session, render lightweight PublicAuthApplication
  if (isPublicAuthRoute && !hasSession) {
    return (
      <>
        <ScrollToTop />
        <PublicAuthApplication
          onLoginSuccess={(userOrId: any) => {
            if (userOrId && typeof userOrId === 'object') {
              localStorage.setItem('currentUser', JSON.stringify(userOrId));
            } else if (userOrId) {
              localStorage.setItem('currentUser', JSON.stringify({ id: userOrId }));
            }
            setHasSession(true);
          }}
        />
      </>
    );
  }

  if (import.meta.env.BLACKARROW_STAGE) return <StageAccountApplication onSignedOut={signedOut} />;

  // Otherwise, load the protected dashboard application chunk dynamically
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<RouteLoadingFallback label="Loading BlackArrow Dashboard..." />}>
        <RouteErrorBoundary routeName="Dashboard Application">
          <LazyProtectedDashboardApplication />
        </RouteErrorBoundary>
      </Suspense>
    </>
  );
};
