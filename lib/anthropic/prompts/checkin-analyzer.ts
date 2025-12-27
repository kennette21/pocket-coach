export function getCheckinAnalyzerPrompt(context: {
  goalTitle: string
  goalDescription: string
  targetDate: string
  daysRemaining: number
  milestones: Array<{
    id: string
    title: string
    target_date: string
    status: string
    order_index: number
  }>
  recentCheckins: Array<{
    created_at: string
    user_message: string
    progress_assessment: string
  }>
}) {
  const milestonesText = context.milestones
    .sort((a, b) => a.order_index - b.order_index)
    .map((m, i) => `${i + 1}. [${m.status.toUpperCase()}] ${m.title} (due: ${m.target_date}) - ID: ${m.id}`)
    .join('\n')

  const checkinsText = context.recentCheckins.length > 0
    ? context.recentCheckins
        .slice(0, 3)
        .map(c => `- ${c.created_at}: "${c.user_message}" (${c.progress_assessment})`)
        .join('\n')
    : 'No previous check-ins'

  return `You are analyzing a progress check-in for a goal.

Goal: ${context.goalTitle}
Description: ${context.goalDescription || 'No description'}
Target date: ${context.targetDate}
Days remaining: ${context.daysRemaining}

Current milestones:
${milestonesText}

Previous check-ins:
${checkinsText}

Your tasks:
1. Understand what progress the user is reporting
2. Determine which milestone(s) this affects
3. Assess whether they're on track, ahead, behind, or blocked
4. Provide encouraging, actionable feedback
5. If they're struggling, explore what's blocking them and suggest adjustments

Use update_milestone to change milestone status when appropriate.
Use create_checkin to record this check-in with your analysis.

Be supportive but honest. If they're behind, acknowledge it gently and help problem-solve.
Always reference specific milestones by their ID when updating them.`
}
