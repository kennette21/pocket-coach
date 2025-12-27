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

    // 2. Route the message (with conversation context)
    const lastAssistantMessage = conversationHistory
      .filter(m => m.role === 'assistant')
      .slice(-1)[0]?.content

    const routerResult = await this.routeMessage(userMessage, context, lastAssistantMessage)
    console.log(`[Orchestrator] Router result:`, JSON.stringify(routerResult))

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

      case 'question': {
        // Load full goal details for questions about progress
        let goalsWithDetails = ''
        for (const goal of context.goals) {
          const detail = await this.getGoalDetail(goal.id)
          const completedMilestones = detail.milestones.filter(m => m.status === 'completed').length
          const totalMilestones = detail.milestones.length
          const progressPct = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0

          goalsWithDetails += `\n## ${goal.title}
- Status: ${goal.status}
- Target: ${goal.target_date}
- Progress: ${progressPct}% (${completedMilestones}/${totalMilestones} milestones)
- Milestones:
${detail.milestones.map(m => `  - [${m.status.toUpperCase()}] ${m.title} (due: ${m.target_date})${m.completion_notes ? ` - Note: ${m.completion_notes}` : ''}`).join('\n')}
`
        }

        systemPrompt = `You are a helpful goal-setting advisor with FULL ACCESS to the user's goals and progress.

## User's Goals and Progress:
${goalsWithDetails || 'No goals yet'}

You can see all their goals, milestones, and completion status. Use this information to:
- Answer questions about their progress accurately
- Celebrate completed milestones
- Point out what's coming up next
- Help them stay on track

Be specific - reference their actual milestones and completion status.`
        tools = []
        break
      }

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

    // 4. Build conversation messages
    const messages: Array<{ role: 'user' | 'assistant'; content: string | Array<unknown> }> = [
      ...conversationHistory.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: userMessage },
    ]

    // 5. Run conversation loop with tool handling
    const allToolCalls: ToolCall[] = []
    let textResponse = ''
    let currentMessages = [...messages]
    let iterations = 0
    const maxIterations = 5 // Prevent infinite loops

    while (iterations < maxIterations) {
      iterations++

      console.log(`[Orchestrator] Iteration ${iterations}, sending ${currentMessages.length} messages`)

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
        messages: currentMessages as Parameters<typeof anthropic.messages.create>[0]['messages'],
      })

      console.log(`[Orchestrator] Response stop_reason: ${response.stop_reason}`)
      console.log(`[Orchestrator] Response content blocks: ${response.content.length}`)

      // Collect text and tool uses from response
      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

      for (const block of response.content) {
        if (block.type === 'text') {
          textResponse += block.text
        } else if (block.type === 'tool_use') {
          console.log(`[Orchestrator] Tool use detected: ${block.name}`)
          toolUseBlocks.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          })
        }
      }

      // If no tool calls or stop reason is not tool_use, we're done
      if (toolUseBlocks.length === 0 || response.stop_reason !== 'tool_use') {
        break
      }

      // Execute all tools and collect results
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []

      for (const toolUse of toolUseBlocks) {
        try {
          const result = await this.executeTool(toolUse.name, toolUse.input)
          allToolCalls.push({
            tool: toolUse.name,
            input: toolUse.input,
            result,
          })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          })
        } catch (error) {
          const errorResult = { success: false, error: String(error) }
          allToolCalls.push({
            tool: toolUse.name,
            input: toolUse.input,
            result: errorResult,
          })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(errorResult),
          })
        }
      }

      // Add assistant response and tool results to messages for next iteration
      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: response.content as Array<unknown> },
        { role: 'user' as const, content: toolResults as Array<unknown> },
      ]
    }

    return { response: textResponse, toolCalls: allToolCalls }
  }

  private async routeMessage(
    message: string,
    context: { goals: Array<{ id: string; title: string; target_date: string; status: string }>; profile: { name: string; timezone: string } | null },
    lastAssistantMessage?: string
  ): Promise<RouterResult> {
    const prompt = getRouterPrompt({
      numGoals: context.goals.length,
      recentGoalTitle: context.goals[0]?.title,
      recentGoalDate: context.goals[0]?.target_date,
      lastAssistantMessage,
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
        completion_notes: string | null
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
