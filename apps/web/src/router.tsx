import { lazy, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { SimpleLayout } from '@/layouts/SimpleLayout';
import { useAppSelector } from '@/store';
import { RouteError } from '@/pages/RouteError';
import { RequireAdmin } from '@/features/admin/RequireAdmin';

const VariantTranslatorPage = lazy(() => import('@/pages/VariantTranslatorPage'));
const ProviderSettingsPage = lazy(() => import('@/pages/ProviderSettingsPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));
const UsagePage = lazy(() => import('@/pages/UsagePage'));
const ConnectPage = lazy(() => import('@/pages/ConnectPage'));

/** Sends the user to /connect until a token is stored and accepted by the server. */
function RequireConnection({ children }: { children: ReactNode }) {
  const { token, unauthorized } = useAppSelector((s) => s.connection);
  const location = useLocation();
  if (!token || unauthorized) {
    return <Navigate to="/connect" replace state={{ from: location.pathname, reason: unauthorized ? 'unauthorized' : undefined }} />;
  }
  return <>{children}</>;
}

export const router = createBrowserRouter([
  { path: '/connect', element: <ConnectPage />, errorElement: <RouteError /> },
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
      { path: 'settings/providers', element: <RequireAdmin><ProviderSettingsPage /></RequireAdmin> },
      { path: 'users', element: <RequireAdmin><UsersPage /></RequireAdmin> },
      { path: 'usage', element: <RequireAdmin><UsagePage /></RequireAdmin> },
      { path: 'settings', element: <Navigate to="/" replace /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
