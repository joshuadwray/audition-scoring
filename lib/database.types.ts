export type ScoreCategory =
  | 'performance_quality'
  | 'technical_execution'
  | 'musicality_timing'
  | 'embodiment_of_style';

export const SCORE_CATEGORIES: ScoreCategory[] = [
  'performance_quality',
  'technical_execution',
  'musicality_timing',
  'embodiment_of_style',
];

export const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  performance_quality: 'Performance Quality',
  technical_execution: 'Technical Execution',
  musicality_timing: 'Musicality/Timing',
  embodiment_of_style: 'Embodiment of Style',
};

export const CATEGORY_SHORT_LABELS: Record<ScoreCategory, string> = {
  performance_quality: 'Performance Quality',
  technical_execution: 'Technical Execution',
  musicality_timing: 'Musicality/Timing',
  embodiment_of_style: 'Embodiment of Style',
};

export const MAX_TOTAL_SCORE = SCORE_CATEGORIES.length * 5;

export interface Session {
  id: string;
  session_code: string;
  name: string;
  date: string;
  status: 'setup' | 'active' | 'paused' | 'completed';
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface Material {
  id: string;
  session_id: string;
  name: string;
  created_at: string;
}

export interface Dancer {
  id: string;
  session_id: string;
  dancer_number: number;
  name: string;
  grade: number | null;
  created_at: string;
}

export interface Judge {
  id: string;
  session_id: string;
  name: string;
  is_active: boolean;
  is_admin_judge: boolean;
  created_at: string;
  /** Only present in the single POST /api/judges response — never stored or re-exposed */
  judge_pin?: string;
}

export interface DancerGroup {
  id: string;
  session_id: string;
  material_id: string | null;
  group_number: number;
  status: 'queued' | 'active' | 'completed' | 'retracted';
  dancer_ids: string[];
  is_archived: boolean;
  pushed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DancerGroupWithMaterial extends DancerGroup {
  materials?: { name: string } | null;
}

export interface Score {
  id: string;
  group_id: string;
  judge_id: string;
  dancer_id: string;
  performance_quality: number | null;
  technical_execution: number | null;
  musicality_timing: number | null;
  embodiment_of_style: number | null;
  created_at: string;
  updated_at: string;
}

export interface ScoreSubmission {
  id: string;
  group_id: string;
  judge_id: string;
  submitted_at: string;
  score_count: number;
}

export interface AdminAction {
  id: string;
  session_id: string;
  action_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ScoreState {
  performance_quality?: number;
  technical_execution?: number;
  musicality_timing?: number;
  embodiment_of_style?: number;
}

export interface TokenPayload {
  sessionId: string;
  role: 'admin' | 'judge';
  judgeId?: string;
  judgeName?: string;
  iat?: number;
  exp?: number;
}
