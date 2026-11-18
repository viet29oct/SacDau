import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardPathForRole } from '../utils/roleDashboard';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';

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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <Card>
          <h1 className="mb-6 text-xl font-semibold text-slate-900">Đăng ký</h1>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="name"
              label="Họ tên"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              id="email"
              label="Email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              id="password"
              label="Mật khẩu"
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <p className="text-xs text-slate-500">
              Đăng ký tài khoản tài xế. Nhân viên quản lý trạm dùng tài khoản do công ty cấp.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang đăng ký...' : 'Đăng ký'}
            </Button>
          </form>
          <p className="mt-4 text-sm text-slate-600">
            Đã có tài khoản?{' '}
            <Link to="/login" className="font-medium text-forest hover:underline">
              Đăng nhập
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
