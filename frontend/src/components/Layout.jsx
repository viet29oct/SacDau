import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="app">
      <Navbar />
      <main id="main" className="container app-main">
        <Outlet />
      </main>
    </div>
  );
}
