import '@fontsource-variable/inter';
import '../styles/pages.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Settings } from './Settings';

const container = document.getElementById('root');
if (!container) throw new Error('Verba settings: missing #root element');

createRoot(container).render(
  <StrictMode>
    <Settings />
  </StrictMode>,
);
