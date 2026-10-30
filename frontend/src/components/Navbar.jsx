import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardPathForRole } from '../utils/roleDashboard';

const roleLabel = { driver: 'Tài xế', owner: 'Quản lý trạm', admin: 'Quản trị viên' };

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="flex items-center justify-between bg-navy px-6 py-3 text-white shadow">
      <Link to={dashboardPathForRole(user?.role)} className="text-lg font-semibold">
        Sạc<span className="text-forest-light">Đâu</span>
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <Link to="/stations" className="hover:underline">
          Bản đồ trạm
        </Link>
        <Link to="/bookings" className="hover:underline">
          Đặt chỗ
        </Link>
        {(user?.role === 'owner' || user?.role === 'admin') && (
          <Link to="/reports" className="hover:underline">
            Báo cáo
          </Link>
        )}
        <div className="flex items-center gap-3">
          <span className="rounded bg-navy-dark px-2 py-1 text-xs">
            {roleLabel[user?.role] ?? user?.role}
          </span>
          <span>{user?.name}</span>
          <button
            onClick={handleLogout}
            className="rounded bg-white px-3 py-1 text-navy hover:bg-slate-100"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </nav>
  );
}
