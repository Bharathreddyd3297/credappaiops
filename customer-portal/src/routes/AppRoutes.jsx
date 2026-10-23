import { useState } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Box } from '@mui/material';

import Navbar from '../components/Navbar';
import Sidebar, { DRAWER_WIDTH } from '../components/Sidebar';
import Footer from '../components/Footer';
import ProtectedRoute from '../components/ProtectedRoute';

import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import DashboardPage from '../pages/DashboardPage';
import AddCardPage from '../pages/AddCardPage';
import PayBillPage from '../pages/PayBillPage';
import PaymentHistoryPage from '../pages/PaymentHistoryPage';
import SuccessPage from '../pages/SuccessPage';
import AuthCallbackPage from '../pages/AuthCallbackPage';

/**
 * Shell layout for authenticated in-app routes: persistent sidebar,
 * top navbar, scrollable content area and footer.
 */
function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <Box
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
        }}
      >
        <Navbar onMenuClick={() => setMobileOpen(true)} />
        <Box component="main" sx={{ flexGrow: 1, px: { xs: 2, sm: 3, md: 5 }, py: { xs: 3, md: 4 } }}>
          <Outlet />
        </Box>
        <Footer />
      </Box>
    </Box>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* Protected in-app routes (wrapped in the shell layout) */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/add-card" element={<AddCardPage />} />
        <Route path="/pay-bill" element={<PayBillPage />} />
        <Route path="/payment-history" element={<PaymentHistoryPage />} />
        <Route path="/success" element={<SuccessPage />} />
      </Route>

      {/* Defaults */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
