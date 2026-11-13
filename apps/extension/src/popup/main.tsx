import '@fontsource-variable/inter';
import '../styles/pages.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from './Popup';

const container = document.getElementById('root');
if (!container) throw new Error('Verba popup: missing #root element');

createRoot(container).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
