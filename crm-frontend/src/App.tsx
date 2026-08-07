import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/AdminLayout';
import EmployeeLayout from './components/EmployeeLayout';

import Login from './pages/Login';

// Admin Pages
import AdminLeadsPage from './pages/admin/LeadsPage';
import SalesRecordsPage from './pages/admin/SalesRecordsPage';
import BillingsPage from './pages/admin/BillingsPage';
import UsersPage from './pages/admin/UsersPage';

// Employee Pages
import MyLeadsPage from './pages/employee/MyLeadsPage';
import MySalesRecordsPage from './pages/employee/MySalesRecordsPage';
import MyBillingsPage from './pages/employee/MyBillingsPage';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen text-slate-700">
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          
          {/* Admin Routes */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/leads" replace />} />
              <Route path="leads" element={<AdminLeadsPage />} />
              <Route path="client-journeys" element={<SalesRecordsPage />} />
              <Route path="billings" element={<BillingsPage />} />
              <Route path="users" element={<UsersPage />} />
            </Route>
          </Route>

          {/* Employee Routes */}
          <Route element={<ProtectedRoute allowedRoles={['employee', 'authenticated']} />}>
            <Route path="/employee" element={<EmployeeLayout />}>
              <Route index element={<Navigate to="/employee/leads" replace />} />
              <Route path="leads" element={<MyLeadsPage />} />
              <Route path="client-journeys" element={<MySalesRecordsPage />} />
              <Route path="billings" element={<MyBillingsPage />} />
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </Router>
  );
}
