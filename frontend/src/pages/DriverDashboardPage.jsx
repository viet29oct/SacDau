import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';

export default function DriverDashboardPage() {
  const { user } = useAuth();

  return (
    <Card>
      <h1 className="text-xl font-semibold text-slate-900">Xin chào, {user?.name}</h1>
      <p className="mt-2 text-slate-600">
        Khu vực dành cho tài xế — xem bản đồ trạm sạc, đặt chỗ và theo dõi phiên sạc ở menu bên trên.
      </p>
    </Card>
  );
}
