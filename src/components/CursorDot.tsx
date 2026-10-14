'use client';

import { useEffect, useRef } from 'react';

// Bolinha de 10px que segue o mouse com atraso. Só aparece com mouse (pointer: fine)
// e fica desligada com prefers-reduced-motion.
export function CursorDot() {
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!finePointer.matches || reducedMotion.matches) return;

    const dot = dotRef.current;
    if (!dot) return;

    document.documentElement.classList.add('has-cursor-dot');
    const target = { x: -100, y: -100 };
    const pos = { x: -100, y: -100 };
    let frame = 0;

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      dot.style.opacity = '1';
    };
    const onLeave = () => {
      dot.style.opacity = '0';
    };
    const tick = () => {
      pos.x += (target.x - pos.x) * 0.2;
      pos.y += (target.y - pos.y) * 0.2;
      dot.style.transform = `translate3d(${pos.x - 5}px, ${pos.y - 5}px, 0)`;
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    frame = requestAnimationFrame(tick);

    return () => {
      document.documentElement.classList.remove('has-cursor-dot');
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={dotRef} className="cursor-dot" aria-hidden="true" />;
}
