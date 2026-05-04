import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { branchService } from '../../services/api';
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

  const activeTab: TabKey = (() => {
    if (location.pathname === '/dashboard') return 'overview';
    if (location.pathname.startsWith('/product')) return 'products';
    if (location.pathname.startsWith('/tables')) return 'tables';
    if (location.pathname.startsWith('/orders')) return 'orders';
    if (location.pathname.startsWith('/printers')) return 'printers';
    return 'overview';
  })();
  const isAdmin = user?.role === 'ADMIN';

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

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="tab-bar">
          <button
            className={`tab-btn ${activeTab === 'overview' ? 'tab-active' : ''}`}
            onClick={() => navigate('/dashboard')}
          >
            Báo cáo tổng quan
          </button>
          <button
            className={`tab-btn ${activeTab === 'products' ? 'tab-active' : ''}`}
            onClick={() => navigate('/product')}
          >
            Hàng hóa
          </button>
          <button className={`tab-btn ${activeTab === 'tables' ? 'tab-active' : ''}`} onClick={() => navigate('/tables')}>
            Phòng/bàn
          </button>
          <button className={`tab-btn ${activeTab === 'orders' ? 'tab-active' : ''}`} onClick={() => navigate('/orders')}>
            Hóa đơn
          </button>
          <button
            className={`tab-btn ${activeTab === 'printers' ? 'tab-active' : ''}`}
            onClick={() => navigate('/printers')}
          >
            Thiết lập máy in
          </button>
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
          <button onClick={handleLogout} className="logout-btn">
            Đăng xuất
          </button>
        </div>
      </header>

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
