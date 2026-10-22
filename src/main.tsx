import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/vietnamese-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/vietnamese-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/vietnamese-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/vietnamese-700.css';
import '@fontsource/playfair-display/latin-500.css';
import '@fontsource/playfair-display/vietnamese-500.css';
import App from './App';
import './styles.css';

const params = new URLSearchParams(window.location.search);
const fallbackRoute = params.get('__dt_route');
if (fallbackRoute && /^bio\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fallbackRoute)) {
  const root = new URL(import.meta.env.BASE_URL, window.location.href);
  const nextPath = `${root.pathname.replace(/\/?$/, '/')}${fallbackRoute}`;
  window.history.replaceState(null, '', `${nextPath}${window.location.hash}`);
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
