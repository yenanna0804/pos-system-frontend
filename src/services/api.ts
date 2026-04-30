import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || 'Có lỗi xảy ra';
    return Promise.reject(message);
  }
);

export const authService = {
  login: (username: string, password: string, branchId: string) =>
    api.post('/auth/login', { username, password, branchId }),
  loginContext: (username: string) => api.post('/auth/login-context', { username }),
};

export const branchService = {
  getAll: () => api.get('/branches'),
};

export type ProductPayload = {
  type?: 'SINGLE' | 'COMBO';
  autoPrice?: boolean;
  sku?: string;
  name: string;
  imageUrl?: string | null;
  imageThumb?: string | null;
  categoryId?: string | null;
  unit?: string;
  weight?: number;
  costPrice?: number;
  price: number;
  isActive?: boolean;
  branchConfigs?: { branchId: string; isActive: boolean; stock?: number }[];
  comboItems?: { itemProductId: string; quantity: number }[];
};

export const productService = {
  list: (params: {
    page?: number;
    pageSize?: number;
    type?: 'SINGLE' | 'COMBO';
    categoryId?: string;
    stockStatus?: 'all' | 'in_stock' | 'out_of_stock';
    branchId?: string;
    search?: string;
  }) => api.get('/products', { params }),
  getById: (id: string) => api.get(`/products/${id}`),
  getDeleteImpact: (id: string) => api.get(`/products/${id}/delete-impact`),
  create: (payload: ProductPayload) => api.post('/products', payload),
  update: (id: string, payload: ProductPayload) => api.patch(`/products/${id}`, payload),
  remove: (id: string) => api.delete(`/products/${id}`),
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post('/products/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const categoryService = {
  list: () => api.get('/categories'),
  create: (name: string) => api.post('/categories', { name }),
  update: (id: string, name: string) => api.patch(`/categories/${id}`, { name }),
  remove: (id: string) => api.delete(`/categories/${id}`),
};

export type AreaPayload = { name: string; branchId?: string };
export type RoomPayload = { name: string; areaId: string; branchId?: string };
export type DiningTablePayload = {
  name: string;
  areaId: string;
  roomId?: string | null;
  branchId?: string;
  capacity?: number;
};

export const areaService = {
  list: (branchId?: string) => api.get('/areas', { params: { branchId } }),
  create: (payload: AreaPayload) => api.post('/areas', payload),
  update: (id: string, payload: AreaPayload) => api.patch(`/areas/${id}`, payload),
  remove: (id: string) => api.delete(`/areas/${id}`),
};

export const roomService = {
  list: (params?: { areaId?: string; branchId?: string }) => api.get('/rooms', { params }),
  create: (payload: RoomPayload) => api.post('/rooms', payload),
  update: (id: string, payload: RoomPayload) => api.patch(`/rooms/${id}`, payload),
  remove: (id: string) => api.delete(`/rooms/${id}`),
};

export const diningTableService = {
  list: (params?: {
    branchId?: string;
    areaId?: string;
    roomId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) =>
    api.get('/dining-tables', { params }),
  options: (params?: { branchId?: string }) => api.get('/dining-tables/options', { params }),
  create: (payload: DiningTablePayload) => api.post('/dining-tables', payload),
  update: (id: string, payload: DiningTablePayload) => api.patch(`/dining-tables/${id}`, payload),
  remove: (id: string) => api.delete(`/dining-tables/${id}`),
};

export type OrderPayload = {
  entityType: 'TABLE' | 'ROOM';
  tableId?: string;
  roomId?: string;
  customerName?: string;
  totalAmount: number;
  discountAmount?: number;
  discountMode?: 'percent' | 'amount';
  discountValue?: number;
  surchargeAmount?: number;
  surchargeMode?: 'percent' | 'amount';
  surchargeValue?: number;
  paidAmount?: number;
  billItems: {
    lineId: string;
    productId: string;
    productName: string;
    unit?: string;
    baseUnitPrice?: number;
    unitPrice: number;
    quantity: number;
    note: string;
  }[];
  branchId?: string;
};

export const orderService = {
  list: (params?: {
    branchId?: string;
    page?: number;
    pageSize?: number;
    search?: string;
    orderStates?: string;
    areaId?: string;
    roomId?: string;
    tableId?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/orders', { params }),
  getById: (id: string) => api.get(`/orders/${id}`),
  create: (payload: OrderPayload) => api.post('/orders', payload),
  update: (id: string, payload: Partial<OrderPayload>) => api.patch(`/orders/${id}`, payload),
  print: (id: string) => api.post(`/orders/${id}/print`),
  remove: (id: string) => api.delete(`/orders/${id}`),
  history: (id: string) => api.get(`/orders/${id}/logs`),
};

export default api;
