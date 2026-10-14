import Reveal from './Reveal';

const steps = [
  { title: 'Tìm trạm sạc gần bạn', desc: 'Mở bản đồ, xem trạm nào còn trống và gần vị trí hiện tại nhất.' },
  { title: 'Đặt chỗ trước', desc: 'Chọn trụ sạc và khung giờ phù hợp, không lo đến nơi mà hết chỗ.' },
  {
    title: 'Sạc và theo dõi trực tiếp',
    desc: 'Cắm sạc và theo dõi công suất, điện năng theo thời gian thực ngay trên app.',
  },
  {
    title: 'Thanh toán tự động',
    desc: 'Phiên sạc kết thúc, hệ thống tính tiền và thanh toán qua VNPay, xuất hóa đơn minh bạch.',
  },
];

export default function HowItWorksSection() {
  return (
    <section className="bg-slate-50 py-24">
      <div className="mx-auto max-w-3xl px-6">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-navy">Quy trình hoạt động</h2>
          <p className="mt-2 text-slate-600">4 bước đơn giản để sạc xe không còn là nỗi lo</p>
        </Reveal>

        <div className="relative mt-16 border-l-2 border-forest/30 pl-10">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 140} className="relative pb-12 last:pb-0">
              <span className="absolute -left-[3.05rem] flex h-9 w-9 items-center justify-center rounded-full bg-forest text-sm font-bold text-white">
                {i + 1}
              </span>
              <h3 className="text-lg font-semibold text-navy">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
