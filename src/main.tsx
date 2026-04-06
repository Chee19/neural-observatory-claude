import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { install, observe } from '@twind/core';
import presetTailwind from '@twind/preset-tailwind';
import App from './App.tsx';

const tw = install({
  presets: [presetTailwind()],
});
observe(tw, document.documentElement);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
