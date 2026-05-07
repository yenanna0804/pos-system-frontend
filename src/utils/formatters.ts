const VN_OFFSET = '+07:00';

export const toISOWithVNOffset = (datePart: string, timePart: string, endOfMinute = false): string => {
  const seconds = endOfMinute ? '59' : '00';
  return `${datePart}T${timePart}:${seconds}${VN_OFFSET}`;
};

export const formatDateTimeVN = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
};
