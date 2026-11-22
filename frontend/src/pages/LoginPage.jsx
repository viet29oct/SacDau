import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardPathForRole } from '../utils/roleDashboard';
import SiteBar from '../components/SiteBar';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(form.email, form.password);
      const from = location.state?.from;
      navigate(from ? `${from.pathname}${from.search ?? ''}` : dashboardPathForRole(user.role), { replace: true });
    } catch (err) {
      setError(err.message ?? 'Đăng nhập thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SiteBar />
      <main id="main" className="auth">
        <div className="container auth__grid">
          <div className="auth__head">
            <h1>Đăng nhập</h1>
            <p className="lead">Xem cổng trống, lịch đặt chỗ và phiên sạc của bạn.</p>
          </div>

          <form onSubmit={handleSubmit} className="form-panel">
            <Input
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              id="password"
              label="Mật khẩu"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="btn--block" disabled={submitting} aria-busy={submitting || undefined}>
              {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>
            <p className="form-alt">
              Chưa có tài khoản?{' '}
              <Link to="/register" className="link">
                Đăng ký
              </Link>
            </p>
          </form>
        </div>
      </main>
    </>
  );
}
