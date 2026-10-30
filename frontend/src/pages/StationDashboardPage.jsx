import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';

export default function StationDashboardPage() {
  const { user } = useAuth();

  return (
    <Card>
      <h1 className="text-xl font-semibold text-slate-900">Xin chào, {user?.name}</h1>
      <p className="mt-2 text-slate-600">
        Khu vực dành cho nhân viên quản lý trạm — xem các trạm được công ty phân công, vận hành và
        theo dõi doanh thu ở menu bên trên.
      </p>
    </Card>
  );
}
