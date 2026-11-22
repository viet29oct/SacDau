import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';

export default function StationDashboardPage() {
  const { user } = useAuth();

  return (
    <Card className="app-head">
      <h1 className="app-title">Xin chào, {user?.name}</h1>
      <p className="app-lead">
        Khu vực dành cho nhân viên quản lý trạm: xem các trạm được công ty phân công, vận hành và theo
        dõi doanh thu ở menu bên trên.
      </p>
    </Card>
  );
}
