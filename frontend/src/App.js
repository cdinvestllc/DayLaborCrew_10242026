import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import { Toaster } from "sonner";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import AuthCallback from "./pages/AuthCallback";
import CrewDashboard from "./pages/CrewDashboard";
import ContractorDashboard from "./pages/ContractorDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ProfilePage from "./pages/ProfilePage";
import SubscriptionPage from "./pages/SubscriptionPage";
import GuestJobPage from "./pages/GuestJobPage";
import LegalPage from "./pages/LegalPage";
import AdvertiserPage from "./pages/AdvertiserPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import VerifiedContractorsPage from "./pages/VerifiedContractorsPage";
import AppSettingsPage from "./pages/AppSettingsPage";
import OurAppPage from "./pages/OurAppPage";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-[#050A30] flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7EC8E3]" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function DashboardRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/auth" replace />;
  if (user.role === "crew") return <Navigate to="/crew/dashboard" replace />;
  if (user.role === "contractor") return <Navigate to="/contractor/dashboard" replace />;
  if (user.role === "admin" || user.role === "super_admin") return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/" replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  const location = useLocation();

  // CRITICAL: Detect session_id synchronously during render (prevents race conditions)
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/" element={user ? <DashboardRedirect /> : <LandingPage />} />
      <Route path="/auth" element={user ? <DashboardRedirect /> : <AuthPage />} />
      <Route path="/login" element={<Navigate to="/auth?mode=login" replace />} />
      <Route path="/signup" element={<Navigate to="/auth?mode=register" replace />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/legal" element={<LegalPage />} />
      <Route path="/terms" element={<Navigate to="/legal?page=terms" replace />} />
      <Route path="/privacy" element={<Navigate to="/legal?page=privacy" replace />} />
      <Route path="/guidelines" element={<Navigate to="/legal?page=guidelines" replace />} />
      <Route path="/post-job" element={<GuestJobPage />} />
      <Route path="/profile/:userId" element={<PublicProfilePage />} />
      <Route path="/verified-contractors" element={<VerifiedContractorsPage />} />
      <Route path="/our-app" element={<OurAppPage />} />
      <Route path="/settings/app" element={<ProtectedRoute><AppSettingsPage /></ProtectedRoute>} />
      <Route path="/crew/dashboard" element={
        <ProtectedRoute roles={["crew"]}>
          <WebSocketProvider><CrewDashboard /></WebSocketProvider>
        </ProtectedRoute>
      } />
      <Route path="/contractor/dashboard" element={
        <ProtectedRoute roles={["contractor"]}>
          <WebSocketProvider><ContractorDashboard /></WebSocketProvider>
        </ProtectedRoute>
      } />
      <Route path="/admin/dashboard" element={
        <ProtectedRoute roles={["admin", "super_admin"]}>
          <AdminDashboard />
        </ProtectedRoute>
      } />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
      <Route path="/advertise" element={<AdvertiserPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
     <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" richColors />
          <AppRoutes />
          <PWAInstallPrompt />
        </BrowserRouter>
      </AuthProvider>
     </LanguageProvider>
    </ThemeProvider>
  );
}
