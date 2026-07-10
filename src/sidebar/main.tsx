import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { loadSettings } from '../services/config';

async function bootstrap() {
  const settings = await loadSettings();
  const root = document.documentElement;
  const apply = (mode: 'dark' | 'light') => {
    root.classList.toggle('dark', mode === 'dark');
    root.classList.toggle('light', mode === 'light');
  };
  if (settings.theme === 'system') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', (e) => apply(e.matches ? 'dark' : 'light'));
  } else {
    apply(settings.theme);
  }

  const node = document.getElementById('root');
  if (!node) return;
  createRoot(node).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

bootstrap();
