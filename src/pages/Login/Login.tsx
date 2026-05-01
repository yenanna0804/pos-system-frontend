import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { authService, branchService } from '../../services/api';
import { isDevMode } from '../../config/devMode';
import FormFieldError from '../../components/FormFieldError';
import './Login.css';

interface Branch {
  id: string;
  name: string;
}

interface LoginContext {
  role: string;
  branchId?: string | null;
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string; branchId?: string }>({});
  const [loading, setLoading] = useState(false);
  const [branchLocked, setBranchLocked] = useState(false);

  const { login, setBranchId: setContextBranchId, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isDevMode && isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

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

  useEffect(() => {
    const value = username.trim();
    if (!value) {
      setBranchLocked(false);
      return;
    }

    const timer = setTimeout(() => {
      authService
        .loginContext(value)
        .then((res) => {
          const context: LoginContext = res.data;
          if (context.role === 'ADMIN') {
            setBranchLocked(false);
            return;
          }
          if (context.branchId) {
            setBranchId(context.branchId);
            setBranchLocked(true);
          }
        })
        .catch(() => {
          setBranchLocked(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const nextFieldErrors: { username?: string; password?: string; branchId?: string } = {};
    if (!username.trim()) nextFieldErrors.username = 'Vui lòng nhập tên đăng nhập';
    if (!password.trim()) nextFieldErrors.password = 'Vui lòng nhập mật khẩu';
    if (!branchId) nextFieldErrors.branchId = 'Vui lòng chọn chi nhánh';
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setLoading(true);

    try {
      const res = await authService.login(username, password, branchId);
      const { user, token } = res.data;
      
      setContextBranchId(user.branchId || branchId);
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
        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label>Tên đăng nhập</label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (fieldErrors.username) {
                  setFieldErrors((prev) => ({ ...prev, username: undefined }));
                }
              }}
              placeholder="Nhập tên đăng nhập"
              className={fieldErrors.username ? 'field-invalid' : ''}
              required
            />
            <FormFieldError message={fieldErrors.username} />
          </div>

          <div className="form-group">
            <label>Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              placeholder="Nhập mật khẩu"
              className={fieldErrors.password ? 'field-invalid' : ''}
              required
            />
            <FormFieldError message={fieldErrors.password} />
          </div>

          <div className="form-group">
            <label>Chi nhánh</label>
            <select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                if (fieldErrors.branchId) {
                  setFieldErrors((prev) => ({ ...prev, branchId: undefined }));
                }
              }}
              className={fieldErrors.branchId ? 'field-invalid' : ''}
              disabled={branchLocked}
            >
              <option value="">-- Chọn chi nhánh --</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <FormFieldError message={fieldErrors.branchId} />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
