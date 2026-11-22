import { Link } from 'react-router-dom';
import SiteBar from '../components/SiteBar';

export default function NotFoundPage() {
  return (
    <>
      <SiteBar />
      <main id="main" className="notice">
        <div className="container notice__inner">
          <p className="notice__plate" aria-hidden="true">
            404
          </p>
          <h1>Không tìm thấy trang này.</h1>
          <Link to="/" className="btn">
            Về trang chủ
          </Link>
        </div>
      </main>
    </>
  );
}
