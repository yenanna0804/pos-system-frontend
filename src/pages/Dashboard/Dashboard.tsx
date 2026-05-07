import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { authService, branchService } from '../../services/api';
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

  const selectedBranchName = useMemo(() => {
    if (!branchId) return user?.branchName || 'Chưa chọn';
    return branches.find((b) => b.id === branchId)?.name || user?.branchName || branchId;
  }, [branchId, branches, user?.branchName]);

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
      setPasswordError(typeof error === 'string' ? error : 'Không thể đổi mật khẩu');
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
      {shown ? '🙈' : '👁'}
    </button>
  );

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="tab-bar">
          {canAccessReports && (
            <button
              className={`tab-btn ${activeTab === 'overview' ? 'tab-active' : ''}`}
              onClick={() => navigate('/dashboard')}
            >
              Báo cáo tổng quan
            </button>
          )}
          <button
            className={`tab-btn ${activeTab === 'products' ? 'tab-active' : ''}`}
            onClick={() => navigate('/product')}
          >
            Hàng hóa
          </button>
          {canAccessTables && (
            <button className={`tab-btn ${activeTab === 'tables' ? 'tab-active' : ''}`} onClick={() => navigate('/tables')}>
              Phòng/bàn
            </button>
          )}
          <button className={`tab-btn ${activeTab === 'orders' ? 'tab-active' : ''}`} onClick={() => navigate('/orders')}>
            Hóa đơn
          </button>
          {canAccessPrinters && (
            <button
              className={`tab-btn ${activeTab === 'printers' ? 'tab-active' : ''}`}
              onClick={() => navigate('/printers')}
            >
              Thiết lập máy in
            </button>
          )}
        </div>
        <div className="header-right">
          <label className="branch-switcher">
            <span>Chi nhánh:</span>
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
          <span className="user-name">Xin chào, {user?.fullName || user?.username}</span>
          <button onClick={openChangePassword} className="logout-btn" type="button">
            Đổi mật khẩu
          </button>
          <button onClick={handleLogout} className="logout-btn">
            Đăng xuất
          </button>
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
