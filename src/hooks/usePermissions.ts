import { useAuth } from '../contexts/AuthContext';

export function usePermissions() {
  const { user } = useAuth();
  const isStaff = user?.role === 'STAFF';

  return {
    canAccessReports: true,
    canAccessTables: !isStaff,
    canAccessPrinters: true,

    canCreateProduct: !isStaff,
    canEditProduct: !isStaff,
    canDeleteProduct: !isStaff,

    canDeleteOrder: !isStaff,
  };
}
