export interface ApiError {
  message: string;
  statusCode?: number;
  reason?: string;
}

export const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return (error as ApiError).message;
  return 'Có lỗi xảy ra';
};
