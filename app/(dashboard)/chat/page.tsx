import { ChatWindow } from '@/components/chat/chat-window'

export default function ChatPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="p-4 border-b bg-white">
        <h1 className="text-xl font-semibold">Chat with Goal Coach</h1>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatWindow />
      </div>
    </div>
  )
}
