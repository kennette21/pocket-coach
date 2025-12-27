# Goal Agent MVP - Project Specification v2
## (Next.js + Supabase + Anthropic SDK)

## Project Overview

Build an AI-powered goal tracking application that helps users create, track, and achieve their goals through conversational interaction. The AI assists with goal formulation using SMART criteria, breaks goals into milestones, tracks progress through check-ins, and adapts plans when users encounter obstacles.

### Core Value Proposition
- **Conversational Goal Setting**: Chat with AI to define well-structured goals
- **Automatic Milestone Generation**: AI breaks goals into achievable steps
- **Progress Tracking**: Regular check-ins with AI analysis
- **Adaptive Planning**: AI helps adjust goals when circumstances change

---

## Technical Stack

### Framework
- **Next.js 14** with App Router (React + API routes in one)
- **TypeScript** throughout
- **TailwindCSS** for styling

### Database & Auth
- **Supabase** (hosted Postgres + Auth + Dashboard)
- No need to manage database infrastructure
- Built-in Row Level Security (RLS) for data protection

### AI
- **Anthropic SDK** (`@anthropic-ai/sdk`)
- Direct API calls, no frameworks/wrappers
- claude-sonnet-4-20250514 for all LLM calls

### Deployment
- **Vercel** (free tier) - automatic deployments from GitHub
- Environment variables managed in Vercel dashboard

---

## Project Structure

```
goal-agent/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
├── .env.local.example
├── middleware.ts                 # Auth middleware
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # Browser client
│   │   ├── server.ts            # Server client
│   │   └── admin.ts             # Admin client (for API routes)
│   │
│   ├── anthropic/
│   │   ├── client.ts            # Anthropic client setup
│   │   ├── orchestrator.ts      # Main LLM coordination
│   │   ├── tools.ts             # Tool definitions
│   │   └── prompts/
│   │       ├── router.ts
│   │       ├── goal-builder.ts
│   │       ├── checkin-analyzer.ts
│   │       └── replanner.ts
│   │
│   └── types/
│       ├── database.ts          # Generated from Supabase
│       └── index.ts             # App-specific types
│
├── app/
│   ├── layout.tsx               # Root layout with providers
│   ├── page.tsx                 # Landing/redirect
│   ├── globals.css
│   │
│   ├── (auth)/                  # Auth pages (no sidebar)
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── layout.tsx
│   │
│   ├── (dashboard)/             # Main app (with sidebar)
│   │   ├── layout.tsx           # Dashboard layout with sidebar
│   │   ├── dashboard/page.tsx   # Main dashboard
│   │   ├── goals/
│   │   │   ├── page.tsx         # Goals list
│   │   │   └── [id]/page.tsx    # Goal detail
│   │   ├── chat/
│   │   │   ├── page.tsx         # New chat
│   │   │   └── [id]/page.tsx    # Existing conversation
│   │   └── settings/page.tsx
│   │
│   └── api/
│       ├── chat/
│       │   └── route.ts         # POST: Send message, get AI response
│       ├── goals/
│       │   ├── route.ts         # GET: List, POST: Create
│       │   └── [id]/
│       │       ├── route.ts     # GET, PATCH, DELETE
│       │       └── milestones/route.ts
│       ├── conversations/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       └── webhooks/
│           └── supabase/route.ts  # (optional) for triggers
│
├── components/
│   ├── ui/                      # Generic UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── modal.tsx
│   │   ├── progress-bar.tsx
│   │   └── status-badge.tsx
│   │
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   └── mobile-nav.tsx
│   │
│   ├── chat/
│   │   ├── chat-window.tsx
│   │   ├── message-bubble.tsx
│   │   ├── chat-input.tsx
│   │   ├── typing-indicator.tsx
│   │   └── tool-result-card.tsx  # Shows "Goal Created" etc.
│   │
│   ├── goals/
│   │   ├── goal-card.tsx
│   │   ├── goal-list.tsx
│   │   ├── goal-detail.tsx
│   │   ├── milestone-list.tsx
│   │   └── milestone-item.tsx
│   │
│   └── providers/
│       └── auth-provider.tsx
│
├── hooks/
│   ├── use-auth.ts
│   ├── use-goals.ts
│   ├── use-chat.ts
│   └── use-conversations.ts
│
└── supabase/
    ├── migrations/              # SQL migrations
    │   └── 001_initial_schema.sql
    └── seed.sql                 # Optional test data
```

---

## Supabase Database Schema

Run these migrations in Supabase SQL Editor or via CLI.

### Migration: 001_initial_schema.sql

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES (extends Supabase auth.users)
-- ============================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    timezone TEXT DEFAULT 'UTC',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', 'User'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- GOALS
-- ============================================
CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    why TEXT,
    target_date DATE NOT NULL,
    start_date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
    category TEXT CHECK (category IN ('health', 'career', 'finance', 'learning', 'personal', 'relationships', 'other')),
    priority INTEGER DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
    success_criteria JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_goals_status ON goals(status);

-- ============================================
-- MILESTONES
-- ============================================
CREATE TABLE milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    target_date DATE NOT NULL,
    order_index INTEGER NOT NULL,
    status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped')),
    completion_notes TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_milestones_goal_id ON milestones(goal_id);

-- ============================================
-- TASKS (optional sub-items within milestones)
-- ============================================
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date DATE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_milestone_id ON tasks(milestone_id);

-- ============================================
-- CHECK-INS
-- ============================================
CREATE TABLE checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    checkin_type TEXT DEFAULT 'manual' CHECK (checkin_type IN ('manual', 'scheduled', 'chat')),
    user_message TEXT NOT NULL,
    ai_summary TEXT,
    mood_score INTEGER CHECK (mood_score BETWEEN 1 AND 5),
    progress_assessment TEXT CHECK (progress_assessment IN ('on_track', 'ahead', 'behind', 'blocked')),
    milestones_updated JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_checkins_goal_id ON checkins(goal_id);
CREATE INDEX idx_checkins_user_id ON checkins(user_id);

-- ============================================
-- GOAL REVISIONS (audit trail)
-- ============================================
CREATE TABLE goal_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    revision_type TEXT NOT NULL CHECK (revision_type IN (
        'timeline_change', 'scope_change', 'milestone_added', 
        'milestone_removed', 'paused', 'resumed', 'completed', 'abandoned'
    )),
    previous_state JSONB,
    new_state JSONB,
    reason TEXT,
    ai_recommendation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_goal_revisions_goal_id ON goal_revisions(goal_id);

-- ============================================
-- CONVERSATIONS
-- ============================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
    conversation_type TEXT NOT NULL CHECK (conversation_type IN (
        'goal_creation', 'checkin', 'replanning', 'general'
    )),
    title TEXT,
    messages JSONB DEFAULT '[]'::JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_goal_id ON conversations(goal_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see/edit their own
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Goals: users can only see/edit their own
CREATE POLICY "Users can view own goals" ON goals
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own goals" ON goals
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goals" ON goals
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own goals" ON goals
    FOR DELETE USING (auth.uid() = user_id);

-- Milestones: users can access milestones of their goals
CREATE POLICY "Users can view milestones of own goals" ON milestones
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM goals WHERE goals.id = milestones.goal_id AND goals.user_id = auth.uid())
    );
CREATE POLICY "Users can insert milestones to own goals" ON milestones
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM goals WHERE goals.id = milestones.goal_id AND goals.user_id = auth.uid())
    );
CREATE POLICY "Users can update milestones of own goals" ON milestones
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM goals WHERE goals.id = milestones.goal_id AND goals.user_id = auth.uid())
    );
CREATE POLICY "Users can delete milestones of own goals" ON milestones
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM goals WHERE goals.id = milestones.goal_id AND goals.user_id = auth.uid())
    );

-- Tasks: users can access tasks of their milestones
CREATE POLICY "Users can manage tasks of own milestones" ON tasks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM milestones m
            JOIN goals g ON g.id = m.goal_id
            WHERE m.id = tasks.milestone_id AND g.user_id = auth.uid()
        )
    );

-- Checkins: users can only see/create their own
CREATE POLICY "Users can view own checkins" ON checkins
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own checkins" ON checkins
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Goal Revisions: users can view revisions of their goals
CREATE POLICY "Users can view revisions of own goals" ON goal_revisions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM goals WHERE goals.id = goal_revisions.goal_id AND goals.user_id = auth.uid())
    );
CREATE POLICY "Users can insert revisions to own goals" ON goal_revisions
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM goals WHERE goals.id = goal_revisions.goal_id AND goals.user_id = auth.uid())
    );

-- Conversations: users can only see/edit their own
CREATE POLICY "Users can view own conversations" ON conversations
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversations" ON conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations" ON conversations
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversations" ON conversations
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_goals_updated_at
    BEFORE UPDATE ON goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_milestones_updated_at
    BEFORE UPDATE ON milestones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## Environment Variables

### .env.local.example
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Only for server-side, never expose

# Anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Key Code Files

### lib/supabase/client.ts
```typescript
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/lib/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### lib/supabase/server.ts
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/lib/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Handle cookies in Server Components
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Handle cookies in Server Components
          }
        },
      },
    }
  )
}
```

### lib/anthropic/client.ts
```typescript
import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const MODEL = 'claude-sonnet-4-20250514'
export const MAX_TOKENS = 4096
```

### lib/anthropic/tools.ts
```typescript
import { Tool } from '@anthropic-ai/sdk/resources/messages'

export const createGoalTool: Tool = {
  name: 'create_goal',
  description: `Creates a new goal with milestones. Only use when you have gathered sufficient information: a clear title, target date, success criteria, and at least 2 milestones.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'Clear, concise goal title',
      },
      description: {
        type: 'string',
        description: 'Detailed description of what achieving this goal looks like',
      },
      why: {
        type: 'string',
        description: "The user's motivation - why this goal matters to them",
      },
      target_date: {
        type: 'string',
        description: 'Target completion date in YYYY-MM-DD format',
      },
      category: {
        type: 'string',
        enum: ['health', 'career', 'finance', 'learning', 'personal', 'relationships', 'other'],
      },
      success_criteria: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of measurable criteria that define success',
      },
      milestones: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            target_date: { type: 'string' },
          },
          required: ['title', 'target_date'],
        },
        description: 'Ordered list of milestones (minimum 2)',
      },
    },
    required: ['title', 'target_date', 'success_criteria', 'milestones'],
  },
}

export const updateMilestoneTool: Tool = {
  name: 'update_milestone',
  description: "Updates a milestone's status based on user's progress report",
  input_schema: {
    type: 'object' as const,
    properties: {
      milestone_id: {
        type: 'string',
        description: 'UUID of the milestone to update',
      },
      status: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'completed', 'skipped'],
      },
      completion_notes: {
        type: 'string',
        description: 'Notes about the progress or completion',
      },
    },
    required: ['milestone_id', 'status'],
  },
}

export const createCheckinTool: Tool = {
  name: 'create_checkin',
  description: 'Records a check-in for a goal with AI analysis',
  input_schema: {
    type: 'object' as const,
    properties: {
      goal_id: { type: 'string' },
      summary: {
        type: 'string',
        description: "Brief summary of user's progress update",
      },
      progress_assessment: {
        type: 'string',
        enum: ['on_track', 'ahead', 'behind', 'blocked'],
      },
      mood_score: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
        description: "User's apparent confidence level (1=struggling, 5=confident)",
      },
    },
    required: ['goal_id', 'summary', 'progress_assessment'],
  },
}

export const modifyGoalTool: Tool = {
  name: 'modify_goal',
  description: "Modifies an existing goal's timeline, status, or details",
  input_schema: {
    type: 'object' as const,
    properties: {
      goal_id: { type: 'string' },
      changes: {
        type: 'object',
        properties: {
          target_date: { type: 'string' },
          status: { type: 'string', enum: ['active', 'paused', 'completed', 'abandoned'] },
          title: { type: 'string' },
          description: { type: 'string' },
        },
      },
      reason: {
        type: 'string',
        description: 'Why this change is being made',
      },
    },
    required: ['goal_id', 'changes', 'reason'],
  },
}

export const addMilestoneTool: Tool = {
  name: 'add_milestone',
  description: 'Adds a new milestone to an existing goal',
  input_schema: {
    type: 'object' as const,
    properties: {
      goal_id: { type: 'string' },
      milestone: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          target_date: { type: 'string' },
        },
        required: ['title', 'target_date'],
      },
      insert_after_index: {
        type: 'integer',
        description: 'Insert after this position (0-indexed, -1 for beginning)',
      },
    },
    required: ['goal_id', 'milestone'],
  },
}

export const allTools = [
  createGoalTool,
  updateMilestoneTool,
  createCheckinTool,
  modifyGoalTool,
  addMilestoneTool,
]
```

### lib/anthropic/prompts/router.ts
```typescript
export function getRouterPrompt(context: {
  numGoals: number
  recentGoalTitle?: string
  recentGoalDate?: string
  daysSinceCheckin?: number
}) {
  return `You are a routing assistant for a goal-tracking application. Analyze the user's message and classify their intent.

Current context:
- User has ${context.numGoals} active goals
${context.recentGoalTitle ? `- Most recent goal: "${context.recentGoalTitle}" (target: ${context.recentGoalDate})` : '- No active goals yet'}
${context.daysSinceCheckin !== undefined ? `- Last check-in: ${context.daysSinceCheckin} days ago` : ''}

Categories:
- goal_creation: User wants to set a NEW goal or is describing something they want to achieve
- checkin: User is reporting PROGRESS or STATUS on an existing goal  
- goal_modification: User wants to CHANGE, pause, extend, or adjust an existing goal
- question: User is asking for ADVICE or INFORMATION about their goals or goal-setting
- casual: Greetings, thanks, or off-topic conversation

Respond with ONLY a JSON object (no markdown):
{
  "intent": "<category>",
  "confidence": <0.0-1.0>,
  "relevant_goal_id": "<goal_id or null>",
  "reasoning": "<brief explanation>"
}`
}
```

### lib/anthropic/prompts/goal-builder.ts
```typescript
export function getGoalBuilderPrompt(context: {
  userName: string
  timezone: string
  today: string
  existingGoals: string
}) {
  return `You are a supportive goal-setting coach. Help users create meaningful, achievable goals.

User: ${context.userName}
Timezone: ${context.timezone}
Today's date: ${context.today}
Existing goals: ${context.existingGoals || 'None yet'}

Your approach:
1. Listen to what the user wants to achieve
2. Ask clarifying questions to understand:
   - What specifically they want to accomplish
   - Why this matters to them (motivation)
   - When they want to achieve it
   - How they'll know they've succeeded
3. Help make it SMART: Specific, Measurable, Achievable, Relevant, Time-bound
4. Break it into realistic milestones (typically 3-6)
5. Only call create_goal when you have sufficient information

Guidelines:
- Be encouraging but realistic about timelines
- Each milestone should feel like a meaningful checkpoint
- Space milestones appropriately based on goal duration
- Identify potential obstacles early
- Don't create the goal until you understand the "why"

If the user's goal is vague (e.g., "get healthier"), ask what specific outcome they want.
If the timeline seems aggressive, gently explore whether it's realistic.
If this is a duplicate of an existing goal, point that out.`
}
```

### lib/anthropic/prompts/checkin-analyzer.ts
```typescript
export function getCheckinAnalyzerPrompt(context: {
  goalTitle: string
  goalDescription: string
  targetDate: string
  daysRemaining: number
  milestones: Array<{
    id: string
    title: string
    target_date: string
    status: string
    order_index: number
  }>
  recentCheckins: Array<{
    created_at: string
    user_message: string
    progress_assessment: string
  }>
}) {
  const milestonesText = context.milestones
    .sort((a, b) => a.order_index - b.order_index)
    .map((m, i) => `${i + 1}. [${m.status.toUpperCase()}] ${m.title} (due: ${m.target_date}) - ID: ${m.id}`)
    .join('\n')

  const checkinsText = context.recentCheckins.length > 0
    ? context.recentCheckins
        .slice(0, 3)
        .map(c => `- ${c.created_at}: "${c.user_message}" (${c.progress_assessment})`)
        .join('\n')
    : 'No previous check-ins'

  return `You are analyzing a progress check-in for a goal.

Goal: ${context.goalTitle}
Description: ${context.goalDescription || 'No description'}
Target date: ${context.targetDate}
Days remaining: ${context.daysRemaining}

Current milestones:
${milestonesText}

Previous check-ins:
${checkinsText}

Your tasks:
1. Understand what progress the user is reporting
2. Determine which milestone(s) this affects
3. Assess whether they're on track, ahead, behind, or blocked
4. Provide encouraging, actionable feedback
5. If they're struggling, explore what's blocking them and suggest adjustments

Use update_milestone to change milestone status when appropriate.
Use create_checkin to record this check-in with your analysis.

Be supportive but honest. If they're behind, acknowledge it gently and help problem-solve.
Always reference specific milestones by their ID when updating them.`
}
```

### lib/anthropic/orchestrator.ts
```typescript
import { anthropic, MODEL, MAX_TOKENS } from './client'
import { allTools } from './tools'
import { getRouterPrompt } from './prompts/router'
import { getGoalBuilderPrompt } from './prompts/goal-builder'
import { getCheckinAnalyzerPrompt } from './prompts/checkin-analyzer'
import { createClient } from '@/lib/supabase/server'

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

export type RouterResult = {
  intent: 'goal_creation' | 'checkin' | 'goal_modification' | 'question' | 'casual'
  confidence: number
  relevant_goal_id: string | null
  reasoning: string
}

export class GoalAgentOrchestrator {
  private userId: string
  private conversationId: string

  constructor(userId: string, conversationId: string) {
    this.userId = userId
    this.conversationId = conversationId
  }

  async processMessage(
    userMessage: string,
    conversationHistory: Message[]
  ): Promise<{
    response: string
    toolCalls: Array<{ tool: string; input: Record<string, unknown>; result: Record<string, unknown> }>
  }> {
    // 1. Get user context
    const context = await this.getUserContext()

    // 2. Route the message
    const routerResult = await this.routeMessage(userMessage, context)

    // 3. Handle based on intent
    let systemPrompt: string
    let tools = allTools

    switch (routerResult.intent) {
      case 'goal_creation':
        systemPrompt = getGoalBuilderPrompt({
          userName: context.profile?.name || 'there',
          timezone: context.profile?.timezone || 'UTC',
          today: new Date().toISOString().split('T')[0],
          existingGoals: context.goals.map(g => `- ${g.title} (${g.status})`).join('\n'),
        })
        break

      case 'checkin':
        const goal = routerResult.relevant_goal_id
          ? context.goals.find(g => g.id === routerResult.relevant_goal_id)
          : context.goals[0]
        
        if (!goal) {
          return {
            response: "I'd love to help you check in, but I don't see any active goals. Would you like to create one?",
            toolCalls: [],
          }
        }

        const goalDetail = await this.getGoalDetail(goal.id)
        systemPrompt = getCheckinAnalyzerPrompt({
          goalTitle: goal.title,
          goalDescription: goal.description || '',
          targetDate: goal.target_date,
          daysRemaining: Math.ceil(
            (new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          ),
          milestones: goalDetail.milestones,
          recentCheckins: goalDetail.checkins,
        })
        break

      case 'goal_modification':
        systemPrompt = `You are helping the user modify their goal. Be supportive and confirm changes before making them.
        
Current goals:
${context.goals.map(g => `- ${g.title} (ID: ${g.id}, target: ${g.target_date}, status: ${g.status})`).join('\n')}

Use modify_goal or add_milestone tools only after confirming with the user.`
        break

      case 'question':
        systemPrompt = `You are a helpful goal-setting advisor. Answer the user's question about goal-setting, productivity, or their specific goals.

Their current goals:
${context.goals.map(g => `- ${g.title} (${g.status}, target: ${g.target_date})`).join('\n') || 'None yet'}

Be helpful and practical. If relevant, reference their specific goals.`
        tools = [] // No tools needed for questions
        break

      case 'casual':
      default:
        systemPrompt = `You are a friendly goal-tracking assistant. Respond warmly to the user.

Quick context:
- They have ${context.goals.length} active goals
- You can help them create goals, track progress, or answer questions

Keep it brief and friendly. If they seem to want to do something goal-related, offer to help.`
        tools = []
        break
    }

    // 4. Call Claude with the appropriate prompt and tools
    const messages = [
      ...conversationHistory.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: userMessage },
    ]

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
      messages,
    })

    // 5. Process response and handle tool calls
    const toolCalls: Array<{ tool: string; input: Record<string, unknown>; result: Record<string, unknown> }> = []
    let textResponse = ''

    for (const block of response.content) {
      if (block.type === 'text') {
        textResponse += block.text
      } else if (block.type === 'tool_use') {
        const result = await this.executeTool(block.name, block.input as Record<string, unknown>)
        toolCalls.push({
          tool: block.name,
          input: block.input as Record<string, unknown>,
          result,
        })
      }
    }

    // If there were tool calls, get a follow-up response
    if (toolCalls.length > 0 && response.stop_reason === 'tool_use') {
      const toolResults = toolCalls.map(tc => ({
        type: 'tool_result' as const,
        tool_use_id: response.content.find(
          b => b.type === 'tool_use' && b.name === tc.tool
        )?.id || '',
        content: JSON.stringify(tc.result),
      }))

      const followUp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools,
        messages: [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ],
      })

      for (const block of followUp.content) {
        if (block.type === 'text') {
          textResponse += block.text
        }
      }
    }

    return { response: textResponse, toolCalls }
  }

  private async routeMessage(message: string, context: { goals: any[]; profile: any }): Promise<RouterResult> {
    const prompt = getRouterPrompt({
      numGoals: context.goals.length,
      recentGoalTitle: context.goals[0]?.title,
      recentGoalDate: context.goals[0]?.target_date,
    })

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: prompt,
      messages: [{ role: 'user', content: message }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    
    try {
      return JSON.parse(text)
    } catch {
      // Default to goal_creation if parsing fails
      return {
        intent: 'goal_creation',
        confidence: 0.5,
        relevant_goal_id: null,
        reasoning: 'Failed to parse router response',
      }
    }
  }

  private async getUserContext() {
    const supabase = await createClient()
    
    const [profileResult, goalsResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', this.userId).single(),
      supabase.from('goals').select('*').eq('user_id', this.userId).eq('status', 'active'),
    ])

    return {
      profile: profileResult.data,
      goals: goalsResult.data || [],
    }
  }

  private async getGoalDetail(goalId: string) {
    const supabase = await createClient()

    const [milestonesResult, checkinsResult] = await Promise.all([
      supabase.from('milestones').select('*').eq('goal_id', goalId).order('order_index'),
      supabase.from('checkins').select('*').eq('goal_id', goalId).order('created_at', { ascending: false }).limit(5),
    ])

    return {
      milestones: milestonesResult.data || [],
      checkins: checkinsResult.data || [],
    }
  }

  private async executeTool(name: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const supabase = await createClient()

    switch (name) {
      case 'create_goal': {
        const { milestones, ...goalData } = input as any
        
        // Create goal
        const { data: goal, error: goalError } = await supabase
          .from('goals')
          .insert({
            user_id: this.userId,
            title: goalData.title,
            description: goalData.description,
            why: goalData.why,
            target_date: goalData.target_date,
            category: goalData.category,
            success_criteria: goalData.success_criteria,
          })
          .select()
          .single()

        if (goalError) throw goalError

        // Create milestones
        if (milestones && milestones.length > 0) {
          const milestonesData = milestones.map((m: any, i: number) => ({
            goal_id: goal.id,
            title: m.title,
            description: m.description,
            target_date: m.target_date,
            order_index: i,
          }))

          await supabase.from('milestones').insert(milestonesData)
        }

        // Update conversation to link to this goal
        await supabase
          .from('conversations')
          .update({ goal_id: goal.id, conversation_type: 'goal_creation' })
          .eq('id', this.conversationId)

        return { success: true, goal_id: goal.id, message: 'Goal created successfully' }
      }

      case 'update_milestone': {
        const { milestone_id, status, completion_notes } = input as any
        
        const updateData: any = { status }
        if (completion_notes) updateData.completion_notes = completion_notes
        if (status === 'completed') updateData.completed_at = new Date().toISOString()

        const { error } = await supabase
          .from('milestones')
          .update(updateData)
          .eq('id', milestone_id)

        if (error) throw error
        return { success: true, message: 'Milestone updated' }
      }

      case 'create_checkin': {
        const { goal_id, summary, progress_assessment, mood_score } = input as any

        const { data, error } = await supabase
          .from('checkins')
          .insert({
            goal_id,
            user_id: this.userId,
            checkin_type: 'chat',
            user_message: summary,
            ai_summary: summary,
            progress_assessment,
            mood_score,
          })
          .select()
          .single()

        if (error) throw error
        return { success: true, checkin_id: data.id }
      }

      case 'modify_goal': {
        const { goal_id, changes, reason } = input as any

        // Get current state for revision history
        const { data: currentGoal } = await supabase
          .from('goals')
          .select('*')
          .eq('id', goal_id)
          .single()

        // Update goal
        const { error: updateError } = await supabase
          .from('goals')
          .update(changes)
          .eq('id', goal_id)

        if (updateError) throw updateError

        // Record revision
        await supabase.from('goal_revisions').insert({
          goal_id,
          revision_type: changes.target_date ? 'timeline_change' : 'scope_change',
          previous_state: currentGoal,
          new_state: { ...currentGoal, ...changes },
          reason,
        })

        return { success: true, message: 'Goal modified' }
      }

      case 'add_milestone': {
        const { goal_id, milestone, insert_after_index } = input as any

        // Get current max order_index
        const { data: existing } = await supabase
          .from('milestones')
          .select('order_index')
          .eq('goal_id', goal_id)
          .order('order_index', { ascending: false })
          .limit(1)

        const orderIndex = insert_after_index !== undefined
          ? insert_after_index + 1
          : (existing?.[0]?.order_index ?? -1) + 1

        const { data, error } = await supabase
          .from('milestones')
          .insert({
            goal_id,
            title: milestone.title,
            description: milestone.description,
            target_date: milestone.target_date,
            order_index: orderIndex,
          })
          .select()
          .single()

        if (error) throw error
        return { success: true, milestone_id: data.id }
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` }
    }
  }
}
```

### app/api/chat/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoalAgentOrchestrator, Message } from '@/lib/anthropic/orchestrator'
import { v4 as uuid } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { conversation_id, message } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Get or create conversation
    let conversationId = conversation_id
    let conversationHistory: Message[] = []

    if (conversationId) {
      const { data: conversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .single()

      if (conversation) {
        conversationHistory = (conversation.messages as Message[]) || []
      }
    } else {
      // Create new conversation
      const { data: newConversation, error } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          conversation_type: 'general',
          messages: [],
        })
        .select()
        .single()

      if (error) throw error
      conversationId = newConversation.id
    }

    // Create orchestrator and process message
    const orchestrator = new GoalAgentOrchestrator(user.id, conversationId)
    const { response, toolCalls } = await orchestrator.processMessage(
      message,
      conversationHistory
    )

    // Create message objects
    const userMessage: Message = {
      id: uuid(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }

    const assistantMessage: Message = {
      id: uuid(),
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    }

    // Update conversation with new messages
    const updatedMessages = [...conversationHistory, userMessage, assistantMessage]

    await supabase
      .from('conversations')
      .update({ messages: updatedMessages })
      .eq('id', conversationId)

    return NextResponse.json({
      conversation_id: conversationId,
      message: assistantMessage,
      tool_calls: toolCalls,
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

---

## Frontend Components

### components/chat/chat-window.tsx
```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageBubble } from './message-bubble'
import { ChatInput } from './chat-input'
import { TypingIndicator } from './typing-indicator'
import { ToolResultCard } from './tool-result-card'
import type { Message } from '@/lib/types'

interface ChatWindowProps {
  conversationId?: string
  initialMessages?: Message[]
}

export function ChatWindow({ conversationId: initialConversationId, initialMessages = [] }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState(initialConversationId)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async (content: string) => {
    // Optimistically add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: content,
        }),
      })

      if (!response.ok) throw new Error('Failed to send message')

      const data = await response.json()
      
      setConversationId(data.conversation_id)
      setMessages(prev => [...prev, data.message])
    } catch (error) {
      console.error('Error sending message:', error)
      // Show error state
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg font-medium">Welcome! 👋</p>
            <p className="mt-2">
              I'm your goal coach. Tell me what you'd like to achieve, 
              or check in on your progress.
            </p>
          </div>
        )}
        
        {messages.map((message) => (
          <div key={message.id}>
            <MessageBubble message={message} />
            {message.tool_calls?.map((tc, i) => (
              <ToolResultCard key={i} toolCall={tc} />
            ))}
          </div>
        ))}
        
        {isLoading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t p-4">
        <ChatInput onSend={sendMessage} disabled={isLoading} />
      </div>
    </div>
  )
}
```

### components/chat/message-bubble.tsx
```tsx
import { cn } from '@/lib/utils'
import type { Message } from '@/lib/types'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-2',
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-900'
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        <p className={cn(
          'text-xs mt-1',
          isUser ? 'text-blue-200' : 'text-gray-500'
        )}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  )
}
```

### components/chat/tool-result-card.tsx
```tsx
interface ToolResultCardProps {
  toolCall: {
    tool: string
    input: Record<string, unknown>
    result: Record<string, unknown>
  }
}

export function ToolResultCard({ toolCall }: ToolResultCardProps) {
  const getToolDisplay = () => {
    switch (toolCall.tool) {
      case 'create_goal':
        return {
          icon: '🎯',
          title: 'Goal Created',
          description: toolCall.input.title as string,
        }
      case 'update_milestone':
        return {
          icon: '✓',
          title: 'Milestone Updated',
          description: `Status: ${toolCall.input.status}`,
        }
      case 'create_checkin':
        return {
          icon: '📝',
          title: 'Check-in Recorded',
          description: `Progress: ${toolCall.input.progress_assessment}`,
        }
      case 'modify_goal':
        return {
          icon: '✏️',
          title: 'Goal Modified',
          description: toolCall.input.reason as string,
        }
      default:
        return {
          icon: '⚙️',
          title: toolCall.tool,
          description: 'Action completed',
        }
    }
  }

  const display = getToolDisplay()

  return (
    <div className="ml-4 mt-2 p-3 bg-green-50 border border-green-200 rounded-lg max-w-[80%]">
      <div className="flex items-center gap-2">
        <span className="text-xl">{display.icon}</span>
        <div>
          <p className="font-medium text-green-800">{display.title}</p>
          <p className="text-sm text-green-600">{display.description}</p>
        </div>
      </div>
    </div>
  )
}
```

### components/goals/goal-card.tsx
```tsx
import Link from 'next/link'
import { ProgressBar } from '../ui/progress-bar'
import { StatusBadge } from '../ui/status-badge'

interface GoalCardProps {
  goal: {
    id: string
    title: string
    target_date: string
    status: string
    category?: string
    milestones?: { status: string }[]
  }
}

export function GoalCard({ goal }: GoalCardProps) {
  const completedMilestones = goal.milestones?.filter(m => m.status === 'completed').length || 0
  const totalMilestones = goal.milestones?.length || 1
  const progress = Math.round((completedMilestones / totalMilestones) * 100)

  const daysRemaining = Math.ceil(
    (new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )

  return (
    <Link href={`/goals/${goal.id}`}>
      <div className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold text-lg">{goal.title}</h3>
          <StatusBadge status={goal.status} />
        </div>
        
        <ProgressBar value={progress} className="mb-2" />
        
        <div className="flex justify-between text-sm text-gray-500">
          <span>{completedMilestones}/{totalMilestones} milestones</span>
          <span>
            {daysRemaining > 0 
              ? `${daysRemaining} days left`
              : daysRemaining === 0 
                ? 'Due today'
                : `${Math.abs(daysRemaining)} days overdue`
            }
          </span>
        </div>
      </div>
    </Link>
  )
}
```

---

## Implementation Order

### Phase 1: Setup (Day 1)
1. Create Next.js project with TypeScript and Tailwind
2. Set up Supabase project
3. Run database migration
4. Configure environment variables
5. Set up Supabase auth helpers
6. Create basic layout with sidebar

### Phase 2: Auth & Basic Pages (Day 1-2)
1. Login page with Supabase Auth
2. Register page
3. Auth middleware
4. Dashboard page (empty state)
5. Basic navigation

### Phase 3: Goals CRUD (Day 2)
1. Goals list page with data fetching
2. Goal detail page
3. Manual goal creation form (backup, non-AI)
4. Milestone display
5. GoalCard and MilestoneItem components

### Phase 4: Chat & AI Integration (Day 2-3)
1. Set up Anthropic client
2. Implement router prompt
3. Implement goal builder prompt
4. Create orchestrator
5. Chat API route
6. ChatWindow component
7. Test goal creation through chat

### Phase 5: Check-ins & Polish (Day 3-4)
1. Check-in analyzer prompt
2. Tool execution for milestone updates
3. Check-in history display
4. Progress visualization
5. Error handling and loading states
6. Mobile responsiveness

---

## Commands to Get Started

```bash
# Create project
npx create-next-app@latest goal-agent --typescript --tailwind --eslint --app --src-dir=false

# Install dependencies
cd goal-agent
npm install @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk uuid
npm install -D @types/uuid

# Create Supabase project at supabase.com, then:
# 1. Copy project URL and anon key to .env.local
# 2. Run the migration SQL in Supabase SQL Editor
# 3. Enable email auth in Supabase Dashboard > Auth

# Run development server
npm run dev
```

---

## Debugging Tips

### Supabase Dashboard
- Go to your project > Table Editor to see all data
- Use SQL Editor to run queries
- Check Auth > Users for registered accounts
- View Logs > Postgres for query logs

### LLM Debugging
- Add console.log in orchestrator.ts to see prompts and responses
- Check browser Network tab for /api/chat requests
- Store LLM responses in a debug table during development

### Common Issues
- "No user" error: Check Supabase auth setup, cookies
- Tool not executing: Verify tool JSON schema matches
- RLS blocking queries: Check policies in Supabase

---

## Success Criteria

The MVP is complete when:
1. ✅ User can register and login via Supabase Auth
2. ✅ User can create a goal through chat conversation
3. ✅ AI asks clarifying questions before creating goal
4. ✅ Goal appears in dashboard with milestones
5. ✅ User can view goal details
6. ✅ User can record check-in through chat
7. ✅ AI updates milestone status based on check-in
8. ✅ All data visible in Supabase Dashboard
9. ✅ System handles errors gracefully

---

## Future Enhancements (Post-MVP)
- Scheduled email reminders (Supabase Edge Functions + Resend)
- Real-time updates (Supabase Realtime)
- Calendar view of milestones
- Goal templates
- Share goals with accountability partners
- Analytics dashboard
- Mobile app (React Native or Expo)
