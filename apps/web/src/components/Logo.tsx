export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14" cy="14" r="8.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1 14H27M14 1V27" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M7 19.5 L20 8 M8 8 L19.5 19.5"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity=".5"
      />
      <circle cx="18.5" cy="9.5" r="2.3" fill="var(--color-astro)" />
    </svg>
  );
}
