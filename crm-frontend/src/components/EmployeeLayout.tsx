import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TimeZoneBar from './TimeZoneBar';

export default function EmployeeLayout() {
  return (
    <div className="flex h-screen w-full bg-cover bg-center overflow-hidden">
      <Sidebar role="employee" />
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <TimeZoneBar />
        <main className="flex-1 overflow-auto relative z-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
