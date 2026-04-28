import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import ProductsPage from '../Products/ProductsPage';
import TablesPage from '../Tables/TablesPage';
import './Dashboard.css';

type TabKey = 'overview' | 'products' | 'tables' | 'orders' | 'printers';

export default function Dashboard() {
  const { user, branchId, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const routeToTab: Record<string, TabKey> = {
    '/dashboard': 'overview',
    '/product': 'products',
    '/tables': 'tables',
    '/orders': 'orders',
    '/printers': 'printers',
  };

  const activeTab = routeToTab[location.pathname] || 'overview';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>POS System</h1>
        <div className="header-right">
          <span className="branch-name">Chi nhánh: {user?.branchName || branchId || 'Chưa chọn'}</span>
          <span className="user-name">Xin chào, {user?.fullName || user?.username}</span>
          <button onClick={handleLogout} className="logout-btn">
            Đăng xuất
          </button>
        </div>
      </header>

      <main className="dashboard-content">
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

        {activeTab === 'overview' && (
          <>
            <h2>Báo cáo tổng quan</h2>

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon revenue">₫</div>
                <div className="stat-info">
                  <span className="stat-label">Doanh thu hôm nay</span>
                  <span className="stat-value">0 đ</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon orders">#</div>
                <div className="stat-info">
                  <span className="stat-label">Đơn hàng hôm nay</span>
                  <span className="stat-value">0</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon tables">T</div>
                <div className="stat-info">
                  <span className="stat-label">Bàn đang sử dụng</span>
                  <span className="stat-value">0 / 0</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon products">P</div>
                <div className="stat-info">
                  <span className="stat-label">Sản phẩm đã bán</span>
                  <span className="stat-value">0</span>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'products' && <ProductsPage />}

        {activeTab === 'tables' && <TablesPage />}

        {activeTab !== 'overview' && activeTab !== 'products' && activeTab !== 'tables' && (
          <div className="placeholder-card">Chức năng đang được phát triển.</div>
        )}
      </main>
    </div>
  );
}
