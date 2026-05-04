type Props = {
  lineId: string;
  startAt?: string | null;
  stopAt?: string | null;
  isLoading: boolean;
  isUnsynced?: boolean;
  hasError?: boolean;
  onToggleTimeLineTimer?: (lineId: string, action: 'start' | 'stop') => Promise<void>;
};

export default function TimeLineControls({
  lineId,
  startAt,
  stopAt,
  isLoading,
  isUnsynced = false,
  hasError = false,
  onToggleTimeLineTimer,
}: Props) {
  const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const timePart = date.toLocaleTimeString('vi-VN', { hour12: false });
    const datePart = date.toLocaleDateString('vi-VN');
    return `${timePart} ${datePart}`;
  };

  const hasStarted = Boolean(startAt);
  const isRunning = hasStarted && !stopAt;

  if (isRunning) {
    return (
      <button
        type="button"
        className="ghost-btn"
        disabled={!onToggleTimeLineTimer || isLoading}
        onClick={() => onToggleTimeLineTimer?.(lineId, 'stop')}
      >
        {isLoading ? 'Đang xử lý...' : 'Kết thúc đếm giờ'}
      </button>
    );
  }

  if (!hasStarted) {
    const isDisabled = !onToggleTimeLineTimer || isLoading;
    const label = isLoading
      ? 'Đang xử lý...'
      : isUnsynced
        ? 'Đồng bộ & bắt đầu'
        : hasError
          ? 'Thử lại'
          : 'Bắt đầu đếm giờ';
    return (
      <button
        type="button"
        className="ghost-btn"
        disabled={isDisabled}
        onClick={() => onToggleTimeLineTimer?.(lineId, 'start')}
        title={isUnsynced ? 'Dòng mới sẽ được tự động đồng bộ khi bấm bắt đầu' : undefined}
      >
        {label}
      </button>
    );
  }

  const startMs = startAt ? Date.parse(startAt) : NaN;
  const stopMs = stopAt ? Date.parse(stopAt) : NaN;
  const elapsedMinutes = Number.isFinite(startMs) && Number.isFinite(stopMs) && stopMs > startMs
    ? Math.ceil((stopMs - startMs) / 60000)
    : 0;
  const usedMinutes = Math.max(0, elapsedMinutes);
  const hh = Math.floor(usedMinutes / 60);
  const mm = usedMinutes % 60;
  const startText = startAt ? formatDateTime(startAt) : '';
  const stopText = stopAt ? formatDateTime(stopAt) : '';
  const rangeText = startText && stopText ? ` (${startText} - ${stopText})` : '';
  return <span className="orders-bill-subline">Đã sử dụng {`${hh}h${String(mm).padStart(2, '0')}p`}{rangeText}</span>;
}
