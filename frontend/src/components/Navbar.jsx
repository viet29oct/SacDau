import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardPathForRole } from '../utils/roleDashboard';

const roleLabel = { driver: 'Tài xế', owner: 'Quản lý trạm', admin: 'Quản trị viên' };

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="app-nav">
      <a className="skip" href="#main">
        Bỏ qua thanh điều hướng
      </a>
      <div className="container app-nav__bar">
        <Link to={dashboardPathForRole(user?.role)} className="wordmark" aria-label="SạcĐâu, trang của tôi">
          SạcĐâu
        </Link>

        <button
          type="button"
          className="btn btn--sm app-nav__toggle"
          aria-expanded={menuOpen}
          aria-controls="app-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? 'Đóng menu' : 'Menu'}
        </button>

        <div id="app-menu" className="app-nav__menu" data-open={menuOpen}>
          <nav className="app-nav__links" aria-label="Chính">
            <NavLink to="/stations" className="app-nav__link" onClick={closeMenu}>
              Bản đồ trạm
            </NavLink>
            <NavLink to="/bookings" className="app-nav__link" onClick={closeMenu}>
              Đặt chỗ
            </NavLink>
            {(user?.role === 'owner' || user?.role === 'admin') && (
              <NavLink to="/reports" className="app-nav__link" onClick={closeMenu}>
                Báo cáo
              </NavLink>
            )}
          </nav>
          <div className="app-nav__user">
            <span className="pill">{roleLabel[user?.role] ?? user?.role}</span>
            <span>{user?.name}</span>
            <button type="button" onClick={handleLogout} className="btn btn--sm">
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
