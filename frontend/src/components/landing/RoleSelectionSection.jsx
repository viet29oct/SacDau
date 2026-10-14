import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Reveal from './Reveal';
import AuthGateModal from './AuthGateModal';

const roles = [
  {
    key: 'driver',
    image: '/images/taixe.png',
    title: 'Dành cho Tài xế',
    desc: 'Tìm trạm, đặt chỗ và theo dõi phiên sạc của bạn mọi lúc, mọi nơi.',
    path: '/driver-dashboard',
  },
  {
    key: 'owner',
    image: '/images/chutram.png',
    title: 'Dành cho Chủ trạm',
    desc: 'Quản lý trạm sạc, theo dõi doanh thu và báo cáo vận hành.',
    path: '/station-dashboard',
  },
];

export default function RoleSelectionSection() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);

  function handleSelect(path) {
    if (!user) {
      setModalOpen(true);
      return;
    }
    navigate(path);
  }

  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-5xl px-6">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-navy">Bạn là ai?</h2>
          <p className="mt-2 text-slate-600">Chọn vai trò để vào đúng khu vực dành cho bạn</p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-2">
          {roles.map((role, i) => (
            <Reveal key={role.key} delay={i * 150}>
              <button
                onClick={() => handleSelect(role.path)}
                className="group w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl"
              >
                <div className="h-56 w-full overflow-hidden bg-slate-100">
                  <img
                    src={role.image}
                    alt={role.title}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold text-navy">{role.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{role.desc}</p>
                  <span className="mt-4 inline-block text-sm font-semibold text-forest group-hover:underline">
                    Vào ngay →
                  </span>
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      </div>

      <AuthGateModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}
