type Props = {
  lineId: string;
  isRunning: boolean;
  usedMinutes: number;
  isLoading: boolean;
  onToggleTimeLineTimer?: (lineId: string, action: 'start' | 'stop') => Promise<void>;
};

export default function TimeLineControls({
  lineId,
  isRunning,
  usedMinutes,
  isLoading,
  onToggleTimeLineTimer,
}: Props) {
  const hasUsedDuration = usedMinutes > 0;

  if (isRunning) {
    return (
      <button
        type="button"
        className="orders-ghost-btn"
        disabled={!onToggleTimeLineTimer || isLoading}
        onClick={() => onToggleTimeLineTimer?.(lineId, 'stop')}
      >
        {isLoading ? 'Đang xử lý...' : 'Kết thúc đếm giờ'}
      </button>
    );
  }

  if (!hasUsedDuration) {
    return (
      <button
        type="button"
        className="orders-ghost-btn"
        disabled={!onToggleTimeLineTimer || isLoading}
        onClick={() => onToggleTimeLineTimer?.(lineId, 'start')}
      >
        {isLoading ? 'Đang xử lý...' : 'Bắt đầu đếm giờ'}
      </button>
    );
  }

  const hh = Math.floor(usedMinutes / 60);
  const mm = usedMinutes % 60;
  return <span className="orders-bill-subline">Đã sử dụng: {`${hh}h${String(mm).padStart(2, '0')}phút`}</span>;
}
