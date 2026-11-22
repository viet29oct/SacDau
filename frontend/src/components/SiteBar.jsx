import { Link } from 'react-router-dom';

// Thanh trên cùng tối giản cho trang đăng nhập, đăng ký và các trang thông tin.
export default function SiteBar() {
  return (
    <header className="site-nav">
      <a className="skip" href="#main">
        Bỏ qua thanh điều hướng
      </a>
      <div className="container site-nav__bar">
        <Link to="/" className="wordmark" aria-label="SạcĐâu, trang chủ">
          SạcĐâu
        </Link>
        <Link to="/stations" className="site-nav__link">
          Tìm trạm
        </Link>
      </div>
    </header>
  );
}
