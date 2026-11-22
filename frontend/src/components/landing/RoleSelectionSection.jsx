import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuthGateModal from './AuthGateModal';

const roles = [
  {
    key: 'driver',
    title: 'Dành cho Tài xế',
    desc: 'Tìm trạm, đặt chỗ và theo dõi phiên sạc của bạn mọi lúc, mọi nơi.',
    action: 'Mở trang tài xế',
    path: '/driver-dashboard',
  },
  {
    key: 'owner',
    title: 'Dành cho Quản lý trạm',
    desc: 'Theo dõi và vận hành các trạm được công ty phân công, xem báo cáo doanh thu.',
    action: 'Mở trang quản lý',
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
    <section className="section" aria-labelledby="roles-title">
      <div className="container close__grid">
        <figure
          className="close__photo"
          data-slot="photo-2"
          data-alt="Ảnh thật tại trạm SạcĐâu: cổng sạc trên xe với súng sạc đã cắm"
        >
          <img
            src="/images/photos/honda-electric-car-charging-on-private-parking-lot-in-tokyo-1920.jpg"
            width="1920"
            height="1446"
            alt="Súng sạc cắm trong hộc sạc mở trên nắp capo một chiếc xe điện màu trắng"
            loading="lazy"
          />
        </figure>

        <div>
          <h2 id="roles-title">Tài xế hay quản lý trạm?</h2>
          <p className="lead">Chọn vai trò để vào đúng khu vực dành cho bạn.</p>
          <div className="roles">
            {roles.map((role) => (
              <div key={role.key} className="role">
                <h3 className="role__title">{role.title}</h3>
                <p className="role__desc">{role.desc}</p>
                <button type="button" className="btn" onClick={() => handleSelect(role.path)}>
                  {role.action}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AuthGateModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}
