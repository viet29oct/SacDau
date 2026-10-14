import Reveal from './Reveal';
import { MapIcon, BoltIcon, ShieldIcon } from './icons';

const features = [
  {
    icon: MapIcon,
    title: 'Bản đồ trạm sạc không gian',
    desc: 'Trực quan hóa toàn bộ hệ thống trạm sạc, tận dụng thuật toán GIS để tính toán đường đi tối ưu nhất tới trạm gần bạn.',
  },
  {
    icon: BoltIcon,
    title: 'Cập nhật theo thời gian thực',
    desc: 'Giám sát trạng thái thiết bị IoT của trụ sạc (đang rảnh, đang sạc, bảo trì) để tài xế không phải chờ đợi.',
  },
  {
    icon: ShieldIcon,
    title: 'Thanh toán an toàn',
    desc: 'Tích hợp cổng thanh toán VNPay, trừ tiền tự động sau mỗi phiên sạc và xuất hóa đơn minh bạch.',
  },
];

export default function FeaturesSection() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-5xl px-6">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-navy">Tính năng nổi bật</h2>
          <p className="mt-2 text-slate-600">Mọi thứ bạn cần để vận hành và sử dụng mạng lưới trạm sạc</p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }, i) => (
            <Reveal key={title} delay={i * 120}>
              <div className="group h-full rounded-xl border border-slate-200 bg-white p-8 shadow-sm transition duration-300 hover:-translate-y-2 hover:border-forest/40 hover:shadow-xl">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-forest/10 text-forest transition group-hover:bg-forest group-hover:text-white">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-navy">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
