import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { calculateScore, scoreColor, scoreLabel } from '../utils/scoring'

// ── helpers ──────────────────────────────────────────────────────────────────

function getWeekDays(date) {
    const d = new Date(date)
    const day = d.getDay()
    const monday = new Date(d)
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
    return Array.from({ length: 7 }, (_, i) => {
        const dd = new Date(monday)
        dd.setDate(monday.getDate() + i)
        return dd
    })
}

function toDateStr(date) {
    return date.toISOString().split('T')[0]
}

function isToday(date) {
    return toDateStr(date) === toDateStr(new Date())
}

function isPast(date) {
    return toDateStr(date) <= toDateStr(new Date())
}

function formatTime(timeStr) {
    const [h, m] = timeStr.split(':')
    const hour = parseInt(h)
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── main component ────────────────────────────────────────────────────────────

export default function Dashboard({ session }) {
    const today = new Date()
    const weekDays = getWeekDays(today)

    const [selectedDate, setSelectedDate] = useState(toDateStr(today))
    const [goals, setGoals] = useState({ longTerm: [], all: [] })
    const [assignments, setAssignments] = useState([])
    const [dailyLogs, setDailyLogs] = useState([])
    const [entries, setEntries] = useState([])
    const [newEntry, setNewEntry] = useState('')
    const [lastWeekAvg, setLastWeekAvg] = useState(null)
    const [loading, setLoading] = useState(true)
    const [addingTask, setAddingTask] = useState(false)
    const [newTask, setNewTask] = useState({ name: '', goal_id: '', time_of_day: '' })

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { loadAll() }, [])

    const loadAll = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()

        const { data: ltGoals } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('goal_type', 'long_term')
            .eq('status', 'active')

        const { data: allGoalsData } = await supabase
            .from('goals')
            .select('id, text')
            .eq('user_id', user.id)

        const { data: recurringData } = await supabase
            .from('recurring_tasks')
            .select('*')
            .eq('user_id', user.id)

        // Delete assignments whose recurring task has since been deleted (all dates, not just this week)
        const validRecurringIds = new Set((recurringData || []).map(t => t.id))
        if (validRecurringIds.size > 0) {
            await supabase.from('goal_assignments')
                .delete()
                .eq('user_id', user.id)
                .eq('is_recurring', true)
                .not('recurring_task_id', 'in', `(${[...validRecurringIds].join(',')})`)
        } else {
            await supabase.from('goal_assignments')
                .delete()
                .eq('user_id', user.id)
                .eq('is_recurring', true)
                .not('recurring_task_id', 'is', null)
        }

        const weekStart = toDateStr(weekDays[0])
        const weekEnd = toDateStr(weekDays[6])
        const { data: assignData } = await supabase
            .from('goal_assignments')
            .select('*')
            .eq('user_id', user.id)
            .gte('assigned_date', weekStart)
            .lte('assigned_date', weekEnd)

        const existingAssignments = [...(assignData || [])]

        // Auto-populate recurring tasks for each day of the week
        const missingAssignments = []
        for (const day of weekDays) {
            const dateStr = toDateStr(day)
            const dayOfWeek = day.getDay()
            const recurringForDay = (recurringData || []).filter(t => {
                const days = t.days_of_week.split(',').map(Number)
                return days.includes(dayOfWeek)
            })
            for (const task of recurringForDay) {
                const alreadyAssigned = existingAssignments.find(
                    a => a.assigned_date === dateStr && (
                        a.recurring_task_id === task.id ||
                        (a.is_recurring && a.name === task.name)
                    )
                )
                if (!alreadyAssigned) {
                    missingAssignments.push({
                        user_id: user.id,
                        name: task.name,
                        goal_id: task.goal_id || null,
                        assigned_date: dateStr,
                        completed: false,
                        is_recurring: true,
                        recurring_task_id: task.id,
                        time_of_day: task.time_of_day || null
                    })
                }
            }
        }

        if (missingAssignments.length > 0) {
            const { data: newAssigns } = await supabase
                .from('goal_assignments')
                .insert(missingAssignments)
                .select()
            if (newAssigns) existingAssignments.push(...newAssigns)
        }

        const { data: logsData } = await supabase
            .from('daily_logs')
            .select('*')
            .eq('user_id', user.id)
            .gte('log_date', weekStart)
            .lte('log_date', weekEnd)

        const lastWeekStart = new Date(weekDays[0])
        lastWeekStart.setDate(lastWeekStart.getDate() - 7)
        const lastWeekEnd = new Date(weekDays[6])
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 7)
        const { data: lastWeekLogs } = await supabase
            .from('daily_logs')
            .select('score')
            .eq('user_id', user.id)
            .gte('log_date', toDateStr(lastWeekStart))
            .lte('log_date', toDateStr(lastWeekEnd))

        const { data: entriesData } = await supabase
            .from('journal_entries')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5)

        const scores = (lastWeekLogs || []).map(l => l.score).filter(Boolean)
        const avg = scores.length > 0
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : null

        // Deduplicate recurring tasks: keep only one assignment per (date, recurring_task_id)
        const seenRecurring = new Set()
        const deduped = existingAssignments.filter(a => {
            if (!a.is_recurring || !a.recurring_task_id) return true
            const key = `${a.assigned_date}|${a.recurring_task_id}`
            if (seenRecurring.has(key)) return false
            seenRecurring.add(key)
            return true
        })

        // Sync scores for days where the task count has changed (e.g. recurring task added/deleted)
        const updatedLogs = [...(logsData || [])]
        const scoreWrites = []
        for (const day of weekDays) {
            const dateStr = toDateStr(day)
            const dayTasks = deduped.filter(a => a.assigned_date === dateStr)
            if (dayTasks.length === 0) continue
            const total = dayTasks.length
            const completed = dayTasks.filter(a => a.completed).length
            const score = calculateScore(completed, total)
            if (score === null) continue
            const logData = { user_id: user.id, log_date: dateStr, score, goals_completed: completed, goals_total: total }
            const existing = updatedLogs.find(l => l.log_date === dateStr)
            if (existing && existing.goals_total === total) continue
            if (existing) {
                const idx = updatedLogs.findIndex(l => l.log_date === dateStr)
                updatedLogs[idx] = { ...existing, ...logData }
                scoreWrites.push(supabase.from('daily_logs').update(logData).eq('id', existing.id))
            } else {
                scoreWrites.push(
                    supabase.from('daily_logs').insert(logData).select().single()
                        .then(({ data }) => { if (data) updatedLogs.push(data) })
                )
            }
        }
        if (scoreWrites.length > 0) await Promise.all(scoreWrites)

        setGoals({ longTerm: ltGoals || [], all: allGoalsData || [] })
        setAssignments(deduped)
        setDailyLogs(updatedLogs)
        setLastWeekAvg(avg)
        setEntries(entriesData || [])
        setLoading(false)
    }

    // ── task actions ────────────────────────────────────────────────────────────

    const addTask = async () => {
        if (!newTask.name.trim()) return
        const { data: { user } } = await supabase.auth.getUser()
        const { data } = await supabase.from('goal_assignments').insert({
            user_id: user.id,
            name: newTask.name.trim(),
            goal_id: newTask.goal_id || null,
            assigned_date: selectedDate,
            time_of_day: newTask.time_of_day || null,
            completed: false,
            is_recurring: false
        }).select().single()
        if (data) {
            const updated = [...assignments, data]
            setAssignments(updated)
            await recalcScore(selectedDate, updated)
        }
        setNewTask({ name: '', goal_id: '', time_of_day: '' })
        setAddingTask(false)
    }

    const removeTask = async (assignmentId) => {
        await supabase.from('goal_assignments').delete().eq('id', assignmentId)
        const updated = assignments.filter(a => a.id !== assignmentId)
        setAssignments(updated)
        await recalcScore(selectedDate, updated)
    }

    const toggleComplete = async (assignmentId, current) => {
        await supabase.from('goal_assignments')
            .update({ completed: !current })
            .eq('id', assignmentId)
        const updated = assignments.map(a =>
            a.id === assignmentId ? { ...a, completed: !current } : a
        )
        setAssignments(updated)
        await recalcScore(selectedDate, updated)
    }

    // ── score recalculation ─────────────────────────────────────────────────────

    const recalcScore = async (dateStr, currentAssignments) => {
        const { data: { user } } = await supabase.auth.getUser()
        const dayAssignments = currentAssignments.filter(a => a.assigned_date === dateStr)
        const total = dayAssignments.length
        const completed = dayAssignments.filter(a => a.completed).length
        const score = calculateScore(completed, total)
        if (score === null) return

        const logData = {
            user_id: user.id, log_date: dateStr, score,
            goals_completed: completed, goals_total: total
        }
        const existing = dailyLogs.find(l => l.log_date === dateStr)
        if (existing) {
            await supabase.from('daily_logs').update(logData).eq('id', existing.id)
            setDailyLogs(prev => prev.map(l => l.log_date === dateStr ? { ...l, ...logData } : l))
        } else {
            const { data } = await supabase.from('daily_logs').insert(logData).select().single()
            if (data) setDailyLogs(prev => [...prev, data])
        }
    }

    // ── journal ─────────────────────────────────────────────────────────────────

    const saveEntry = async () => {
        if (!newEntry.trim()) return
        const { data: { user } } = await supabase.auth.getUser()
        const { data } = await supabase.from('journal_entries')
            .insert({ content: newEntry, user_id: user.id })
            .select().single()
        if (data) setEntries(prev => [data, ...prev.slice(0, 4)])
        setNewEntry('')
    }

    // ── derived data ────────────────────────────────────────────────────────────

    const selectedAssignments = assignments.filter(a => a.assigned_date === selectedDate)
    const selectedLog = dailyLogs.find(l => l.log_date === selectedDate)

    const sortedTasks = [...selectedAssignments].sort((a, b) => {
        if (a.time_of_day && b.time_of_day) return a.time_of_day.localeCompare(b.time_of_day)
        if (a.time_of_day) return -1
        if (b.time_of_day) return 1
        return 0
    })

    if (loading) return <div style={{ padding: 40 }}>Loading...</div>

    return (
        <div style={{ padding: '24px 32px', maxWidth: 1000 }}>

            {/* ── week strip ── */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h2 style={{ margin: 0 }}>This week</h2>
                    {lastWeekAvg !== null && (
                        <span style={{ fontSize: 13, color: '#888' }}>
                            Last week avg: <strong style={{ color: scoreColor(lastWeekAvg) }}>{lastWeekAvg}</strong>
                        </span>
                    )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                    {weekDays.map((day, i) => {
                        const dateStr = toDateStr(day)
                        const log = dailyLogs.find(l => l.log_date === dateStr)
                        const score = log?.score ?? null
                        const isSelected = selectedDate === dateStr
                        const past = isPast(day)
                        const todayDay = isToday(day)

                        return (
                            <div
                                key={dateStr}
                                onClick={() => setSelectedDate(dateStr)}
                                style={{
                                    border: isSelected ? '2px solid #6366f1' : '1px solid #e5e7eb',
                                    borderRadius: 10,
                                    padding: '10px 6px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    background: isSelected ? '#eef2ff' : past ? '#fafafa' : '#fff',
                                    opacity: past || todayDay ? 1 : 0.5
                                }}
                            >
                                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{DAY_LABELS[i]}</div>
                                <div style={{ fontSize: 14, fontWeight: todayDay ? 700 : 400, marginBottom: 6 }}>
                                    {day.getDate()}
                                </div>
                                {past && (
                                    <div style={{ fontSize: 13, fontWeight: 600, color: scoreColor(score) }}>
                                        {score !== null ? score : '—'}
                                    </div>
                                )}
                                {todayDay && score === null && (
                                    <div style={{ fontSize: 10, color: '#6366f1' }}>today</div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* ── main two column layout ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>

                {/* left — task list for selected day */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3 style={{ margin: 0 }}>
                            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </h3>
                        {selectedLog?.score != null && (
                            <span style={{
                                fontSize: 13, fontWeight: 600, padding: '3px 10px',
                                borderRadius: 20, background: scoreColor(selectedLog.score) + '22',
                                color: scoreColor(selectedLog.score)
                            }}>
                                {selectedLog.goals_completed} / {selectedLog.goals_total} · {scoreLabel(selectedLog.score)}
                            </span>
                        )}
                    </div>

                    {sortedTasks.length === 0 && (
                        <p style={{ fontSize: 13, color: '#aaa' }}>No tasks for this day yet.</p>
                    )}

                    {sortedTasks.map(task => {
                        const displayName = task.name || goals.all.find(g => g.id === task.goal_id)?.text || 'Unnamed task'
                        const linkedGoalText = task.name && task.goal_id
                            ? goals.all.find(g => g.id === task.goal_id)?.text
                            : null

                        return (
                            <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8, padding: '10px 12px', border: '1px solid #eee', borderRadius: 8 }}>
                                <input
                                    type="checkbox"
                                    checked={task.completed || false}
                                    onChange={() => toggleComplete(task.id, task.completed)}
                                    style={{ width: 16, height: 16, cursor: 'pointer', marginTop: 2 }}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{
                                            fontSize: 14,
                                            textDecoration: task.completed ? 'line-through' : 'none',
                                            color: task.completed ? '#aaa' : '#111'
                                        }}>
                                            {displayName}
                                        </span>
                                        {task.time_of_day && (
                                            <span style={{ fontSize: 11, color: '#6366f1', background: '#eef2ff', padding: '1px 6px', borderRadius: 8 }}>
                                                {formatTime(task.time_of_day)}
                                            </span>
                                        )}
                                    </div>
                                    {linkedGoalText && (
                                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6366f1' }}>→ {linkedGoalText}</p>
                                    )}
                                </div>
                                {!task.is_recurring && (
                                    <button
                                        onClick={() => removeTask(task.id)}
                                        style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}
                                    >✕</button>
                                )}
                            </div>
                        )
                    })}

                    {/* add one-off task */}
                    <div style={{ marginTop: 12 }}>
                        <button
                            onClick={() => { setAddingTask(!addingTask); setNewTask({ name: '', goal_id: '', time_of_day: '' }) }}
                            style={{ fontSize: 13, background: 'none', border: '1px dashed #ccc', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', width: '100%', color: '#666' }}
                        >
                            {addingTask ? '— cancel' : '+ add a task for this day'}
                        </button>

                        {addingTask && (
                            <div style={{ marginTop: 8, padding: 12, border: '1px solid #eee', borderRadius: 8 }}>
                                <input
                                    placeholder="Task name"
                                    value={newTask.name}
                                    onChange={e => setNewTask({ ...newTask, name: e.target.value })}
                                    onKeyDown={e => e.key === 'Enter' && addTask()}
                                    autoFocus
                                    style={{ display: 'block', width: '100%', marginBottom: 8, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box', borderRadius: 6, border: '1px solid #ddd' }}
                                />
                                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                    <input
                                        type="time"
                                        value={newTask.time_of_day}
                                        onChange={e => setNewTask({ ...newTask, time_of_day: e.target.value })}
                                        style={{ flex: 1, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box', borderRadius: 6, border: '1px solid #ddd' }}
                                    />
                                    <select
                                        value={newTask.goal_id}
                                        onChange={e => setNewTask({ ...newTask, goal_id: e.target.value })}
                                        style={{ flex: 2, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box', borderRadius: 6, border: '1px solid #ddd' }}
                                    >
                                        <option value="">No linked goal</option>
                                        {goals.all.map(g => (
                                            <option key={g.id} value={g.id}>{g.text}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    onClick={addTask}
                                    disabled={!newTask.name.trim()}
                                    style={{ fontSize: 13, padding: '5px 14px' }}
                                >
                                    Add task
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* right — journal */}
                <div>
                    <h3 style={{ margin: '0 0 12px' }}>Journal</h3>
                    <textarea
                        value={newEntry}
                        onChange={e => setNewEntry(e.target.value)}
                        placeholder="Log something for today..."
                        style={{ display: 'block', width: '100%', minHeight: 80, padding: 10, fontSize: 13, marginBottom: 8, borderRadius: 8, border: '1px solid #e5e7eb', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    <button onClick={saveEntry} style={{ marginBottom: 16, fontSize: 13 }}>Save entry</button>
                    <div>
                        {entries.map(e => (
                            <div key={e.id} style={{ padding: '10px 12px', borderLeft: '3px solid #e5e7eb', marginBottom: 10 }}>
                                <p style={{ margin: '0 0 4px', fontSize: 13 }}>{e.content}</p>
                                <p style={{ margin: 0, fontSize: 11, color: '#aaa' }}>{new Date(e.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── long term goals horizon ── */}
            <div>
                <h3 style={{ borderTop: '1px solid #eee', paddingTop: 20, marginBottom: 16 }}>On the horizon</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                    {goals.longTerm.map(goal => (
                        <div key={goal.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 14 }}>
                            <p style={{ margin: '0 0 6px', fontWeight: 500, fontSize: 14 }}>{goal.text}</p>
                            <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{goal.category}</p>
                            {goal.motivation && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#666', fontStyle: 'italic' }}>{goal.motivation}</p>}
                        </div>
                    ))}
                    {goals.longTerm.length === 0 && (
                        <p style={{ fontSize: 13, color: '#aaa' }}>No long term goals yet — add some on the Goals page or run an AI session.</p>
                    )}
                </div>
            </div>

        </div>
    )
}
