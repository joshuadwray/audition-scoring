'use client';

import { ScoreState, SCORE_CATEGORIES, CATEGORY_LABELS, CATEGORY_SHORT_LABELS, MAX_TOTAL_SCORE } from '@/lib/database.types';
import { countScoredCategories } from '@/lib/scoring/validation';
import CategoryScorer from './CategoryScorer';

interface DancerTileProps {
  dancer: { id: string; dancer_number: number; name: string };
  scores: ScoreState;
  onScoreChange: (category: string, value: number) => void;
  /** Optional skip toggle. If omitted, the Skip pill is not rendered (e.g. in
   * legacy admin contexts where skip isn't wired up yet). */
  onToggleSkip?: () => void;
  isLocked?: boolean;
  compact?: boolean;
  materialLabel?: string;
  materialColorClasses?: { bg: string; text: string };
  isFocused?: boolean;
  focusedCategoryIndex?: number | null;
  onFocusTile?: () => void;
}

export default function DancerTile({
  dancer,
  scores,
  onScoreChange,
  onToggleSkip,
  isLocked,
  compact,
  materialLabel,
  materialColorClasses,
  isFocused,
  focusedCategoryIndex,
  onFocusTile,
}: DancerTileProps) {
  const isSkipped = scores.is_skipped === true;
  const scored = countScoredCategories(scores);
  const totalCategories = SCORE_CATEGORIES.length;
  const isComplete = !isSkipped && scored === totalCategories;
  const isPartial = !isSkipped && scored > 0 && scored < totalCategories;

  // Calculate running total of scored categories
  const runningTotal = SCORE_CATEGORIES.reduce((sum, cat) => {
    const val = scores[cat];
    return val != null ? sum + val : sum;
  }, 0);

  const borderColor = isSkipped
    ? 'border-gray-300'
    : isComplete
      ? 'border-green-500'
      : isPartial
        ? 'border-orange-400'
        : 'border-gray-200';

  return (
    <div
      className={`bg-white border-2 ${borderColor} rounded-lg ${compact ? 'p-3' : 'p-4'} transition-colors ${isFocused ? 'ring-2 ring-blue-400' : ''} ${isSkipped ? 'bg-gray-50' : ''}`}
      onClick={onFocusTile}
      tabIndex={onFocusTile ? 0 : undefined}
    >
      <div className="mb-3 pb-2 border-b-2 border-gray-100">
        <div className="flex justify-between items-center gap-2">
          <div className={`flex items-center gap-2 min-w-0 ${isSkipped ? 'opacity-60' : ''}`}>
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
          <div className="flex items-center gap-2 shrink-0">
            {isSkipped ? (
              <span className="px-1.5 py-0.5 bg-gray-200 text-gray-700 text-xs font-medium rounded">
                Skipped
              </span>
            ) : (
              <span className={`font-semibold text-xs whitespace-nowrap ${
                isComplete ? 'text-green-600' : isPartial ? 'text-orange-500' : 'text-gray-400'
              }`}>
                {scored}/{totalCategories}{isComplete ? ' ✓' : ''}
              </span>
            )}
            {onToggleSkip && !isLocked && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSkip(); }}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  isSkipped
                    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {isSkipped ? 'Unskip' : 'Skip'}
              </button>
            )}
          </div>
        </div>
        {!isSkipped && scored > 0 && (
          <div className={`mt-1.5 text-center py-1 rounded-md font-bold ${compact ? 'text-lg' : 'text-xl'} ${
            isComplete
              ? 'bg-green-50 text-green-700'
              : 'bg-blue-50 text-blue-700'
          }`}>
            {runningTotal}<span className={`font-normal ${compact ? 'text-xs' : 'text-sm'} ${isComplete ? 'text-green-500' : 'text-blue-400'}`}> / {MAX_TOTAL_SCORE}</span>
          </div>
        )}
      </div>

      <div className={isSkipped ? 'opacity-40 pointer-events-none' : ''}>
        {SCORE_CATEGORIES.map((cat, catIndex) => (
          <CategoryScorer
            key={cat}
            label={CATEGORY_LABELS[cat]}
            shortLabel={CATEGORY_SHORT_LABELS[cat]}
            value={scores[cat]}
            onChange={value => onScoreChange(cat, value)}
            isLocked={isLocked || isSkipped}
            compact={compact}
            isFocused={isFocused && focusedCategoryIndex === catIndex && !isSkipped}
          />
        ))}
      </div>
    </div>
  );
}
