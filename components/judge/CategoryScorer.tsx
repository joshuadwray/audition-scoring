'use client';

interface CategoryScorerProps {
  label: string;
  shortLabel: string;
  value?: number;
  onChange: (value: number) => void;
  isLocked?: boolean;
  compact?: boolean;
  isFocused?: boolean;
}

export default function CategoryScorer({
  label,
  shortLabel,
  value,
  onChange,
  isLocked,
  compact,
  isFocused,
}: CategoryScorerProps) {
  const activeButton = value !== undefined ? Math.floor(value) : undefined;
  const isHalf = value !== undefined && value % 1 !== 0;

  const handleClick = (score: number) => {
    if (isLocked) return;

    if (value === score) {
      // Whole selected → toggle to half (except 5)
      if (score < 5) {
        onChange(score + 0.5);
      }
    } else if (value === score + 0.5) {
      // Half selected → toggle back to whole
      onChange(score);
    } else {
      // Different or no score → set whole
      onChange(score);
    }
  };

  return (
    <div className={`${compact ? 'mb-2' : 'mb-3'} ${isFocused ? 'bg-blue-50 rounded -mx-1 px-1 py-0.5' : ''}`}>
      <div className={`font-semibold text-gray-500 uppercase tracking-wide mb-1 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
        {label}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map(score => {
          const isWholeSelected = activeButton === score && !isHalf;
          const isHalfSelected = activeButton === score && isHalf;

          return (
            <button
              key={score}
              onClick={() => handleClick(score)}
              disabled={isLocked}
              className={`
                ${compact ? 'py-1.5 px-0.5 text-xs' : 'py-2 px-1 text-sm'}
                font-semibold rounded border-2 transition-all text-center
                ${isWholeSelected
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : isHalfSelected
                    ? 'bg-blue-100 border-blue-400 text-blue-600'
                    : isLocked
                      ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'border-gray-200 text-gray-600 hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
                }
              `}
            >
              {isHalfSelected ? `${score}.5` : score}
            </button>
          );
        })}
      </div>
    </div>
  );
}
