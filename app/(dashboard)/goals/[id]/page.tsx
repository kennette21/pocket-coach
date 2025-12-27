'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Goal, Milestone, Checkin } from '@/lib/types'

type GoalWithRelations = Goal & {
  milestones: Milestone[]
  checkins: Checkin[]
}

export default function GoalDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [goal, setGoal] = useState<GoalWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchGoal() {
      const { data } = await supabase
        .from('goals')
        .select('*, milestones(*), checkins(*)')
        .eq('id', params.id)
        .single()

      if (data) {
        // Sort milestones by order_index
        data.milestones = data.milestones?.sort(
          (a: Milestone, b: Milestone) => a.order_index - b.order_index
        ) || []
        // Sort checkins by created_at descending
        data.checkins = data.checkins?.sort(
          (a: Checkin, b: Checkin) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ) || []
      }

      setGoal(data as GoalWithRelations)
      setLoading(false)
    }
    fetchGoal()
  }, [supabase, params.id])

  const handleStatusChange = async (status: string) => {
    if (!goal) return

    await supabase
      .from('goals')
      .update({ status })
      .eq('id', goal.id)

    setGoal({ ...goal, status: status as Goal['status'] })
  }

  const handleMilestoneToggle = async (milestone: Milestone) => {
    const newStatus = milestone.status === 'completed' ? 'not_started' : 'completed'

    await supabase
      .from('milestones')
      .update({
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null
      })
      .eq('id', milestone.id)

    setGoal({
      ...goal!,
      milestones: goal!.milestones.map(m =>
        m.id === milestone.id ? { ...m, status: newStatus } : m
      ),
    })
  }

  const handleDelete = async () => {
    if (!goal || !confirm('Are you sure you want to delete this goal?')) return

    await supabase.from('goals').delete().eq('id', goal.id)
    router.push('/goals')
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!goal) {
    return (
      <div className="p-8">
        <div className="text-gray-600">Goal not found</div>
        <Link href="/goals" className="text-blue-600 hover:underline mt-2 inline-block">
          Back to goals
        </Link>
      </div>
    )
  }

  const completedMilestones = goal.milestones.filter(m => m.status === 'completed').length
  const totalMilestones = goal.milestones.length || 1
  const progress = Math.round((completedMilestones / totalMilestones) * 100)
  const daysRemaining = Math.ceil(
    (new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-blue-100 text-blue-800'
      case 'completed': return 'bg-green-100 text-green-800'
      case 'paused': return 'bg-yellow-100 text-yellow-800'
      case 'abandoned': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getMilestoneStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500'
      case 'in_progress': return 'bg-blue-500'
      case 'skipped': return 'bg-gray-400'
      default: return 'bg-gray-300'
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/goals" className="text-blue-600 hover:underline mb-4 inline-block">
        &larr; Back to goals
      </Link>

      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold mb-2">{goal.title}</h1>
            {goal.category && (
              <span className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded capitalize">
                {goal.category}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <select
              value={goal.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`text-sm px-3 py-1 rounded border-0 ${getStatusColor(goal.status)}`}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="abandoned">Abandoned</option>
            </select>
            <button
              onClick={handleDelete}
              className="text-sm px-3 py-1 text-red-600 hover:bg-red-50 rounded"
            >
              Delete
            </button>
          </div>
        </div>

        {goal.description && (
          <p className="text-gray-700 mb-4">{goal.description}</p>
        )}

        {goal.why && (
          <div className="bg-blue-50 p-3 rounded mb-4">
            <p className="text-sm text-blue-800">
              <strong>Why:</strong> {goal.why}
            </p>
          </div>
        )}

        <div className="flex gap-8 text-sm text-gray-700 mb-4">
          <div>
            <strong>Start:</strong> {new Date(goal.start_date).toLocaleDateString()}
          </div>
          <div>
            <strong>Target:</strong> {new Date(goal.target_date).toLocaleDateString()}
          </div>
          <div className={daysRemaining < 0 ? 'text-red-600' : ''}>
            <strong>Remaining:</strong>{' '}
            {daysRemaining > 0
              ? `${daysRemaining} days`
              : daysRemaining === 0
                ? 'Due today'
                : `${Math.abs(daysRemaining)} days overdue`
            }
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-600 mt-1">{progress}% complete</p>
      </div>

      {/* Success Criteria */}
      {goal.success_criteria && goal.success_criteria.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Success Criteria</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {goal.success_criteria.map((criterion, i) => (
              <li key={i}>{criterion}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Milestones */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            Milestones ({completedMilestones}/{totalMilestones})
          </h2>
          <Link
            href="/chat"
            className="text-sm text-blue-600 hover:underline"
          >
            + Add via chat
          </Link>
        </div>

        {goal.milestones.length === 0 ? (
          <p className="text-gray-600">No milestones yet</p>
        ) : (
          <div className="space-y-3">
            {goal.milestones.map((milestone, index) => (
              <div
                key={milestone.id}
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50"
              >
                <button
                  onClick={() => handleMilestoneToggle(milestone)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-sm ${getMilestoneStatusColor(milestone.status)}`}
                >
                  {milestone.status === 'completed' ? '✓' : index + 1}
                </button>
                <div className="flex-1">
                  <div className="flex justify-between">
                    <h3 className={`font-medium ${milestone.status === 'completed' ? 'line-through text-gray-400' : ''}`}>
                      {milestone.title}
                    </h3>
                    <span className="text-sm text-gray-600">
                      Due: {new Date(milestone.target_date).toLocaleDateString()}
                    </span>
                  </div>
                  {milestone.description && (
                    <p className="text-sm text-gray-700 mt-1">{milestone.description}</p>
                  )}
                  {milestone.completion_notes && (
                    <p className="text-sm text-green-600 mt-1">Note: {milestone.completion_notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Check-ins */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Recent Check-ins</h2>
          <Link
            href="/chat"
            className="text-sm text-blue-600 hover:underline"
          >
            + New check-in
          </Link>
        </div>

        {goal.checkins.length === 0 ? (
          <p className="text-gray-600">No check-ins yet. Chat with your coach to log progress!</p>
        ) : (
          <div className="space-y-3">
            {goal.checkins.slice(0, 5).map((checkin) => (
              <div key={checkin.id} className="border-l-4 border-blue-400 pl-4 py-2">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>{new Date(checkin.created_at).toLocaleDateString()}</span>
                  {checkin.progress_assessment && (
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      checkin.progress_assessment === 'on_track' ? 'bg-green-100 text-green-800' :
                      checkin.progress_assessment === 'ahead' ? 'bg-blue-100 text-blue-800' :
                      checkin.progress_assessment === 'behind' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {checkin.progress_assessment.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <p className="text-gray-800">{checkin.user_message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat CTA */}
      <div className="bg-blue-50 rounded-lg p-6 text-center">
        <p className="text-blue-800 mb-3">Need to update your progress or adjust your plan?</p>
        <Link
          href="/chat"
          className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
        >
          Chat with Coach
        </Link>
      </div>
    </div>
  )
}
