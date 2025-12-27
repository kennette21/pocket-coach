# Goal Agent - Project Brief

## What We're Building

A web app where you chat with an AI coach to set and track goals. The AI helps you:
- Define clear, achievable goals with milestones
- Check in on progress through conversation
- Adjust plans when life gets in the way

Think of it as a smart goal journal that talks back.

---

## Hard Requirements

### Tech Stack (non-negotiable)
- **Frontend:** Next.js with TypeScript
- **Database & Auth:** Supabase (Postgres + Auth)
- **AI:** Anthropic Claude API (claude-sonnet-4-20250514)
- **Styling:** Tailwind CSS (or similar utility framework)

### Must-Have Features for MVP
1. User can sign up / log in
2. User can chat with AI to create a goal
3. AI asks questions to make the goal specific and creates milestones
4. Goals and milestones are saved to database
5. User can see their goals in a simple UI (list view, detail view)
6. User can chat to check in on progress
7. AI can update milestone status based on check-ins

### Environment
- Supabase project credentials will be in `.env.local`
- Anthropic API key will be in `.env.local`
- Should run locally with `npm run dev`

---

## The Core Concept: How the AI Works

This is the key architectural idea. The AI needs to do different things based on what the user says:

```
User message
    ↓
[Router] → What does the user want?
    ↓
    ├── "Create a goal" → Goal Builder conversation
    ├── "Check in / update" → Progress Analyzer  
    ├── "Change my goal" → Replanning conversation
    └── "Just chatting" → Casual response
```

### The Router
First, classify the user's intent. This can be a simple Claude call that returns a category.

### Goal Builder Flow
When creating a goal:
1. Ask clarifying questions (what specifically? why? by when?)
2. Help make it SMART (Specific, Measurable, Achievable, Relevant, Time-bound)
3. Generate appropriate milestones
4. Only save to database when you have enough info

### Check-in Flow  
When user reports progress:
1. Understand what they're telling you
2. Figure out which milestone(s) this affects
3. Update the database
4. Give encouragement or help problem-solve

### How Claude Writes to the Database
Use Claude's "tool use" feature. Define tools like:
- `create_goal` - saves a new goal with milestones
- `update_milestone` - changes milestone status
- `record_checkin` - logs a check-in

When Claude decides to use a tool, your code executes it against Supabase.

---

## Data Model

Keep it simple. You need:

**Users** (handled by Supabase Auth, just add a profiles table for extra fields)

**Goals**
- id, user_id, title, description, target_date, status
- Optional: why (motivation), category, success_criteria

**Milestones**  
- id, goal_id, title, target_date, status, order
- Status: not_started, in_progress, completed, skipped

**Conversations**
- id, user_id, goal_id (nullable), messages (JSON array)
- Store chat history so context persists

**Check-ins** (optional but nice)
- id, goal_id, user_message, ai_summary, progress_assessment, created_at

Don't forget Row Level Security in Supabase so users only see their own data.

---

## UI Pages

Minimal UI is fine. We need:

1. **Login / Register** - Use Supabase Auth UI or build simple forms
2. **Dashboard** - List of user's goals with progress indicators
3. **Goal Detail** - Single goal with its milestones and status
4. **Chat** - The main interaction point, full-page chat interface

The chat is the hero. Goals list is for visibility/debugging.

---

## How to Approach This

### Phase 1: Foundation
- Set up Next.js project
- Configure Supabase (create tables, enable auth, set up RLS)
- Get login/logout working
- Create empty dashboard page

### Phase 2: Basic Chat
- Build chat UI (messages list + input)
- Connect to Claude API (no tools yet, just conversation)
- Store messages in database

### Phase 3: Goal Creation
- Add the router logic
- Implement goal builder prompt
- Add `create_goal` tool
- Show created goals on dashboard

### Phase 4: Check-ins
- Add check-in analyzer prompt
- Add `update_milestone` tool
- Show milestone status updates in UI

### Phase 5: Polish (if time)
- Better error handling
- Loading states
- Mobile responsiveness

---

## Tips

**Start simple.** Get chat working first, then add intelligence.

**The prompts matter.** Spend time on the system prompts for the router and goal builder. They determine how good the AI feels.

**Test with real goals.** "Learn Spanish" and "Run a marathon" are good test cases.

**Use Supabase Dashboard.** It's great for debugging - you can see exactly what's in the database.

**Don't over-engineer.** If something seems too complex, it probably is. Find a simpler way.

---

## What Success Looks Like

I should be able to:

1. Open the app, create an account
2. Say "I want to learn to cook Italian food"
3. Have the AI ask me questions like "What does success look like?" and "When do you want to achieve this?"
4. See a goal appear with milestones like "Master 3 pasta dishes" and "Cook a full Italian dinner"
5. Come back in a week and say "I made carbonara last night, it turned out great"
6. See the AI acknowledge this and update my progress
7. See the updated status reflected in my goals list

---

## Reference

I have a more detailed spec document (goal-agent-spec-v2.md) with:
- Complete SQL schema
- Full tool definitions
- Example prompt templates
- Component code examples

Use it as a reference if you need specifics, but don't feel bound by it. Implement things the way that makes sense to you.
