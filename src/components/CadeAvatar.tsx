interface CadeAvatarProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: 24,
  md: 32,
  lg: 48,
};

export function CadeAvatar({ size = "md", className = "" }: CadeAvatarProps) {
  const px = sizes[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Coach Cade"
    >
      {/* motion swoosh arcs — subtle speed trails behind the C */}
      <path
        d="M26 7 Q30.5 16 26 25"
        stroke="#2563EB"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.15"
      />
      <path
        d="M24 9 Q27.5 16 24 23"
        stroke="#2563EB"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.3"
      />
      {/* bold C — the brand mark */}
      <path
        d="M21.5 10.5C19.5 8.9 17 8 14 8C8.5 8 4 11.6 4 16.5C4 21.4 8.5 25 14 25C17 25 19.5 24.1 21.5 22.5"
        stroke="#2563EB"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
