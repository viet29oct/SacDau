import { Link } from 'react-router-dom';

export default function InfoPlaceholderPage({ title }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <h1 className="text-2xl font-bold text-navy">{title}</h1>
      <p className="max-w-md text-slate-600">Trang đang được xây dựng, quay lại sau nhé.</p>
      <Link to="/" className="font-medium text-forest hover:underline">
        Về trang chủ
      </Link>
    </div>
  );
}
