import { Outlet } from 'react-router-dom';
import TopNav from './TopNav';
import TimeZoneBar from './TimeZoneBar';

export default function AdminLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopNav role="admin" />
      <TimeZoneBar />
      <main className="relative z-10 flex-1 overflow-auto min-h-0">
        <Outlet />
      </main>
    </div>
  );
}
