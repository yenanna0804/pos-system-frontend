import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import './App.css';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized } = useAuth();
  if (!isInitialized) return null;
  return isAuthenticated ? <>{children}</> : <Navigate to="/" />;
}

function DefaultRedirect() {
  const { user } = useAuth();
  const target = user?.role === 'STAFF' ? '/product' : '/dashboard';
  return <Navigate to={target} replace />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  return (
    <Routes location={location} key={location.pathname.split('/')[1] || 'dashboard'}>
      <Route path="/" element={isAuthenticated ? <DefaultRedirect /> : <Login />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
