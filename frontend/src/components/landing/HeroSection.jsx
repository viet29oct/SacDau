import { Link } from 'react-router-dom';
import StationBoard from './StationBoard';

export default function HeroSection() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero__grid">
        <div className="hero__text">
          <h1 id="hero-title">Đến trạm là có cổng sạc.</h1>
          <p className="lead">Xem cổng nào đang trống, giữ chỗ trước, thanh toán qua VNPay.</p>
          <div className="hero__actions">
            <Link to="/register" className="btn btn--primary">
              Đăng ký để đặt chỗ
            </Link>
            <Link to="/stations" className="btn">
              Xem bản đồ trạm
            </Link>
          </div>
        </div>

        <div className="hero__visual">
          <figure
            className="hero__photo"
            data-slot="hero"
            data-alt="Ảnh thật của một trạm SạcĐâu: súng sạc đang cắm vào xe, nhìn ngang tầm mắt"
          >
            <img
              src="/images/photos/close-up-of-an-electric-car-charging-traffic-lights-in-a-blu-1920.jpg"
              width="1920"
              height="1277"
              alt="Súng sạc cắm vào cổng sạc của một chiếc xe điện, đèn phố mờ phía sau"
              fetchPriority="high"
              style={{ objectPosition: '30% 50%' }}
            />
          </figure>
          <StationBoard />
        </div>
      </div>
    </section>
  );
}
