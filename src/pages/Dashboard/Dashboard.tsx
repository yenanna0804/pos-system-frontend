import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { authService, branchService } from '../../services/api';
import { getErrorMessage } from '../../utils/errorHelpers';
import ProductsPage from '../Products/ProductsPage';
import TablesPage from '../Tables/TablesPage';
import OrdersPage from '../Orders/OrdersPage';
import PrintersPage from '../Printers/PrintersPage';
import ReportsPage from '../Reports/ReportsPage';
import './Dashboard.css';

type TabKey = 'overview' | 'products' | 'tables' | 'orders' | 'printers';
type Branch = { id: string; name: string };

export default function Dashboard() {
  const { user, branchId, setBranchId, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const activeTab: TabKey = (() => {
    if (location.pathname === '/dashboard') return 'overview';
    if (location.pathname.startsWith('/product')) return 'products';
    if (location.pathname.startsWith('/tables')) return 'tables';
    if (location.pathname.startsWith('/orders')) return 'orders';
    if (location.pathname.startsWith('/printers')) return 'printers';
    return 'overview';
  })();
  const isAdmin = user?.role === 'ADMIN';
  const { canAccessReports, canAccessTables, canAccessPrinters } = usePermissions();

  useEffect(() => {
    branchService
      .getAll()
      .then((res) => {
        const rows: Branch[] = Array.isArray(res.data) ? res.data : [];
        setBranches(rows);

        if (!branchId && rows.length > 0) {
          const defaultBranchId = user?.branchId && rows.some((b) => b.id === user.branchId) ? user.branchId : rows[0].id;
          setBranchId(defaultBranchId);
        }
        if (!isAdmin && user?.branchId) {
          setBranchId(user.branchId);
        }
      })
      .catch(() => {
        setBranches([]);
      });
  }, [branchId, isAdmin, setBranchId, user?.branchId]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectedBranchName = useMemo(() => {
    if (!branchId) return user?.branchName || 'Chưa chọn';
    return branches.find((b) => b.id === branchId)?.name || user?.branchName || branchId;
  }, [branchId, branches, user?.branchName]);

  const isKnownPath = ['/dashboard', '/product', '/tables', '/orders', '/printers'].some(
    (p) => location.pathname === p || location.pathname.startsWith(p + '/'),
  );
  if (!isKnownPath) return <Navigate to="/dashboard" replace />;
  if (activeTab === 'tables' && user?.role === 'STAFF') return <Navigate to="/product" replace />;

  const navigateTab = (path: string) => {
    const targetTab = path.split('/')[1] || 'dashboard';
    const currentTab = location.pathname.split('/')[1] || 'dashboard';
    if (targetTab === currentTab) {
      navigate(path);
    } else {
      window.location.href = path;
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const resetChangePasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
    setPasswordError('');
    setPasswordSuccess('');
  };

  const openChangePassword = () => {
    resetChangePasswordForm();
    setIsChangePasswordOpen(true);
  };

  const closeChangePassword = () => {
    setIsChangePasswordOpen(false);
    resetChangePasswordForm();
  };

  const handleSubmitChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPasswordError('Vui lòng nhập đầy đủ thông tin');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Xác nhận mật khẩu mới không khớp');
      return;
    }
    setIsChangingPassword(true);
    try {
      await authService.changePassword({ currentPassword, newPassword, confirmNewPassword });
      setPasswordSuccess('Đổi mật khẩu thành công');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => {
        setIsChangePasswordOpen(false);
        setPasswordSuccess('');
      }, 900);
    } catch (error) {
      setPasswordError(getErrorMessage(error));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const EyeButton = ({ shown, onClick }: { shown: boolean; onClick: () => void }) => (
    <button
      type="button"
      className="password-eye-btn"
      onClick={onClick}
      aria-label={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="2.7" />
        {shown && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="tab-bar" role="tablist" aria-label="Điều hướng chính">
          {canAccessReports && (
            <button
              className={`tab-btn ${activeTab === 'overview' ? 'tab-active' : ''}`}
              onClick={() => navigateTab('/dashboard')}
              type="button"
            >
              Báo cáo tổng quan
            </button>
          )}
          <button
            className={`tab-btn ${activeTab === 'products' ? 'tab-active' : ''}`}
            onClick={() => navigateTab('/product')}
            type="button"
          >
            Hàng hóa
          </button>
          {canAccessTables && (
            <button className={`tab-btn ${activeTab === 'tables' ? 'tab-active' : ''}`} onClick={() => navigateTab('/tables')} type="button">
              Phòng/bàn
            </button>
          )}
          <button className={`tab-btn ${activeTab === 'orders' ? 'tab-active' : ''}`} onClick={() => navigateTab('/orders')} type="button">
            Hóa đơn
          </button>
          {canAccessPrinters && (
            <button
              className={`tab-btn ${activeTab === 'printers' ? 'tab-active' : ''}`}
              onClick={() => navigateTab('/printers')}
              type="button"
            >
              Thiết lập máy in
            </button>
          )}
        </div>
        <div className="header-right">
          <label className="branch-switcher branch-switcher-pill">
            <span className="branch-pill-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10.5h18" />
                <path d="M4.5 10.5 6.3 5h11.4l1.8 5.5" />
                <path d="M5 10.5v1.1a2.2 2.2 0 0 0 4.4 0v-1.1" />
                <path d="M9.4 10.5v1.1a2.2 2.2 0 0 0 4.4 0v-1.1" />
                <path d="M13.8 10.5v1.1a2.2 2.2 0 1 0 4.4 0v-1.1" />
                <path d="M6.8 14.8V19h10.4v-4.2" />
              </svg>
            </span>
            <span className="branch-switcher-label">Chi nhánh</span>
            <select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              disabled={branches.length === 0 || !isAdmin}
              aria-label="Chọn chi nhánh"
            >
              {!branchId && <option value="">Chọn chi nhánh</option>}
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          {branches.length === 0 && <span className="branch-name">Chi nhánh: {selectedBranchName}</span>}
          <div className="header-divider" aria-hidden />
          <div className="user-menu" ref={userMenuRef}>
            <button
              type="button"
              className="user-trigger"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={isUserMenuOpen}
            >
              <span className="user-avatar" aria-hidden>{(user?.fullName || user?.username || 'U').slice(0, 2).toUpperCase()}</span>
              <span className="user-name">{user?.fullName || user?.username}</span>
              <span className={`user-trigger-caret${isUserMenuOpen ? ' is-open' : ''}`} aria-hidden>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 7.5 5 5 5-5" />
                </svg>
              </span>
            </button>
            {isUserMenuOpen && (
              <div className="user-menu-dropdown" role="menu" aria-label="Tùy chọn người dùng">
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    openChangePassword();
                  }}
                >
                  Đổi mật khẩu
                </button>
                <button
                  type="button"
                  className="user-menu-item user-menu-item-danger"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    handleLogout();
                  }}
                >
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {isChangePasswordOpen && (
        <div className="dashboard-modal-overlay" onClick={closeChangePassword}>
          <div className="dashboard-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Đổi mật khẩu</h3>

            <label className="dashboard-password-field">
              <span>Mật khẩu hiện tại</span>
              <div className="dashboard-password-input-wrap">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                />
                <EyeButton shown={showCurrentPassword} onClick={() => setShowCurrentPassword((prev) => !prev)} />
              </div>
            </label>

            <label className="dashboard-password-field">
              <span>Mật khẩu mới</span>
              <div className="dashboard-password-input-wrap">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                />
                <EyeButton shown={showNewPassword} onClick={() => setShowNewPassword((prev) => !prev)} />
              </div>
            </label>

            <label className="dashboard-password-field">
              <span>Xác nhận mật khẩu mới</span>
              <div className="dashboard-password-input-wrap">
                <input
                  type={showConfirmNewPassword ? 'text' : 'password'}
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  autoComplete="new-password"
                />
                <EyeButton shown={showConfirmNewPassword} onClick={() => setShowConfirmNewPassword((prev) => !prev)} />
              </div>
            </label>

            {passwordError && <p className="dashboard-password-error">{passwordError}</p>}
            {passwordSuccess && <p className="dashboard-password-success">{passwordSuccess}</p>}

            <div className="dashboard-modal-actions">
              <button type="button" className="ghost-btn" onClick={closeChangePassword} disabled={isChangingPassword}>
                Hủy
              </button>
              <button type="button" className="primary-btn" onClick={handleSubmitChangePassword} disabled={isChangingPassword}>
                {isChangingPassword ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="dashboard-content" style={{ padding: '14px' }}>
        {activeTab === 'overview' && <ReportsPage />}

        {activeTab === 'products' && <ProductsPage />}

        {activeTab === 'tables' && <TablesPage />}

        {activeTab === 'orders' && <OrdersPage />}

        {activeTab === 'printers' && <PrintersPage />}

        {activeTab !== 'overview' &&
          activeTab !== 'products' &&
          activeTab !== 'tables' &&
          activeTab !== 'orders' &&
          activeTab !== 'printers' && (
          <div className="placeholder-card">Chức năng đang được phát triển.</div>
          )}
      </main>
    </div>
  );
}
