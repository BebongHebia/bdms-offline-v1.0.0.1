interface BarangaySealProps {
  size?: number;
  className?: string;
}

export function BarangaySeal({size = 48, className = ''}: BarangaySealProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Official Seal of Barangay Ocho, Malaybalay City, Bukidnon"
    >
      <circle cx="60" cy="60" r="56" fill="#1E3A8A" stroke="#CA8A04" strokeWidth="4" />
      <circle cx="60" cy="60" r="46" fill="#FFFFFF" stroke="#1E3A8A" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="35" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1" />
      {/* Bukidnon highland silhouette */}
      <path d="M27 69 L45 48 L59 61 L74 44 L93 69 Z" fill="#15803D" opacity="0.9" />
      <path d="M27 69 L45 55 L58 65 L75 52 L93 69 Z" fill="#166534" />
      {/* Sun emblem */}
      <circle cx="60" cy="39" r="7" fill="#EAB308" />
      <path d="M60 28 V31 M60 47 V50 M49 39 H52 M68 39 H71 M52 31 L54 33 M66 45 L68 47 M68 31 L66 33 M54 45 L52 47" stroke="#CA8A04" strokeWidth="1.8" strokeLinecap="round" />
      {/* Civic Banner */}
      <rect x="33" y="72" width="54" height="14" rx="2" fill="#1E3A8A" />
      <text
        x="60"
        y="82"
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize="8.5"
        fontWeight="700"
        fontFamily="sans-serif"
        letterSpacing="0.6"
      >
        BRGY. OCHO
      </text>
      <text
        x="60"
        y="102"
        textAnchor="middle"
        fill="#1E3A8A"
        fontSize="6.5"
        fontWeight="700"
        fontFamily="sans-serif"
        letterSpacing="0.5"
      >
        MALAYBALAY
      </text>
    </svg>
  );
}
