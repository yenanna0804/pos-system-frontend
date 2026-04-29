type FilterResetButtonProps = {
  onClick: () => void;
  className?: string;
};

export default function FilterResetButton({ onClick, className = '' }: FilterResetButtonProps) {
  const classes = ['ghost-btn', 'icon-action-btn', 'filter-reset-btn', className].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      title="Đặt lại bộ lọc"
      aria-label="Đặt lại bộ lọc"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M20 12a8 8 0 1 1-2.35-5.65" />
        <path d="M20 4v6h-6" />
      </svg>
    </button>
  );
}
