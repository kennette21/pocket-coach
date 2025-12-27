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
