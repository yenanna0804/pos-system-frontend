import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { authService, branchService } from '../../services/api';
import './Login.css';

interface Branch {
  id: string;
  name: string;
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, setBranchId: setContextBranchId } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    branchService
      .getAll()
      .then((res) => {
        setBranches(res.data);
        if (res.data.length > 0) {
          setBranchId(res.data[0].id);
        }
      })
      .catch(() => {
        setBranches([]);
        setError('Không tải được danh sách chi nhánh từ CSDL');
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!branchId) {
        throw new Error('Vui lòng chọn chi nhánh');
      }
      const res = await authService.login(username, password, branchId);
      const { user, token } = res.data;
      
      setContextBranchId(branchId);
      login(user, token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>POS System</h1>
          <p>Đăng nhập để tiếp tục</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label>Tên đăng nhập</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên đăng nhập"
              required
            />
          </div>

          <div className="form-group">
            <label>Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              required
            />
          </div>

          <div className="form-group">
            <label>Chi nhánh</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">-- Chọn chi nhánh --</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
