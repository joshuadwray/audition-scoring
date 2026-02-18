'use client';

import { ScoreState } from '@/lib/database.types';
import { isScoreComplete } from '@/lib/scoring/validation';

interface GroupSubmitButtonProps {
  dancers: { id: string; dancer_number: number }[];
  localScores: Record<string, ScoreState>;
  onSubmit: () => void;
  isSubmitting: boolean;
  isSubmitted: boolean;
}

export default function GroupSubmitButton({
  dancers,
  localScores,
  onSubmit,
  isSubmitting,
  isSubmitted,
}: GroupSubmitButtonProps) {
  const incomplete = dancers.filter(d => {
    const scores = localScores[d.id] || {};
    return !isScoreComplete(scores);
  });

  const allComplete = incomplete.length === 0;
  const totalScored = dancers.length - incomplete.length;

  if (isSubmitted) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-green-600 text-white p-4 text-center font-medium shadow-lg">
        Scores submitted successfully!
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {allComplete ? (
            <span className="text-green-600 font-medium">All dancers scored</span>
          ) : (
            <span>{totalScored}/{dancers.length} dancers complete</span>
          )}
        </div>
        <button
          onClick={onSubmit}
          disabled={!allComplete || isSubmitting}
          className={`px-8 py-3 rounded-lg font-medium transition-colors ${
            allComplete && !isSubmitting
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Scores'}
        </button>
      </div>
    </div>
  );
}
