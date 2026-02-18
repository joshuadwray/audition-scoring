export type ScoreCategory = 'technique' | 'musicality' | 'expression' | 'timing' | 'presentation';

export const SCORE_CATEGORIES: ScoreCategory[] = [
  'technique', 'musicality', 'expression', 'timing', 'presentation'
];

export const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  technique: 'Technique',
  musicality: 'Musicality',
  expression: 'Expression',
  timing: 'Timing',
  presentation: 'Presentation',
};

export const CATEGORY_SHORT_LABELS: Record<ScoreCategory, string> = {
  technique: 'Tech',
  musicality: 'Music',
  expression: 'Expr',
  timing: 'Time',
  presentation: 'Pres',
};

export interface Session {
  id: string;
  session_code: string;
  name: string;
  date: string;
  status: 'setup' | 'active' | 'paused' | 'completed';
  is_locked: boolean;
  admin_pin: string;
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
  judge_pin: string;
  is_active: boolean;
  is_admin_judge: boolean;
  created_at: string;
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
  technique: number | null;
  musicality: number | null;
  expression: number | null;
  timing: number | null;
  presentation: number | null;
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
  technique?: number;
  musicality?: number;
  expression?: number;
  timing?: number;
  presentation?: number;
}

export interface TokenPayload {
  sessionId: string;
  role: 'admin' | 'judge';
  judgeId?: string;
  judgeName?: string;
  iat?: number;
  exp?: number;
}
