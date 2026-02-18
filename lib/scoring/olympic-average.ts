import { ScoreCategory, SCORE_CATEGORIES } from '@/lib/database.types';
import type { Score } from '@/lib/database.types';

export function calculateOlympicAverage(scores: number[]): number | null {
  if (scores.length === 0) return null;

  if (scores.length < 3) {
    return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }

  // Sort and remove highest and lowest
  const sorted = [...scores].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, sorted.length - 1);
  return trimmed.reduce((sum, s) => sum + s, 0) / trimmed.length;
}

export function calculateSimpleAverage(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

export interface DancerResult {
  dancerId: string;
  dancerNumber: number;
  dancerName: string;
  categoryAverages: Record<ScoreCategory, number | null>;
  totalScore: number | null;
  olympicAverage: number | null;
  judgeCount: number;
  isOlympicAverage: boolean;
}

export interface MaterialResult {
  materialId: string;
  materialName: string;
  result: DancerResult;
}

export interface AggregatedDancerResult {
  dancerId: string;
  dancerNumber: number;
  dancerName: string;
  categoryTotals: Record<ScoreCategory, number | null>;
  totalScore: number | null;
  olympicAverage: number | null;
  judgeCount: number;
  isOlympicAverage: boolean;
  materialResults: MaterialResult[];
}

/**
 * Calculate results for a single dancer within a single material context.
 * - Category averages: simple average across judges
 * - Total Score: simple average of per-judge sums (each judge's 5 categories summed)
 * - Olympic Average: olympic average of per-judge sums
 */
export function calculateDancerResults(
  dancerId: string,
  dancerNumber: number,
  dancerName: string,
  scores: Score[]
): DancerResult {
  const judgeIds = new Set(scores.map(s => s.judge_id));
  const judgeCount = judgeIds.size;

  const categoryAverages: Record<string, number | null> = {};

  for (const category of SCORE_CATEGORIES) {
    const categoryScores = scores
      .map(s => s[category])
      .filter((v): v is number => v !== null);

    categoryAverages[category] = calculateSimpleAverage(categoryScores);
  }

  // Per-judge total scores: for each judge, sum their 5 category scores
  const perJudgeTotals: number[] = [];
  for (const judgeId of judgeIds) {
    const judgeScores = scores.filter(s => s.judge_id === judgeId);
    let judgeTotal = 0;
    let hasAny = false;
    for (const category of SCORE_CATEGORIES) {
      for (const s of judgeScores) {
        const val = s[category];
        if (val !== null) {
          judgeTotal += val;
          hasAny = true;
        }
      }
    }
    if (hasAny) {
      perJudgeTotals.push(judgeTotal);
    }
  }

  const totalScore = calculateSimpleAverage(perJudgeTotals);
  const olympicAverage = calculateOlympicAverage(perJudgeTotals);

  return {
    dancerId,
    dancerNumber,
    dancerName,
    categoryAverages: categoryAverages as Record<ScoreCategory, number | null>,
    totalScore,
    olympicAverage,
    judgeCount,
    isOlympicAverage: judgeCount >= 3,
  };
}

/**
 * Calculate aggregated results across all materials for each dancer.
 * @param dancers - Array of {id, dancer_number, name}
 * @param scores - All scores for these dancers
 * @param groupMaterialMap - Map of group_id → { materialId, materialName }
 */
export function calculateAggregatedResults(
  dancers: { id: string; dancer_number: number; name: string }[],
  scores: Score[],
  groupMaterialMap: Map<string, { materialId: string; materialName: string }>
): AggregatedDancerResult[] {
  return dancers.map(dancer => {
    const dancerScores = scores.filter(s => s.dancer_id === dancer.id);

    // Partition scores by material
    const scoresByMaterial = new Map<string, { materialName: string; scores: Score[] }>();
    for (const score of dancerScores) {
      const materialInfo = groupMaterialMap.get(score.group_id);
      if (!materialInfo) continue;
      const { materialId, materialName } = materialInfo;
      if (!scoresByMaterial.has(materialId)) {
        scoresByMaterial.set(materialId, { materialName, scores: [] });
      }
      scoresByMaterial.get(materialId)!.scores.push(score);
    }

    // Calculate per-material results
    const materialResults: MaterialResult[] = [];
    for (const [materialId, { materialName, scores: matScores }] of scoresByMaterial) {
      materialResults.push({
        materialId,
        materialName,
        result: calculateDancerResults(dancer.id, dancer.dancer_number, dancer.name, matScores),
      });
    }

    // Sort material results by name for consistent display
    materialResults.sort((a, b) => a.materialName.localeCompare(b.materialName));

    // Aggregate: sum category averages across materials
    const categoryTotals: Record<string, number | null> = {};
    for (const category of SCORE_CATEGORIES) {
      const values = materialResults
        .map(mr => mr.result.categoryAverages[category])
        .filter((v): v is number => v !== null);
      categoryTotals[category] = values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
    }

    // Aggregate: sum totalScores across materials
    const materialTotalScores = materialResults
      .map(mr => mr.result.totalScore)
      .filter((v): v is number => v !== null);
    const totalScore = materialTotalScores.length > 0
      ? materialTotalScores.reduce((a, b) => a + b, 0)
      : null;

    // Independent olympic average: for each judge, sum their per-material total scores
    // Then olympic average those cross-material judge totals
    const allJudgeIds = new Set<string>();
    for (const score of dancerScores) {
      allJudgeIds.add(score.judge_id);
    }

    const crossMaterialJudgeTotals: number[] = [];
    for (const judgeId of allJudgeIds) {
      let judgeCrossTotal = 0;
      let hasAny = false;
      for (const [, { scores: matScores }] of scoresByMaterial) {
        const judgeMatScores = matScores.filter(s => s.judge_id === judgeId);
        for (const category of SCORE_CATEGORIES) {
          for (const s of judgeMatScores) {
            const val = s[category];
            if (val !== null) {
              judgeCrossTotal += val;
              hasAny = true;
            }
          }
        }
      }
      if (hasAny) {
        crossMaterialJudgeTotals.push(judgeCrossTotal);
      }
    }

    const olympicAverage = calculateOlympicAverage(crossMaterialJudgeTotals);
    const judgeCount = allJudgeIds.size;

    return {
      dancerId: dancer.id,
      dancerNumber: dancer.dancer_number,
      dancerName: dancer.name,
      categoryTotals: categoryTotals as Record<ScoreCategory, number | null>,
      totalScore,
      olympicAverage,
      judgeCount,
      isOlympicAverage: judgeCount >= 3,
      materialResults,
    };
  });
}
