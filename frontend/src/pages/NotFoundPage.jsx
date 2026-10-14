import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 text-center">
      <h1 className="text-3xl font-bold text-slate-900">404</h1>
      <p className="text-slate-600">Không tìm thấy trang này.</p>
      <Link to="/" className="font-medium text-forest hover:underline">
        Về trang chủ
      </Link>
    </div>
  );
}
