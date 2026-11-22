import { Link } from 'react-router-dom';

export default function LandingFooter() {
  return (
    <footer className="site-foot">
      <div className="container">
        <div className="site-foot__grid">
          <div className="site-foot__about">
            <Link to="/" className="wordmark" aria-label="SạcĐâu, trang chủ">
              SạcĐâu
            </Link>
            <p>Nền tảng quản lý mạng lưới trạm sạc xe điện: tìm trạm, đặt chỗ và thanh toán trong một ứng dụng.</p>
          </div>

          <nav aria-labelledby="foot-pages">
            <p id="foot-pages" className="site-foot__head">
              Trang
            </p>
            <ul>
              <li>
                <Link to="/stations" className="site-foot__link">
                  Tìm kiếm trạm
                </Link>
              </li>
              <li>
                <Link to="/gioi-thieu" className="site-foot__link">
                  Giới thiệu
                </Link>
              </li>
              <li>
                <Link to="/tin-tuc" className="site-foot__link">
                  Tin tức
                </Link>
              </li>
              <li>
                <Link to="/ho-tro" className="site-foot__link">
                  Hỗ trợ
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-labelledby="foot-social">
            <p id="foot-social" className="site-foot__head">
              Mạng xã hội
            </p>
            <ul>
              <li>
                <a href="#" className="site-foot__link">
                  Facebook
                </a>
              </li>
              <li>
                <a href="#" className="site-foot__link">
                  Instagram
                </a>
              </li>
              <li>
                <a href="#" className="site-foot__link">
                  Youtube
                </a>
              </li>
            </ul>
          </nav>

          <nav aria-labelledby="foot-policy">
            <p id="foot-policy" className="site-foot__head">
              Chính sách
            </p>
            <ul>
              <li>
                <a href="#" className="site-foot__link">
                  Chính sách bảo mật
                </a>
              </li>
              <li>
                <a href="#" className="site-foot__link">
                  Điều khoản sử dụng
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="site-foot__legal">
          <p>© {new Date().getFullYear()} SacDau. Đồ án môn học, không phải sản phẩm thương mại.</p>
          <p data-credits>
            Ảnh:{' '}
            <a href="https://commons.wikimedia.org/wiki/File:Close-up_of_an_electric_car_charging._Traffic_lights_in_a_blurry_background.jpg">
              Ivan Radic
            </a>{' '}
            (CC BY 2.0, Wikimedia Commons),{' '}
            <a href="https://commons.wikimedia.org/wiki/File:Honda_electric_car_charging_on_private_parking_lot_in_Tokyo.jpg">
              Syced
            </a>{' '}
            (CC0, Wikimedia Commons).
          </p>
        </div>
      </div>
    </footer>
  );
}
