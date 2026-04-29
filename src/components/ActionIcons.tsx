type IconProps = {
  size?: number;
};

export function EditActionIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 14l1.6-.3 5.6-5.6a1.2 1.2 0 0 0 0-1.7l-1.5-1.5a1.2 1.2 0 0 0-1.7 0l-5.6 5.6L10 12z" fill="currentColor" />
    </svg>
  );
}

export function DeleteActionIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 5.5h8m-7 0 .4-1.2A1.8 1.8 0 0 1 11.1 3h1.8c.8 0 1.5.5 1.7 1.3l.4 1.2m2.5 0-.8 12a2 2 0 0 1-2 1.8H9.3a2 2 0 0 1-2-1.8l-.8-12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.2 9.5v6.5m3.6-6.5v6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PrintActionIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 2h12a1 1 0 0 1 1 1v4H5V3a1 1 0 0 1 1-1Z" />
      <path d="M5 14h14v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7Zm3 1v5h8v-5H8Z" />
      <path d="M3 8h18a2 2 0 0 1 2 2v5h-4v-2H5v2H1v-5a2 2 0 0 1 2-2Zm16 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
    </svg>
  );
}
