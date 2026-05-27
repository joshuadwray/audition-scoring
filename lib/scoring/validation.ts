import { ScoreState, SCORE_CATEGORIES } from '@/lib/database.types';

/**
 * A row is "complete" for submission purposes if it's either fully scored
 * across all categories OR explicitly skipped. The submit gate uses this
 * to decide whether the judge can press Submit Scores.
 */
export function isScoreComplete(scores: ScoreState): boolean {
  if (scores.is_skipped) return true;
  return SCORE_CATEGORIES.every(cat => scores[cat] !== undefined && scores[cat] !== null);
}

export function isValidScore(value: number): boolean {
  return value >= 1 && value <= 5 && (value * 2) % 1 === 0;
}

export function validateScoreState(scores: ScoreState): string | null {
  for (const category of SCORE_CATEGORIES) {
    const value = scores[category];
    if (value !== undefined && value !== null && !isValidScore(value)) {
      return `Invalid score for ${category}: must be 1-5 in 0.5 increments`;
    }
  }
  return null;
}

export function countScoredCategories(scores: ScoreState): number {
  return SCORE_CATEGORIES.filter(cat => scores[cat] !== undefined && scores[cat] !== null).length;
}
