'use client';
import { useEffect } from 'react';

const V = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';
const FILES = ['d3-format.min.js', 'dash.js', 'app.js', 'boot.js'];

declare global {
  interface Window { __x5loaded?: boolean }
}

/** Ilova skriptlari React gidratsiyadan KEYIN, tartib bilan yuklanadi (DOM'ni gidratsiyadan oldin o'zgartirmaslik uchun). */
export function Scripts() {
  useEffect(() => {
    if (window.__x5loaded) return;
    window.__x5loaded = true;
    (async () => {
      for (const f of FILES) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = `/app/${f}?v=${V}`;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('Yuklanmadi: ' + f));
          document.body.appendChild(s);
        });
      }
    })().catch((e) => console.error(e));
  }, []);
  return null;
}
