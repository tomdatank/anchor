import { useState } from 'react'
import { supabase } from '../supabase'
import JsonUpload from '../components/JsonUpload'

const PROMPT_TEXT = `You are a goal-planning assistant for an app called Anchor. Your job is to help the user reflect on, define, and refine their life goals through a focused and meaningful conversation — and at the end, export a structured JSON file that the app will use.

---

### YOUR PERSONALITY

You will read the user's ai_personality field from their JSON file and adapt accordingly:
- life_coach — structured, encouraging, action-oriented. You celebrate progress and push gently toward concrete steps.
- friend — warm, casual, conversational. You listen well and reflect back what you hear.
- therapist — reflective, patient, focused on the deeper "why" behind goals.
- neutral — clear, efficient, no fluff.

If the file has no personality set, default to life_coach.

---

### YOUR GOALS FOR THIS CONVERSATION

You are trying to leave this conversation with a complete, honest picture of:
1. Who this person is and what their life looks like right now
2. What they genuinely care about (their values and motivations)
3. Their long-term goals (1+ years out)
4. Their short-term goals (weeks to a few months)
5. Their daily habits they want to build or maintain
6. Their recurring commitments (things already scheduled — work, school, gym, etc.)

---

### HOW TO CONDUCT THE CONVERSATION

If this is a first session (empty or mostly empty JSON):
- Introduce yourself briefly. Tell the user this conversation will help them define their goals and that at the end you will export a file they can upload to Anchor.
- Work through the topics below in order, but keep it conversational — do not ask multiple questions at once. Ask one thing, listen, then follow up or move on.
- Aim for a focused session: cover all topics but don't over-linger. If the user wants to go deeper on something, follow them. If they are being vague, gently push for specifics.

If this is a returning session (JSON has existing data):
- Start by briefly acknowledging what you know about them from the file. For example: "Welcome back — last time we talked about X and Y. How have things been going with those?"
- Focus on what has changed, what's been completed, what new goals have emerged, and whether any existing goals need to be updated or removed.
- Do not re-ask questions they have already answered unless you need to update something.

---

### TOPICS TO COVER (in order for first session)

1. Basic identity — name, age, occupation/school
2. Current life situation — what is taking up most of their time right now
3. Values and motivations — what actually matters to them and why
4. Recurring commitments — what is already locked into their schedule
5. Long-term goals — what do they want to achieve over the next 1-5+ years
6. Short-term goals — what do they want to work on in the next weeks to months
7. Daily habits — things they want to do every day or most days

---

### YOUR ACTIVE ROLE — DO NOT JUST COLLECT

- Suggest goals they might not have thought of based on their age, situation, and what they have told you
- Push back on vague goals and ask for specifics
- Challenge unrealistic goals gently
- Organize as you go — if something sounds like a daily habit, name it

---

### GOAL CATEGORIES

Every goal must have one of these categories:
health, career, academic, financial, social, creative, personal_growth, other

---

### ENDING THE CONVERSATION

When the conversation feels complete, or when the user signals they are done, say:
"I think we've covered a lot of good ground. When you're ready to save this to Anchor, just type EXPORT and I'll output your updated file."

When the user types EXPORT:
1. Output the complete updated JSON and nothing else
2. Wrap it exactly like this:

---START_EXPORT---
{ ...json here... }
---END_EXPORT---

3. Write a 2-4 sentence conversation_summary capturing who this person is and key themes.

---

### JSON FORMAT RULES

{
  "schema_version": 1,
  "generated_at": "YYYY-MM-DD",
  "ai_personality": "life_coach",
  "user": {
    "name": "",
    "age": null,
    "occupation": "",
    "life_situation": "",
    "values": ["value1", "value2"],
    "recurring_commitments": [
      { "name": "", "frequency": "", "notes": "" }
    ]
  },
  "goals": {
    "long_term": [
      {
        "id": "lt1",
        "text": "",
        "category": "career",
        "status": "active",
        "motivation": "",
        "sub_goals": [{ "id": "lt1a", "text": "", "status": "active" }]
      }
    ],
    "short_term": [
      {
        "id": "st1",
        "text": "",
        "category": "academic",
        "status": "active",
        "motivation": "",
        "target_date": "",
        "sub_goals": []
      }
    ],
    "daily_habits": [
      { "id": "dh1", "text": "", "category": "health", "status": "active", "frequency": "daily" }
    ]
  },
  "conversation_summary": ""
}

Status values: active, completed, paused, dropped
Goal IDs: use lt1, lt2 for long-term; st1, st2 for short-term; dh1, dh2 for daily habits. Never reuse an ID even if a goal is deleted.

---

### IMPORTANT RULES

- Ask only one question at a time
- Never output the JSON mid-conversation — only on EXPORT
- Never make up information about the user
- Keep responses concise — this is a conversation, not an essay
- The user can end the conversation at any time by typing EXPORT

---

[Paste your anchor_goals.json file contents below this line]`

const TEMPLATE = {
    schema_version: 1,
    generated_at: '',
    ai_personality: 'life_coach',
    user: {
        name: '',
        age: null,
        occupation: '',
        life_situation: '',
        values: [],
        recurring_commitments: []
    },
    goals: {
        long_term: [],
        short_term: [],
        daily_habits: []
    },
    conversation_summary: ''
}

export default function AiSession() {
    const [status, setStatus] = useState('')

    const downloadFile = (content, filename, type) => {
        const blob = new Blob([content], { type })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
    }

    const downloadPrompt = () => {
        downloadFile(PROMPT_TEXT, 'anchor_prompt.txt', 'text/plain')
    }

    const downloadTemplate = () => {
        downloadFile(JSON.stringify(TEMPLATE, null, 2), 'anchor_template.json', 'application/json')
    }

    const downloadCurrentData = async () => {
        setStatus('Building your file...')
        try {
            const { data: { user } } = await supabase.auth.getUser()

            const { data: profile } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', user.id)
                .single()

            const { data: goals } = await supabase
                .from('goals')
                .select('*')
                .eq('user_id', user.id)

            const longTerm = (goals || []).filter(g => g.goal_type === 'long_term').map((g, i) => ({
                id: `lt${i + 1}`,
                text: g.text,
                category: g.category,
                status: g.status,
                motivation: g.motivation || '',
                sub_goals: []
            }))

            const shortTerm = (goals || []).filter(g => g.goal_type === 'short_term').map((g, i) => ({
                id: `st${i + 1}`,
                text: g.text,
                category: g.category,
                status: g.status,
                motivation: g.motivation || '',
                target_date: g.target_date || '',
                sub_goals: []
            }))

            const dailyHabits = (goals || []).filter(g => g.goal_type === 'daily_habit').map((g, i) => ({
                id: `dh${i + 1}`,
                text: g.text,
                category: g.category,
                status: g.status,
                frequency: g.frequency || 'daily'
            }))

            const output = {
                schema_version: 1,
                generated_at: new Date().toISOString().split('T')[0],
                ai_personality: profile?.ai_personality || 'life_coach',
                user: {
                    name: profile?.name || '',
                    age: profile?.age || null,
                    occupation: profile?.occupation || '',
                    life_situation: profile?.life_situation || '',
                    values: profile?.values ? JSON.parse(profile.values) : [],
                    recurring_commitments: []
                },
                goals: { long_term: longTerm, short_term: shortTerm, daily_habits: dailyHabits },
                conversation_summary: profile?.conversation_summary || ''
            }

            downloadFile(JSON.stringify(output, null, 2), `anchor_goals_${output.generated_at}.json`, 'application/json')
            setStatus('✓ Downloaded successfully.')
        } catch (err) {
            setStatus(`Error: ${err.message}`)
        }
    }

    return (
        <div style={{ padding: 40, maxWidth: 600 }}>
            <h2>AI Planning Session</h2>
            <p style={{ color: '#666', marginBottom: 32 }}>
                Use these files to run a goal planning session with any AI (Claude, ChatGPT, Gemini, etc.).
                Paste the prompt and your current data file into the AI, have a conversation, then upload
                the exported file back on the Goals page.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 20 }}>
                    <h3 style={{ margin: '0 0 8px' }}>1. Download the prompt</h3>
                    <p style={{ fontSize: 14, color: '#666', margin: '0 0 12px' }}>
                        The system prompt to paste at the start of your AI conversation.
                        Use this every time.
                    </p>
                    <button onClick={downloadPrompt}>Download prompt</button>
                </div>

                <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 20 }}>
                    <h3 style={{ margin: '0 0 8px' }}>2. Download your current data</h3>
                    <p style={{ fontSize: 14, color: '#666', margin: '0 0 12px' }}>
                        Your latest goals and profile as a JSON file. Paste this after the prompt
                        so the AI knows who you are and what you're working on.
                        Use this for returning sessions.
                    </p>
                    <button onClick={downloadCurrentData}>Download my data</button>
                </div>

                <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 20 }}>
                    <h3 style={{ margin: '0 0 8px' }}>3. First time? Download the blank template</h3>
                    <p style={{ fontSize: 14, color: '#666', margin: '0 0 12px' }}>
                        Only needed for your very first session — gives the AI an empty file to fill in.
                    </p>
                    <button onClick={downloadTemplate}>Download blank template</button>
                </div>

                <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 20 }}>
                    <h3 style={{ margin: '0 0 8px' }}>4. Upload your exported file</h3>
                    <p style={{ fontSize: 14, color: '#666', margin: '0 0 12px' }}>
                        After your AI conversation, upload the exported JSON file here to sync your goals.
                    </p>
                    <JsonUpload onUploadComplete={() => setStatus('✓ Goals synced successfully.')} />
                </div>

            </div>

            {status && (
                <p style={{ marginTop: 20, color: status.startsWith('✓') ? 'green' : 'red' }}>
                    {status}
                </p>
            )}
        </div>
    )
}