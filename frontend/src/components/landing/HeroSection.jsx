import { useRef } from 'react';
import { useMouseGradient } from '../../hooks/useMouseGradient';
import { useParallax } from '../../hooks/useParallax';

export default function HeroSection() {
  const gradientRef = useRef(null);
  const bgRef = useRef(null);

  useMouseGradient(gradientRef);
  useParallax(bgRef, 0.25);

  return (
    <section
      ref={gradientRef}
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{
        background:
          'radial-gradient(600px circle at var(--mx, 50%) var(--my, 40%), rgba(42, 98, 61, 0.45), transparent 60%), linear-gradient(135deg, #113259, #2a623d)',
      }}
    >
      <div
        ref={bgRef}
        className="absolute inset-0 -z-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: "url('/images/bg1.jpg')" }}
      />
      <div className="absolute inset-0 bg-navy-dark/40" />

      <div className="relative mx-auto max-w-2xl px-6 text-center">
        <div className="animate-landing-float rounded-3xl border border-white/20 bg-white/10 p-10 shadow-2xl backdrop-blur-xl">
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
            Sạc<span className="text-forest-light">Đâu</span>
          </h1>
          <p className="mt-4 text-base text-white/85 sm:text-lg">
            Tìm trạm sạc, đặt chỗ và thanh toán cho xe điện của bạn — tất cả trong một nền tảng duy
            nhất, theo thời gian thực.
          </p>
          <a
            href="/gioi-thieu"
            className="mt-8 inline-block rounded-md bg-forest px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest-light hover:shadow-lg"
          >
            Tìm hiểu thêm
          </a>
        </div>
      </div>
    </section>
  );
}
