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

## Current Goal Context
Goal: ${context.goalTitle}
Description: ${context.goalDescription || 'No description'}
Target date: ${context.targetDate}
Days remaining: ${context.daysRemaining}

## Milestones (use these IDs when updating):
${milestonesText}

## Recent Check-ins:
${checkinsText}

## YOUR ACTIONS - Do these IMMEDIATELY:

1. **ALWAYS call create_checkin** - Record every progress update the user shares
   - Summarize what they reported
   - Assess: on_track, ahead, behind, or blocked
   - Estimate their mood/confidence (1-5)

2. **Call update_milestone when progress warrants it:**
   - User completed something → mark relevant milestone "completed"
   - User started working on something → mark it "in_progress"
   - User mentions skipping something → mark it "skipped"
   - Be generous with progress - if they're making effort, update the status

3. **Respond with encouragement and next steps**

## Examples of when to update milestones:
- "I ran 5 miles today" → If there's a running milestone, mark in_progress or completed
- "I finished the first chapter" → Mark that milestone completed
- "I've been going to the gym 3x/week" → Mark gym-related milestone in_progress or completed

## Important
- Don't ask too many questions. Act on what they tell you.
- Celebrate wins, no matter how small.
- If behind schedule, be supportive and help problem-solve.
- Reference the specific milestone IDs when calling update_milestone.`
}
