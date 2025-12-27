'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageBubble } from './message-bubble'
import { ChatInput } from './chat-input'
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
      // Add error message
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-700 mt-8">
            <p className="text-lg font-semibold text-gray-900">Welcome!</p>
            <p className="mt-2">
              I&apos;m your goal coach. Tell me what you&apos;d like to achieve,
              or check in on your progress.
            </p>
            <p className="mt-4 text-sm text-gray-600">
              Try: &quot;I want to run a marathon in 6 months&quot;
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

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <div className="flex space-x-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t p-4 bg-white">
        <ChatInput onSend={sendMessage} disabled={isLoading} />
      </div>
    </div>
  )
}
