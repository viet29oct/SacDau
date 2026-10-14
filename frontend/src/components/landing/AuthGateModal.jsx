import { useNavigate } from 'react-router-dom';

export default function AuthGateModal({ open, onClose }) {
  const navigate = useNavigate();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-navy-dark/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-navy p-6 text-center text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Cần đăng nhập</h2>
        <p className="mt-2 text-sm text-white/70">
          Bạn cần đăng nhập để vào khu vực này của hệ thống.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={onClose}
            className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
          >
            Đóng
          </button>
          <button
            onClick={() => navigate('/login')}
            className="rounded-md bg-forest px-4 py-2 text-sm font-medium hover:bg-forest-light"
          >
            Đăng nhập
          </button>
        </div>
      </div>
    </div>
  );
}
