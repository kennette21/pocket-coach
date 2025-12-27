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
          icon: '+',
          title: 'Goal Created',
          description: toolCall.input.title as string,
          color: 'green',
        }
      case 'update_milestone':
        return {
          icon: '~',
          title: 'Milestone Updated',
          description: `Status: ${toolCall.input.status}`,
          color: 'blue',
        }
      case 'create_checkin':
        return {
          icon: '!',
          title: 'Check-in Recorded',
          description: `Progress: ${toolCall.input.progress_assessment}`,
          color: 'purple',
        }
      case 'modify_goal':
        return {
          icon: '*',
          title: 'Goal Modified',
          description: toolCall.input.reason as string,
          color: 'orange',
        }
      default:
        return {
          icon: '#',
          title: toolCall.tool,
          description: 'Action completed',
          color: 'gray',
        }
    }
  }

  const display = getToolDisplay()
  const colorClasses = {
    green: 'bg-green-50 border-green-200 text-green-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
    gray: 'bg-gray-50 border-gray-200 text-gray-800',
  }

  return (
    <div className={`ml-4 mt-2 p-3 border rounded-lg max-w-[80%] ${colorClasses[display.color as keyof typeof colorClasses]}`}>
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold">{display.icon}</span>
        <div>
          <p className="font-medium">{display.title}</p>
          <p className="text-sm opacity-80">{display.description}</p>
        </div>
      </div>
    </div>
  )
}
