import type { MouseEvent } from 'react';

type TooltipInfoButtonProps = {
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  label: string;
  className?: string;
};

export default function TooltipInfoButton({ onClick, label, className = '' }: TooltipInfoButtonProps) {
  const classes = ['ui-tooltip-info-btn', className].filter(Boolean).join(' ');

  return (
    <button type="button" className={classes} aria-label={label} title={label} onClick={onClick}>
      <span className="ui-tooltip-info-btn-bubble">?</span>
      <span className="ui-tooltip-info-btn-tail" aria-hidden />
    </button>
  );
}
