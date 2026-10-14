import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';

export default function StationDashboardPage() {
  const { user } = useAuth();

  return (
    <Card>
      <h1 className="text-xl font-semibold text-slate-900">Xin chào, {user?.name}</h1>
      <p className="mt-2 text-slate-600">
        Khu vực dành cho chủ trạm — quản lý trạm sạc và xem báo cáo doanh thu ở menu bên trên.
      </p>
    </Card>
  );
}
