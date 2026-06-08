import { useState } from 'react'
import { supabase } from '../supabase'

export default function JsonUpload({ onUploadComplete }) {
    const [status, setStatus] = useState('')
    const [loading, setLoading] = useState(false)

    const handleFile = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        setLoading(true)
        setStatus('')

        try {
            // Read the file
            const text = await file.text()

            // Extract JSON from between the delimiters if present
            let jsonText = text
            const start = text.indexOf('---START_EXPORT---')
            const end = text.indexOf('---END_EXPORT---')
            if (start !== -1 && end !== -1) {
                jsonText = text.slice(start + '---START_EXPORT---'.length, end).trim()
            }

            // Parse it
            const data = JSON.parse(jsonText)

            // Get current user
            const { data: { user } } = await supabase.auth.getUser()

            // Save profile info
            const profile = {
                user_id: user.id,
                name: data.user?.name || '',
                age: data.user?.age || null,
                occupation: data.user?.occupation || '',
                life_situation: data.user?.life_situation || '',
                values: data.user?.values ? JSON.stringify(data.user.values) : '[]',
                ai_personality: data.ai_personality || 'life_coach',
                conversation_summary: data.conversation_summary || '',
                raw_json: jsonText
            }

            const { error: profileError } = await supabase
                .from('user_profiles')
                .upsert(profile, { onConflict: 'user_id' })

            if (profileError) throw profileError

            // Save goals — delete existing first so we get a clean sync
            await supabase.from('goals').delete().eq('user_id', user.id)

            const goalsToInsert = []

            const mapGoal = (goal, type) => ({
                user_id: user.id,
                text: goal.text || '',
                category: goal.category || 'other',
                goal_type: type,
                status: goal.status || 'active',
                motivation: goal.motivation || '',
                frequency: goal.frequency || '',
                target_date: goal.target_date || null
            })

                ; (data.goals?.long_term || []).forEach(g => goalsToInsert.push(mapGoal(g, 'long_term')))
                ; (data.goals?.short_term || []).forEach(g => goalsToInsert.push(mapGoal(g, 'short_term')))
                ; (data.goals?.daily_habits || []).forEach(g => goalsToInsert.push(mapGoal(g, 'daily_habit')))

            if (goalsToInsert.length > 0) {
                const { error: goalsError } = await supabase.from('goals').insert(goalsToInsert)
                if (goalsError) throw goalsError
            }

            // Upload raw file to storage
            const filePath = `${user.id}/anchor_goals_${Date.now()}.json`
            await supabase.storage.from('anchor-files').upload(filePath, file)

            setStatus(`✓ Imported successfully — ${goalsToInsert.length} goals loaded.`)
            if (onUploadComplete) onUploadComplete()

        } catch (err) {
            console.error(err)
            setStatus(`Error: ${err.message}. Make sure you uploaded a valid Anchor JSON file.`)
        }

        setLoading(false)
    }

    return (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 20, marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>Import from AI session</h3>
            <p style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>
                Upload the JSON file exported from your goal planning conversation to sync your goals.
            </p>
            <input
                type="file"
                accept=".json"
                onChange={handleFile}
                disabled={loading}
            />
            {loading && <p style={{ color: '#888', marginTop: 8 }}>Importing...</p>}
            {status && (
                <p style={{ marginTop: 8, color: status.startsWith('✓') ? 'green' : 'red' }}>
                    {status}
                </p>
            )}
        </div>
    )
}