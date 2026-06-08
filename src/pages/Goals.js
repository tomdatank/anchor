import { useEffect, useState } from 'react'
import { supabase } from '../supabase'



const CATEGORIES = ['health', 'career', 'academic', 'financial', 'social', 'creative', 'personal_growth', 'other']
const TYPES = ['long_term', 'short_term', 'daily_habit']

export default function Goals({ session }) {
    const [goals, setGoals] = useState([])
    const [editingId, setEditingId] = useState(null)
    const [form, setForm] = useState({ text: '', category: 'personal_growth', goal_type: 'short_term', motivation: '', status: 'active' })
    const [showForm, setShowForm] = useState(false)

    useEffect(() => { loadGoals() }, [])

    const loadGoals = async () => {
        const { data } = await supabase.from('goals').select('*').order('created_at', { ascending: false })
        setGoals(data || [])
    }

    const save = async () => {
        if (!form.text.trim()) return
        if (editingId) {
            await supabase.from('goals').update(form).eq('id', editingId)
        } else {
            await supabase.from('goals').insert(form)
        }
        setForm({ text: '', category: 'personal_growth', goal_type: 'short_term', motivation: '', status: 'active' })
        setEditingId(null)
        setShowForm(false)
        loadGoals()
    }

    const startEdit = (goal) => {
        setForm({ text: goal.text, category: goal.category, goal_type: goal.goal_type, motivation: goal.motivation || '', status: goal.status })
        setEditingId(goal.id)
        setShowForm(true)
    }

    const remove = async (id) => {
        if (!window.confirm('Delete this goal?')) return
        await supabase.from('goals').delete().eq('id', id)
        loadGoals()
    }

    const grouped = TYPES.reduce((acc, type) => {
        acc[type] = goals.filter(g => g.goal_type === type)
        return acc
    }, {})

    const typeLabel = { long_term: 'Long Term', short_term: 'Short Term', daily_habit: 'Daily Habits' }

    return (
        <div style={{ padding: 40, maxWidth: 700 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ margin: 0 }}>Goals</h2>
                <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ text: '', category: 'personal_growth', goal_type: 'short_term', motivation: '', status: 'active' }) }}>
                    {showForm ? 'Cancel' : '+ Add goal'}
                </button>
            </div>

            {showForm && (
                <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 20, marginBottom: 24 }}>
                    <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit goal' : 'New goal'}</h3>
                    <input
                        placeholder="What's the goal?"
                        value={form.text}
                        onChange={e => setForm({ ...form, text: e.target.value })}
                        style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }}
                    />
                    <textarea
                        placeholder="Why does this matter to you? (optional)"
                        value={form.motivation}
                        onChange={e => setForm({ ...form, motivation: e.target.value })}
                        style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8, minHeight: 60 }}
                    />
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <select value={form.goal_type} onChange={e => setForm({ ...form, goal_type: e.target.value })} style={{ padding: 8 }}>
                            {TYPES.map(t => <option key={t} value={t}>{typeLabel[t]}</option>)}
                        </select>
                        <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ padding: 8 }}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={{ padding: 8 }}>
                            {['active', 'completed', 'paused', 'dropped'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <button onClick={save}>{editingId ? 'Save changes' : 'Add goal'}</button>
                </div>
            )}

            {TYPES.map(type => (
                <div key={type} style={{ marginBottom: 32 }}>
                    <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: 8 }}>{typeLabel[type]}</h3>
                    {grouped[type].length === 0 && <p style={{ color: '#aaa', fontSize: 14 }}>No {typeLabel[type].toLowerCase()} goals yet.</p>}
                    {grouped[type].map(goal => (
                        <div key={goal.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <p style={{ margin: '0 0 4px', fontWeight: 500 }}>{goal.text}</p>
                                    <p style={{ margin: '0 0 4px', fontSize: 13, color: '#888' }}>{goal.category} · {goal.status}</p>
                                    {goal.motivation && <p style={{ margin: 0, fontSize: 13, color: '#666', fontStyle: 'italic' }}>{goal.motivation}</p>}
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                                    <button onClick={() => startEdit(goal)}>Edit</button>
                                    <button onClick={() => remove(goal.id)} style={{ color: 'red' }}>Delete</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
}