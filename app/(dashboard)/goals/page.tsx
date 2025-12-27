'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Goal } from '@/lib/types'

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
  const supabase = createClient()

  useEffect(() => {
    async function fetchGoals() {
      let query = supabase
        .from('goals')
        .select('*, milestones(*)')
        .order('created_at', { ascending: false })

      if (filter === 'active') {
        query = query.eq('status', 'active')
      } else if (filter === 'completed') {
        query = query.eq('status', 'completed')
      }

      const { data } = await query
      setGoals((data as Goal[]) || [])
      setLoading(false)
    }
    fetchGoals()
  }, [supabase, filter])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-blue-100 text-blue-800'
      case 'completed': return 'bg-green-100 text-green-800'
      case 'paused': return 'bg-yellow-100 text-yellow-800'
      case 'abandoned': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Goals</h1>
        <Link
          href="/chat"
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          New Goal
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'active', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-md capitalize ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-600">Loading...</div>
      ) : goals.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-600 mb-4">
            {filter === 'all'
              ? 'No goals yet. Create your first goal!'
              : `No ${filter} goals.`
            }
          </p>
          {filter === 'all' && (
            <Link
              href="/chat"
              className="text-blue-600 hover:underline"
            >
              Create a goal
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => {
            const completedMilestones = goal.milestones?.filter(m => m.status === 'completed').length || 0
            const totalMilestones = goal.milestones?.length || 1
            const progress = Math.round((completedMilestones / totalMilestones) * 100)
            const daysRemaining = Math.ceil(
              (new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            )

            return (
              <Link
                key={goal.id}
                href={`/goals/${goal.id}`}
                className="block bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold text-lg pr-2">{goal.title}</h3>
                  <span className={`text-xs px-2 py-1 rounded ${getStatusColor(goal.status)}`}>
                    {goal.status}
                  </span>
                </div>

                {goal.category && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded mb-3 inline-block capitalize">
                    {goal.category}
                  </span>
                )}

                <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="flex justify-between text-sm text-gray-600">
                  <span>{completedMilestones}/{totalMilestones} milestones</span>
                  <span className={daysRemaining < 0 ? 'text-red-600' : ''}>
                    {daysRemaining > 0
                      ? `${daysRemaining} days left`
                      : daysRemaining === 0
                        ? 'Due today'
                        : `${Math.abs(daysRemaining)} days overdue`
                    }
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
