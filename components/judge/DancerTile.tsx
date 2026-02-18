'use client';

import { ScoreState, SCORE_CATEGORIES, CATEGORY_LABELS, CATEGORY_SHORT_LABELS } from '@/lib/database.types';
import { countScoredCategories } from '@/lib/scoring/validation';
import CategoryScorer from './CategoryScorer';

interface DancerTileProps {
  dancer: { id: string; dancer_number: number; name: string };
  scores: ScoreState;
  onScoreChange: (category: string, value: number) => void;
  isLocked?: boolean;
  compact?: boolean;
  materialLabel?: string;
  materialColorClasses?: { bg: string; text: string };
  isFocused?: boolean;
  focusedCategoryIndex?: number | null;
  onFocusTile?: () => void;
}

export default function DancerTile({ dancer, scores, onScoreChange, isLocked, compact, materialLabel, materialColorClasses, isFocused, focusedCategoryIndex, onFocusTile }: DancerTileProps) {
  const scored = countScoredCategories(scores);
  const isComplete = scored === 5;
  const isPartial = scored > 0 && scored < 5;

  // Calculate running total of scored categories
  const runningTotal = SCORE_CATEGORIES.reduce((sum, cat) => {
    const val = scores[cat];
    return val != null ? sum + val : sum;
  }, 0);

  const borderColor = isComplete
    ? 'border-green-500'
    : isPartial
      ? 'border-orange-400'
      : 'border-gray-200';

  return (
    <div
      className={`bg-white border-2 ${borderColor} rounded-lg ${compact ? 'p-3' : 'p-4'} transition-colors ${isFocused ? 'ring-2 ring-blue-400' : ''}`}
      onClick={onFocusTile}
      tabIndex={onFocusTile ? 0 : undefined}
    >
      <div className="mb-3 pb-2 border-b-2 border-gray-100">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`font-bold text-gray-900 ${compact ? 'text-lg' : 'text-xl'}`}>
              #{dancer.dancer_number}
            </span>
            <span className={`font-bold text-gray-900 truncate ${compact ? 'text-sm' : 'text-base'}`}>
              {dancer.name}
            </span>
            {materialLabel && (
              <span className={`px-1.5 py-0.5 text-xs font-medium rounded shrink-0 ${materialColorClasses ? `${materialColorClasses.bg} ${materialColorClasses.text}` : 'bg-purple-100 text-purple-700'}`}>
                {materialLabel}
              </span>
            )}
          </div>
          <span className={`font-semibold text-xs whitespace-nowrap ${
            isComplete ? 'text-green-600' : isPartial ? 'text-orange-500' : 'text-gray-400'
          }`}>
            {scored}/5{isComplete ? ' \u2713' : ''}
          </span>
        </div>
        {scored > 0 && (
          <div className={`mt-1.5 text-center py-1 rounded-md font-bold ${compact ? 'text-lg' : 'text-xl'} ${
            isComplete
              ? 'bg-green-50 text-green-700'
              : 'bg-blue-50 text-blue-700'
          }`}>
            {runningTotal}<span className={`font-normal ${compact ? 'text-xs' : 'text-sm'} ${isComplete ? 'text-green-500' : 'text-blue-400'}`}> / 25</span>
          </div>
        )}
      </div>

      {SCORE_CATEGORIES.map((cat, catIndex) => (
        <CategoryScorer
          key={cat}
          label={CATEGORY_LABELS[cat]}
          shortLabel={CATEGORY_SHORT_LABELS[cat]}
          value={scores[cat]}
          onChange={value => onScoreChange(cat, value)}
          isLocked={isLocked}
          compact={compact}
          isFocused={isFocused && focusedCategoryIndex === catIndex}
        />
      ))}
    </div>
  );
}
