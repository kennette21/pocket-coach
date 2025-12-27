import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoalAgentOrchestrator } from '@/lib/anthropic/orchestrator'
import { v4 as uuid } from 'uuid'
import type { Message } from '@/lib/types'

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

    // Debug logging
    console.log('=== CHAT API DEBUG ===')
    console.log('User message:', message)
    console.log('Tool calls made:', toolCalls.length)
    toolCalls.forEach((tc, i) => {
      console.log(`Tool ${i + 1}:`, tc.tool, JSON.stringify(tc.result))
    })
    console.log('======================')

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
