import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardPathForRole } from '../utils/roleDashboard';
import SiteBar from '../components/SiteBar';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  // Tự đăng ký luôn là tài xế; tài khoản quản lý trạm do admin cấp (docs/LUONG_NGHIEP_VU.md mục 2)
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await register(form);
      navigate(dashboardPathForRole(user.role), { replace: true });
    } catch (err) {
      setError(err.message ?? 'Đăng ký thất bại');
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
            <h1>Đăng ký</h1>
            <p className="lead">
              Đăng ký tài khoản tài xế. Nhân viên quản lý trạm dùng tài khoản do công ty cấp.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="form-panel">
            <Input
              id="name"
              label="Họ tên"
              autoComplete="name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
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
              autoComplete="new-password"
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
              {submitting ? 'Đang đăng ký…' : 'Đăng ký'}
            </Button>
            <p className="form-alt">
              Đã có tài khoản?{' '}
              <Link to="/login" className="link">
                Đăng nhập
              </Link>
            </p>
          </form>
        </div>
      </main>
    </>
  );
}
