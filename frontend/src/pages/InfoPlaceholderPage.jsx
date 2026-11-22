import { Link } from 'react-router-dom';
import SiteBar from '../components/SiteBar';

export default function InfoPlaceholderPage({ title }) {
  return (
    <>
      <SiteBar />
      <main id="main" className="notice">
        <div className="container notice__inner">
          <h1>{title}</h1>
          <p className="lead">Trang đang được xây dựng, quay lại sau nhé.</p>
          <Link to="/" className="btn">
            Về trang chủ
          </Link>
        </div>
      </main>
    </>
  );
}
