import { anthropic, MODEL, MAX_TOKENS } from './client'
import { allTools } from './tools'
import { getRouterPrompt } from './prompts/router'
import { getGoalBuilderPrompt } from './prompts/goal-builder'
import { getCheckinAnalyzerPrompt } from './prompts/checkin-analyzer'
import { createClient } from '@/lib/supabase/server'
import type { Message } from '@/lib/types'

export type RouterResult = {
  intent: 'goal_creation' | 'checkin' | 'goal_modification' | 'question' | 'casual'
  confidence: number
  relevant_goal_id: string | null
  reasoning: string
}

type ToolCall = {
  tool: string
  input: Record<string, unknown>
  result: Record<string, unknown>
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
    toolCalls: ToolCall[]
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
        tools = []
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
    const toolCalls: ToolCall[] = []
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
      const toolResults = response.content
        .filter(b => b.type === 'tool_use')
        .map((block, index) => ({
          type: 'tool_result' as const,
          tool_use_id: block.type === 'tool_use' ? block.id : '',
          content: JSON.stringify(toolCalls[index]?.result || { error: 'No result' }),
        }))

      const followUp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools,
        messages: [
          ...messages,
          { role: 'assistant' as const, content: response.content },
          { role: 'user' as const, content: toolResults },
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

  private async routeMessage(
    message: string,
    context: { goals: Array<{ id: string; title: string; target_date: string; status: string }>; profile: { name: string; timezone: string } | null }
  ): Promise<RouterResult> {
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
      profile: profileResult.data as { name: string; timezone: string } | null,
      goals: (goalsResult.data || []) as Array<{
        id: string
        title: string
        description: string | null
        target_date: string
        status: string
      }>,
    }
  }

  private async getGoalDetail(goalId: string) {
    const supabase = await createClient()

    const [milestonesResult, checkinsResult] = await Promise.all([
      supabase.from('milestones').select('*').eq('goal_id', goalId).order('order_index'),
      supabase.from('checkins').select('*').eq('goal_id', goalId).order('created_at', { ascending: false }).limit(5),
    ])

    return {
      milestones: (milestonesResult.data || []) as Array<{
        id: string
        title: string
        target_date: string
        status: string
        order_index: number
      }>,
      checkins: (checkinsResult.data || []) as Array<{
        created_at: string
        user_message: string
        progress_assessment: string
      }>,
    }
  }

  private async executeTool(name: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const supabase = await createClient()

    switch (name) {
      case 'create_goal': {
        const { milestones, ...goalData } = input as {
          title: string
          description?: string
          why?: string
          target_date: string
          category?: string
          success_criteria?: string[]
          milestones: Array<{ title: string; description?: string; target_date: string }>
        }

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
            success_criteria: goalData.success_criteria || [],
          })
          .select()
          .single()

        if (goalError) throw goalError

        // Create milestones
        if (milestones && milestones.length > 0) {
          const milestonesData = milestones.map((m, i) => ({
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
        const { milestone_id, status, completion_notes } = input as {
          milestone_id: string
          status: string
          completion_notes?: string
        }

        const updateData: Record<string, unknown> = { status }
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
        const { goal_id, summary, progress_assessment, mood_score } = input as {
          goal_id: string
          summary: string
          progress_assessment: string
          mood_score?: number
        }

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
        const { goal_id, changes, reason } = input as {
          goal_id: string
          changes: Record<string, unknown>
          reason: string
        }

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
        const { goal_id, milestone, insert_after_index } = input as {
          goal_id: string
          milestone: { title: string; description?: string; target_date: string }
          insert_after_index?: number
        }

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
