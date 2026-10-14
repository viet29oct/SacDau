import Reveal from './Reveal';
import Counter from './Counter';

const stats = [
  { target: 500, suffix: '+', label: 'Trạm sạc trên toàn quốc' },
  { target: 10000, suffix: '+', label: 'Lượt sạc thành công' },
];

export default function StatsSection() {
  return (
    <section className="bg-forest py-16 text-white">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-6 text-center md:grid-cols-3">
        {stats.map((stat, i) => (
          <Reveal key={stat.label} delay={i * 120}>
            <Counter target={stat.target} suffix={stat.suffix} className="text-4xl font-bold" />
            <p className="mt-2 text-sm text-white/80">{stat.label}</p>
          </Reveal>
        ))}
        <Reveal delay={240}>
          <span className="text-4xl font-bold">24/7</span>
          <p className="mt-2 text-sm text-white/80">Hỗ trợ vận hành</p>
        </Reveal>
      </div>
    </section>
  );
}
