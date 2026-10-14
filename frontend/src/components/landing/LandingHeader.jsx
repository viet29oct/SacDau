import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dashboardPathForRole } from '../../utils/roleDashboard';

export default function LandingHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-navy-dark/60 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="text-xl font-bold tracking-tight text-white">
          Sạc<span className="text-forest-light">Đâu</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-white/80 md:flex">
          <Link to="/" className="hover:text-white">
            Trang chủ
          </Link>
          <Link to="/stations" className="hover:text-white">
            Tìm kiếm trạm
          </Link>
          <Link to="/tin-tuc" className="hover:text-white">
            Tin tức
          </Link>
          <Link to="/ho-tro" className="hover:text-white">
            Hỗ trợ
          </Link>
        </nav>

        {user ? (
          <button
            onClick={() => navigate(dashboardPathForRole(user.role))}
            className="rounded-md bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-light"
          >
            Vào trang của tôi
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-md border border-white/40 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Đăng nhập
            </Link>
            <Link
              to="/register"
              className="rounded-md bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-light"
            >
              Đăng ký
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
