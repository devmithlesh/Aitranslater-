import '@fontsource-variable/inter';
import '../styles/pages.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SidePanel } from './SidePanel';

const container = document.getElementById('root');
if (!container) throw new Error('Verba side panel: missing #root element');

createRoot(container).render(
  <StrictMode>
    <SidePanel />
  </StrictMode>,
);
