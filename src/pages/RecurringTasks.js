import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS = [1, 2, 3, 4, 5]
const WEEKENDS = [0, 6]

export default function RecurringTasks() {
    const [tasks, setTasks] = useState([])
    const [goals, setGoals] = useState([])
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState(null)
    const [form, setForm] = useState({
        name: '', goal_id: '', days_of_week: [], time_of_day: '', notes: ''
    })

    useEffect(() => { loadAll() }, [])

    const loadAll = async () => {
        const { data: tasksData } = await supabase
            .from('recurring_tasks')
            .select('*')
            .order('time_of_day', { ascending: true, nullsFirst: false })
        const { data: goalsData } = await supabase
            .from('goals')
            .select('id, text, goal_type')
            .eq('status', 'active')
        setTasks(tasksData || [])
        setGoals(goalsData || [])
    }

    const resetForm = () => {
        setForm({ name: '', goal_id: '', days_of_week: [], time_of_day: '', notes: '' })
        setEditingId(null)
        setShowForm(false)
    }

    const toggleDay = (day) => {
        setForm(prev => ({
            ...prev,
            days_of_week: prev.days_of_week.includes(day)
                ? prev.days_of_week.filter(d => d !== day)
                : [...prev.days_of_week, day]
        }))
    }

    const setPreset = (days) => {
        setForm(prev => ({ ...prev, days_of_week: days }))
    }

    const save = async () => {
        if (!form.name.trim() || form.days_of_week.length === 0) return
        const payload = {
            name: form.name,
            goal_id: form.goal_id || null,
            days_of_week: form.days_of_week.sort().join(','),
            time_of_day: form.time_of_day || null,
            notes: form.notes
        }
        if (editingId) {
            await supabase.from('recurring_tasks').update(payload).eq('id', editingId)
        } else {
            await supabase.from('recurring_tasks').insert(payload)
        }
        resetForm()
        loadAll()
    }

    const remove = async (id) => {
        if (!window.confirm('Delete this recurring task?')) return
        await supabase.from('recurring_tasks').delete().eq('id', id)
        loadAll()
    }

    const startEdit = (task) => {
        setForm({
            name: task.name,
            goal_id: task.goal_id || '',
            days_of_week: task.days_of_week.split(',').map(Number),
            time_of_day: task.time_of_day || '',
            notes: task.notes || ''
        })
        setEditingId(task.id)
        setShowForm(true)
    }

    const formatDays = (daysStr) => {
        return daysStr.split(',').map(d => DAY_LABELS[Number(d)]).join(', ')
    }

    const formatTime = (timeStr) => {
        if (!timeStr) return null
        const [h, m] = timeStr.split(':')
        const hour = parseInt(h)
        const ampm = hour >= 12 ? 'PM' : 'AM'
        const display = hour % 12 || 12
        return `${display}:${m} ${ampm}`
    }

    const linkedGoal = (goalId) => goals.find(g => g.id === goalId)

    return (
        <div style={{ padding: 40, maxWidth: 700 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ margin: 0 }}>Recurring Tasks</h2>
                <button onClick={() => { resetForm(); setShowForm(!showForm) }}>
                    {showForm ? 'Cancel' : '+ New task'}
                </button>
            </div>

            {showForm && (
                <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 20, marginBottom: 24 }}>
                    <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit task' : 'New recurring task'}</h3>

                    <input
                        placeholder="Task name (e.g. Work, Gym, Club meeting)"
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        style={{ display: 'block', width: '100%', marginBottom: 12, padding: 8, boxSizing: 'border-box' }}
                    />

                    <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 6 }}>Repeats on</label>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                            {DAY_LABELS.map((label, i) => (
                                <button
                                    key={i}
                                    onClick={() => toggleDay(i)}
                                    style={{
                                        padding: '5px 10px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                                        border: form.days_of_week.includes(i) ? '2px solid #6366f1' : '1px solid #ddd',
                                        background: form.days_of_week.includes(i) ? '#eef2ff' : '#fff',
                                        color: form.days_of_week.includes(i) ? '#6366f1' : '#333',
                                        fontWeight: form.days_of_week.includes(i) ? 600 : 400
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setPreset(WEEKDAYS)} style={{ fontSize: 12, padding: '3px 8px', cursor: 'pointer' }}>Weekdays</button>
                            <button onClick={() => setPreset(WEEKENDS)} style={{ fontSize: 12, padding: '3px 8px', cursor: 'pointer' }}>Weekends</button>
                            <button onClick={() => setPreset([0, 1, 2, 3, 4, 5, 6])} style={{ fontSize: 12, padding: '3px 8px', cursor: 'pointer' }}>Every day</button>
                            <button onClick={() => setPreset([])} style={{ fontSize: 12, padding: '3px 8px', cursor: 'pointer' }}>Clear</button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>Time (optional)</label>
                            <input
                                type="time"
                                value={form.time_of_day}
                                onChange={e => setForm({ ...form, time_of_day: e.target.value })}
                                style={{ padding: 8, width: '100%', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>Linked goal (optional)</label>
                            <select
                                value={form.goal_id}
                                onChange={e => setForm({ ...form, goal_id: e.target.value })}
                                style={{ padding: 8, width: '100%', boxSizing: 'border-box' }}
                            >
                                <option value="">No linked goal</option>
                                {goals.map(g => (
                                    <option key={g.id} value={g.id}>{g.text}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <input
                        placeholder="Notes (optional)"
                        value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })}
                        style={{ display: 'block', width: '100%', marginBottom: 12, padding: 8, boxSizing: 'border-box' }}
                    />

                    <button onClick={save} disabled={!form.name.trim() || form.days_of_week.length === 0}>
                        {editingId ? 'Save changes' : 'Add task'}
                    </button>
                    {form.days_of_week.length === 0 && (
                        <span style={{ fontSize: 12, color: '#f97316', marginLeft: 10 }}>Select at least one day</span>
                    )}
                </div>
            )}

            {tasks.length === 0 && !showForm && (
                <p style={{ color: '#aaa' }}>No recurring tasks yet. Add things like work, gym, classes, or club meetings.</p>
            )}

            {tasks.map(task => (
                <div key={task.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontWeight: 500, fontSize: 15 }}>{task.name}</span>
                                {task.time_of_day && (
                                    <span style={{ fontSize: 12, color: '#6366f1', background: '#eef2ff', padding: '2px 7px', borderRadius: 10 }}>
                                        {formatTime(task.time_of_day)}
                                    </span>
                                )}
                            </div>
                            <p style={{ margin: '0 0 3px', fontSize: 13, color: '#888' }}>{formatDays(task.days_of_week)}</p>
                            {task.goal_id && linkedGoal(task.goal_id) && (
                                <p style={{ margin: 0, fontSize: 12, color: '#6366f1' }}>
                                    → {linkedGoal(task.goal_id).text}
                                </p>
                            )}
                            {task.notes && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#999', fontStyle: 'italic' }}>{task.notes}</p>}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => startEdit(task)}>Edit</button>
                            <button onClick={() => remove(task.id)} style={{ color: 'red' }}>Delete</button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}