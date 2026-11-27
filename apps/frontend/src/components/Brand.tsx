export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand${light ? ' brand--light' : ''}`}>
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none">
          <path
            d="M9 24V16a7 7 0 0 1 14 0v8a7 7 0 0 1-14 0Z"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <path
            d="M17 24V16a7 7 0 0 1 14 0v8a7 7 0 0 1-14 0Z"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <circle cx="28" cy="10" r="4" fill="var(--color-gold)" />
        </svg>
      </span>
      <span>
        <strong>Gabinete UCB</strong>
        <small>Servicios Psicológicos</small>
      </span>
    </div>
  );
}
