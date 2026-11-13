import '@fontsource-variable/inter';
import './index.css';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from '@/components/ui';
import { router } from './router';
import { store, useAppSelector } from './store';
import { applyTheme } from './store/uiSlice';

/** Keeps "system" theme in sync with the OS setting. */
function SystemThemeListener() {
  const theme = useAppSelector((s) => s.ui.theme);
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <SystemThemeListener />
      <RouterProvider router={router} />
      <Toaster />
    </Provider>
  </StrictMode>,
);
