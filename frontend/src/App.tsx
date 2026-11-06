import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Shell from './components/Shell';
import Dashboard from './components/Dashboard';
import MasterDatabase from './components/MasterDatabase';
import Supervisors from './components/Supervisors';
import Operators from './components/Operators';
import ProductionEntryScreen from './components/ProductionEntry';
import DownstreamEntryScreen from './components/DownstreamEntry';
import ReportsDashboard from './components/ReportsDashboard';
import AdminPanel from './components/AdminPanel';
import UserAccounts from './components/UserAccounts';
import ReasonsManagement from './components/ReasonsManagement';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ModalProvider } from './context/ModalContext';

function AppContent() {
  const { token, role, department } = useAuth();

  if (!token) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Shell />}>
          {/* Default redirect to Dashboard */}
          <Route index element={<Navigate to="/dashboard" replace />} />
          
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="admin" element={role === 'Admin' ? <AdminPanel /> : <Navigate to="/" replace />} />
          <Route path="shift-import" element={role === 'Admin' ? <AdminPanel initialSection="shift-import" /> : <Navigate to="/" replace />} />
          <Route path="user-accounts" element={role === 'Admin' ? <UserAccounts /> : <Navigate to="/" replace />} />
          <Route path="reasons-master" element={role === 'Admin' ? <ReasonsManagement /> : <Navigate to="/" replace />} />
          <Route path="master-database" element={<MasterDatabase />} />
          <Route path="supervisors" element={<Supervisors />} />
          <Route path="operators" element={<Operators />} />
          
          {/* Department Routes */}
          <Route path="production" element={<ProductionEntryScreen />} />
          <Route path="dcf-operations" element={<DownstreamEntryScreen departmentName="DCF" />} />
          <Route path="quality" element={<DownstreamEntryScreen departmentName="Quality" />} />
          <Route path="ht-finishing" element={<DownstreamEntryScreen departmentName="HT & Finishing" />} />
          <Route path="third-party-machining" element={<DownstreamEntryScreen departmentName="Machining" />} />
          <Route path="storage-dispatch" element={<DownstreamEntryScreen departmentName="Storage & Dispatch" />} />
          <Route path="reports" element={<ReportsDashboard />} />

          {/* Catch-all */}
          <Route path="*" element={<div style={{ padding: 20 }}><h2>404 Not Found</h2></div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ModalProvider>
        <AppContent />
      </ModalProvider>
    </AuthProvider>
  );
}
