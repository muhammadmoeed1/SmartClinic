import { useState } from 'react';

interface StarRatingProps {
  value: number;
  onChange?: (score: number) => void;
  size?: number;
}

/** Read-only when `onChange` is omitted; an interactive 1-5 picker otherwise. */
export default function StarRating({ value, onChange, size = 18 }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const interactive = Boolean(onChange);
  const shown = interactive && hover !== null ? hover : value;

  return (
    <span className={`star-rating ${interactive ? 'star-rating--interactive' : ''}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star-rating__star ${n <= shown ? 'star-rating__star--filled' : ''}`}
          style={{ width: size, height: size }}
          disabled={!interactive}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(null)}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.5l3.09 6.26 6.91 1-5 4.87 1.18 6.88L12 17.98l-6.18 3.53L7 14.63l-5-4.87 6.91-1L12 2.5z" />
          </svg>
        </button>
      ))}
    </span>
  );
}
