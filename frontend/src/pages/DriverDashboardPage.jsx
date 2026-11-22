import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';

export default function DriverDashboardPage() {
  const { user } = useAuth();

  return (
    <Card className="app-head">
      <h1 className="app-title">Xin chào, {user?.name}</h1>
      <p className="app-lead">
        Khu vực dành cho tài xế: xem bản đồ trạm sạc, đặt chỗ và theo dõi phiên sạc ở menu bên trên.
      </p>
    </Card>
  );
}
