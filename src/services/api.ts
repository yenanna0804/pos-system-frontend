import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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
};

export const branchService = {
  getAll: () => api.get('/branches'),
};

export type ProductPayload = {
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
};

export const productService = {
  list: (params: {
    page?: number;
    pageSize?: number;
    categoryId?: string;
    stockStatus?: 'all' | 'in_stock' | 'out_of_stock';
    branchId?: string;
  }) => api.get('/products', { params }),
  getById: (id: string) => api.get(`/products/${id}`),
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

export default api;
