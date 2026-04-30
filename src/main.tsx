import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { install, observe } from '@twind/core';
import presetTailwind from '@twind/preset-tailwind';
import App from './App.tsx';
import { registerServiceWorker } from './lib/registerServiceWorker.ts';

const tw = install({
  presets: [presetTailwind()],
});
observe(tw, document.documentElement);

const root = document.getElementById('root')!;
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Fade out the pre-render loader once React has painted
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const loader = document.getElementById('pre-loader');
    if (loader) loader.classList.add('hidden');
  });
});

registerServiceWorker();
