import { cn } from "../../lib/cn";

export function LogoMark({ className, size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("text-primary", className)}
    >
      <path
        d="M16 2.5L4.5 6.5V15c0 6.5 4.6 12.5 11.5 14.5C22.9 27.5 27.5 21.5 27.5 15V6.5L16 2.5Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 16c1.8-3.2 4.3-4.8 6.5-4.8s4.7 1.6 6.5 4.8c-1.8 3.2-4.3 4.8-6.5 4.8s-4.7-1.6-6.5-4.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function Logo({ className, size = 28, showWordmark = true }) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      {showWordmark ? (
        <span className="font-semibold text-ink text-lg tracking-tight">
          Invigilo
        </span>
      ) : null}
    </div>
  );
}
