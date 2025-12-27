'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Goal } from '@/lib/types'

export default function DashboardPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchGoals() {
      const { data } = await supabase
        .from('goals')
        .select('*, milestones(*)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(5)

      setGoals((data as Goal[]) || [])
      setLoading(false)
    }
    fetchGoals()
  }, [supabase])

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link
          href="/chat"
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          New Goal
        </Link>
      </div>

      <div className="grid gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="flex gap-4">
            <Link
              href="/chat"
              className="flex-1 bg-blue-50 text-blue-700 p-4 rounded-lg text-center hover:bg-blue-100 transition-colors"
            >
              <div className="text-2xl mb-2">+</div>
              <div className="font-medium">Create Goal</div>
            </Link>
            <Link
              href="/chat"
              className="flex-1 bg-green-50 text-green-700 p-4 rounded-lg text-center hover:bg-green-100 transition-colors"
            >
              <div className="text-2xl mb-2">~</div>
              <div className="font-medium">Check In</div>
            </Link>
            <Link
              href="/goals"
              className="flex-1 bg-purple-50 text-purple-700 p-4 rounded-lg text-center hover:bg-purple-100 transition-colors"
            >
              <div className="text-2xl mb-2">&#8801;</div>
              <div className="font-medium">View All Goals</div>
            </Link>
          </div>
        </div>

        {/* Active Goals */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Active Goals</h2>
            <Link href="/goals" className="text-blue-600 hover:underline text-sm">
              View all
            </Link>
          </div>

          {loading ? (
            <div className="text-gray-600">Loading...</div>
          ) : goals.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <p className="mb-4">No goals yet. Start by creating your first goal!</p>
              <Link
                href="/chat"
                className="text-blue-600 hover:underline"
              >
                Create a goal
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {goals.map((goal) => {
                const completedMilestones = goal.milestones?.filter(m => m.status === 'completed').length || 0
                const totalMilestones = goal.milestones?.length || 1
                const progress = Math.round((completedMilestones / totalMilestones) * 100)

                return (
                  <Link
                    key={goal.id}
                    href={`/goals/${goal.id}`}
                    className="block border rounded-lg p-4 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-medium">{goal.title}</h3>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {goal.status}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>{completedMilestones}/{totalMilestones} milestones</span>
                      <span>Due: {new Date(goal.target_date).toLocaleDateString()}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
