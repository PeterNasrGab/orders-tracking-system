import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import AddOrder from "./pages/AddOrder";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/UploadPage";
import UploadsDashboard from "./pages/UploadsDashboard";
import AccountsDashboard from "./pages/AccountsDashboard";
import UploadDetailsPage from "./pages/UploadDetailsPage";
import DistributionDashboard from "./pages/InDistributionDashboard";
import SystemSettings from "./pages/SystemSettings"; // Import the new component
import Login from "./components/Login";
import BarryOrders from "./pages/BarryDashboard";
import GawyOrders from "./pages/GawyDashboard";
import BarryDashboard from "./pages/BarryDashboard";
import GawyDashboard from "./pages/GawyDashboard";
import SheetsManagement from "./pages/SheetsManagement";
import SheetDetails from "./pages/SheetDetails";

// Protected Route Component
function ProtectedRoute({ children, adminOnly = false, excludeAssistant = false }) {
  const { currentUser, isAdmin } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" />;
  }

  // Exclude assistant role for specific routes
  if (excludeAssistant && currentUser?.role === 'assistant') {
    return <Navigate to="/" />;
  }

  return children;
}

function AppContent() {
  const { currentUser } = useAuth();

  useEffect(() => {
    // Disable scroll wheel on number inputs without affecting other functionality
    const handleWheel = (e) => {
      if (e.target.type === 'number' && document.activeElement === e.target) {
        e.preventDefault();
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      document.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/" />} />
        <Route path="/upload" element={<UploadPage />} />

        {/* Protected routes */}
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="barry" element={<BarryDashboard />} />
          <Route path="gawy" element={<GawyDashboard  />} />
          <Route path="add-order" element={
            <ProtectedRoute adminOnly>
              <AddOrder />
            </ProtectedRoute>
          } />
          <Route path="uploads" element={
            <ProtectedRoute adminOnly>
              <UploadsDashboard />
            </ProtectedRoute>
          } />
           <Route path="/sheets" element={ <ProtectedRoute adminOnly><SheetsManagement /></ProtectedRoute>} />
        <Route path="/sheet/:sheetId" element={ <ProtectedRoute adminOnly><SheetDetails /></ProtectedRoute>} />
          <Route path="accounts-dashboard" element={<AccountsDashboard />} />
          <Route path="distribution-dashboard" element={
            <ProtectedRoute excludeAssistant>
              <DistributionDashboard />
            </ProtectedRoute>
          } />
          <Route path="system-settings" element={
            <ProtectedRoute adminOnly>
              <SystemSettings />
            </ProtectedRoute>
          } />
         <Route path="upload/:id" element={
  <ProtectedRoute>
    <UploadDetailsPage />
  </ProtectedRoute>
} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;