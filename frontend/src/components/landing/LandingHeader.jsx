import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dashboardPathForRole } from '../../utils/roleDashboard';

export default function LandingHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="site-nav">
      <a className="skip" href="#main">
        Bỏ qua thanh điều hướng
      </a>
      <div className="container site-nav__bar">
        <Link to="/" className="wordmark" aria-label="SạcĐâu, trang chủ">
          SạcĐâu
        </Link>

        <nav className="site-nav__links" aria-label="Chính">
          <Link to="/stations" className="site-nav__link site-nav__link--wide">
            Tìm trạm
          </Link>
          {user ? (
            <button
              type="button"
              onClick={() => navigate(dashboardPathForRole(user.role))}
              className="btn"
            >
              Vào trang của tôi
            </button>
          ) : (
            <>
              <Link to="/login" className="site-nav__link">
                Đăng nhập
              </Link>
              <Link to="/register" className="btn">
                Đăng ký
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
