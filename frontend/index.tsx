import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'katex/dist/katex.min.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 五十三期：等 React 首帧真正渲染后再撤掉启动动画，避免内容还没出现 splash 就消失
const dismissSplash = () => {
  document.body.classList.add('app-ready');
  const splash = document.getElementById('boot-splash');
  if (!splash) return;
  splash.addEventListener('transitionend', () => splash.remove(), { once: true });
  window.setTimeout(() => splash.remove(), 900);
};
requestAnimationFrame(() => requestAnimationFrame(dismissSplash));