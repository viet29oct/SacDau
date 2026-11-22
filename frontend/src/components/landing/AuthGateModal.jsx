import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AuthGateModal({ open, onClose }) {
  const navigate = useNavigate();
  const primaryRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    primaryRef.current?.focus();
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="dialog" onClick={onClose}>
      <div
        className="dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-gate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="auth-gate-title">Cần đăng nhập</h2>
        <p>Bạn cần đăng nhập để vào khu vực này của hệ thống.</p>
        <div className="dialog__actions">
          <button type="button" onClick={onClose} className="btn">
            Đóng
          </button>
          <button
            type="button"
            ref={primaryRef}
            onClick={() => navigate('/login')}
            className="btn btn--primary"
          >
            Đăng nhập
          </button>
        </div>
      </div>
    </div>
  );
}
