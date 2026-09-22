import React from 'react';
import { createRoot } from 'react-dom/client';
import CloudApp from './CloudApp';
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
        <CloudApp />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

void bootstrap().catch((error: unknown) => {
  const status = document.getElementById('startup-status');
  if (status) status.textContent = `Nerdbot could not open your settings: ${error instanceof Error ? error.message : 'startup failed'}. Tap Reload Nerdbot to retry.`;
  console.error('Nerdbot startup failed:', error);
});
