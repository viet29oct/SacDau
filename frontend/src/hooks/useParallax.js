import { useEffect } from 'react';

export function useParallax(ref, speed = 0.3) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    function handleScroll() {
      el.style.transform = `translateY(${window.scrollY * speed}px)`;
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [ref, speed]);
}
