import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DriverDashboardPage from './pages/DriverDashboardPage';
import StationDashboardPage from './pages/StationDashboardPage';
import StationsPage from './pages/StationsPage';
import BookingsPage from './pages/BookingsPage';
import ReportsPage from './pages/ReportsPage';
import InfoPlaceholderPage from './pages/InfoPlaceholderPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/gioi-thieu" element={<InfoPlaceholderPage title="Giới thiệu" />} />
      <Route path="/tin-tuc" element={<InfoPlaceholderPage title="Tin tức" />} />
      <Route path="/ho-tro" element={<InfoPlaceholderPage title="Hỗ trợ" />} />

      <Route element={<Layout />}>
        <Route element={<ProtectedRoute allowedRoles={['driver']} />}>
          <Route path="/driver-dashboard" element={<DriverDashboardPage />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['owner']} />}>
          <Route path="/station-dashboard" element={<StationDashboardPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/stations" element={<StationsPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['owner', 'admin']} />}>
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
