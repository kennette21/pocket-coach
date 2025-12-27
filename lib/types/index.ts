export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  tool_calls?: Array<{
    tool: string
    input: Record<string, unknown>
    result: Record<string, unknown>
  }>
}

export type Goal = {
  id: string
  user_id: string
  title: string
  description: string | null
  why: string | null
  target_date: string
  start_date: string
  status: 'active' | 'paused' | 'completed' | 'abandoned'
  category: 'health' | 'career' | 'finance' | 'learning' | 'personal' | 'relationships' | 'other' | null
  priority: number
  success_criteria: string[]
  created_at: string
  updated_at: string
  milestones?: Milestone[]
}

export type Milestone = {
  id: string
  goal_id: string
  title: string
  description: string | null
  target_date: string
  order_index: number
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped'
  completion_notes: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type Checkin = {
  id: string
  goal_id: string
  user_id: string
  checkin_type: 'manual' | 'scheduled' | 'chat'
  user_message: string
  ai_summary: string | null
  mood_score: number | null
  progress_assessment: 'on_track' | 'ahead' | 'behind' | 'blocked' | null
  milestones_updated: string[]
  created_at: string
}

export type Conversation = {
  id: string
  user_id: string
  goal_id: string | null
  conversation_type: 'goal_creation' | 'checkin' | 'replanning' | 'general'
  title: string | null
  messages: Message[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Profile = {
  id: string
  name: string
  timezone: string
  created_at: string
  updated_at: string
}
