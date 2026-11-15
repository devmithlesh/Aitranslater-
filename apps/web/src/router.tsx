import { lazy, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { SimpleLayout } from '@/layouts/SimpleLayout';
import { useAppSelector } from '@/store';
import { useMeQuery } from '@/store/api';
import { RouteError } from '@/pages/RouteError';
import LoginPage from '@/pages/LoginPage';
import SignupPage from '@/pages/SignupPage';
import PrivacyPage from '@/pages/PrivacyPage';
import { RequireAdmin } from '@/features/admin/RequireAdmin';
import { readFromState } from '@/features/auth/redirect';

const VariantTranslatorPage = lazy(() => import('@/pages/VariantTranslatorPage'));
const ProviderSettingsPage = lazy(() => import('@/pages/ProviderSettingsPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));
const UsagePage = lazy(() => import('@/pages/UsagePage'));
const ConnectPage = lazy(() => import('@/pages/ConnectPage'));
const ChangePasswordPage = lazy(() => import('@/pages/ChangePasswordPage'));
const ConnectExtensionPage = lazy(() => import('@/pages/ConnectExtensionPage'));

/**
 * Sends signed-out visitors to /login, and holds app routes until the account is known.
 * An admin-reset account is confined to /account/password until it chooses a new password.
 */
function RequireConnection({ children }: { children: ReactNode }) {
  const { token, unauthorized } = useAppSelector((s) => s.connection);
  const location = useLocation();
  const signedIn = !!token && !unauthorized;
  const me = useMeQuery(undefined, { skip: !signedIn });

  if (!signedIn) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname, reason: unauthorized ? 'unauthorized' : undefined }}
      />
    );
  }
  if (!me.data && !me.isError) {
    return (
      <div className="flex justify-center py-24 text-brand">
        <Spinner size={22} />
      </div>
    );
  }
  if (me.data?.mustChangePassword && !location.pathname.startsWith('/account/password')) {
    return <Navigate to="/account/password" replace />;
  }
  return <>{children}</>;
}

/** Login and signup are for signed-out visitors; signed-in users continue to where they were going. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { token, unauthorized } = useAppSelector((s) => s.connection);
  const location = useLocation();
  if (token && !unauthorized) return <Navigate to={readFromState(location.state)} replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <GuestOnly>
        <LoginPage />
      </GuestOnly>
    ),
    errorElement: <RouteError />,
  },
  {
    path: '/signup',
    element: (
      <GuestOnly>
        <SignupPage />
      </GuestOnly>
    ),
    errorElement: <RouteError />,
  },
  { path: '/connect', element: <ConnectPage />, errorElement: <RouteError /> },
  // Public: linked from the Chrome Web Store listing, readable without an account.
  { path: '/privacy', element: <PrivacyPage />, errorElement: <RouteError /> },
  {
    path: '/',
    element: (
      <RequireConnection>
        <SimpleLayout />
      </RequireConnection>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <VariantTranslatorPage /> },
      { path: 'account/password', element: <ChangePasswordPage /> },
      { path: 'account/extension', element: <ConnectExtensionPage /> },
      { path: 'settings/providers', element: <RequireAdmin><ProviderSettingsPage /></RequireAdmin> },
      { path: 'users', element: <RequireAdmin><UsersPage /></RequireAdmin> },
      { path: 'usage', element: <RequireAdmin><UsagePage /></RequireAdmin> },
      { path: 'settings', element: <Navigate to="/" replace /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
