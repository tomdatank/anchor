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

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── main component ────────────────────────────────────────────────────────────

export default function Dashboard({ session }) {
    const today = new Date()
    const weekDays = getWeekDays(today)

    const [selectedDate, setSelectedDate] = useState(toDateStr(today))
    const [goals, setGoals] = useState([])
    const [assignments, setAssignments] = useState([])
    const [dailyLogs, setDailyLogs] = useState([])
    const [entries, setEntries] = useState([])
    const [newEntry, setNewEntry] = useState('')
    const [lastWeekAvg, setLastWeekAvg] = useState(null)
    const [loading, setLoading] = useState(true)
    const [assigningGoal, setAssigningGoal] = useState(null)

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { loadAll() }, [])

    const loadAll = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()

        // Load short term goals and daily habits
        const { data: goalsData } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', user.id)
            .in('goal_type', ['short_term', 'daily_habit'])
            .eq('status', 'active')

        // Load long term goals separately
        const { data: ltGoals } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('goal_type', 'long_term')
            .eq('status', 'active')

        // Load assignments for this week
        const weekStart = toDateStr(weekDays[0])
        const weekEnd = toDateStr(weekDays[6])
        const { data: assignData } = await supabase
            .from('goal_assignments')
            .select('*')
            .eq('user_id', user.id)
            .gte('assigned_date', weekStart)
            .lte('assigned_date', weekEnd)

        // Load daily logs for this week
        const { data: logsData } = await supabase
            .from('daily_logs')
            .select('*')
            .eq('user_id', user.id)
            .gte('log_date', weekStart)
            .lte('log_date', weekEnd)

        // Load last week's logs for average
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

        // Load recent journal entries
        const { data: entriesData } = await supabase
            .from('journal_entries')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5)

        const scores = (lastWeekLogs || []).map(l => l.score).filter(Boolean)
        const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

        setGoals({ current: goalsData || [], longTerm: ltGoals || [] })
        setAssignments(assignData || [])
        setDailyLogs(logsData || [])
        setLastWeekAvg(avg)
        setEntries(entriesData || [])
        setLoading(false)
    }

    // ── assignment logic ────────────────────────────────────────────────────────

    const toggleAssignment = async (goalId, dateStr) => {
        const { data: { user } } = await supabase.auth.getUser()
        const existing = assignments.find(a => a.goal_id === goalId && a.assigned_date === dateStr)

        if (existing) {
            await supabase.from('goal_assignments').delete().eq('id', existing.id)
            setAssignments(prev => prev.filter(a => a.id !== existing.id))
        } else {
            const { data } = await supabase.from('goal_assignments').insert({
                user_id: user.id, goal_id: goalId, assigned_date: dateStr, completed: false
            }).select().single()
            if (data) setAssignments(prev => [...prev, data])
        }
    }

    const toggleComplete = async (assignmentId, current) => {
        await supabase.from('goal_assignments')
            .update({ completed: !current })
            .eq('id', assignmentId)
        setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, completed: !current } : a))
        await recalcScore(selectedDate)
    }

    // ── score recalculation ─────────────────────────────────────────────────────

    const recalcScore = async (dateStr) => {
        const { data: { user } } = await supabase.auth.getUser()
        const dayAssignments = assignments.filter(a => a.assigned_date === dateStr)
        const habits = (goals.current || []).filter(g => g.goal_type === 'daily_habit')
        const dayGoals = dayAssignments.filter(a =>
            (goals.current || []).find(g => g.id === a.goal_id && g.goal_type === 'short_term')
        )
        const dayHabits = dayAssignments.filter(a =>
            habits.find(g => g.id === a.goal_id)
        )

        const score = calculateScore(
            dayGoals.filter(a => a.completed).length, dayGoals.length,
            dayHabits.filter(a => a.completed).length, Math.max(dayHabits.length, habits.length)
        )

        if (score === null) return

        const existing = dailyLogs.find(l => l.log_date === dateStr)
        const logData = {
            user_id: user.id, log_date: dateStr, score,
            goals_completed: dayAssignments.filter(a => a.completed).length,
            goals_total: dayAssignments.length
        }

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
    const selectedDayGoals = (goals.current || []).filter(g =>
        selectedAssignments.find(a => a.goal_id === g.id)
    )

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
                                    <div style={{
                                        fontSize: 13, fontWeight: 600,
                                        color: scoreColor(score)
                                    }}>
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

                {/* left — goal checklist for selected day */}
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
                                {selectedLog.score} · {scoreLabel(selectedLog.score)}
                            </span>
                        )}
                    </div>

                    {/* assigned goals for this day */}
                    {selectedDayGoals.length === 0 && (
                        <p style={{ fontSize: 13, color: '#aaa' }}>No goals assigned to this day yet.</p>
                    )}
                    {selectedDayGoals.map(goal => {
                        const assign = selectedAssignments.find(a => a.goal_id === goal.id)
                        return (
                            <div key={goal.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '8px 12px', border: '1px solid #eee', borderRadius: 8 }}>
                                <input
                                    type="checkbox"
                                    checked={assign?.completed || false}
                                    onChange={() => toggleComplete(assign.id, assign.completed)}
                                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: 14, textDecoration: assign?.completed ? 'line-through' : 'none', color: assign?.completed ? '#aaa' : '#111', flex: 1 }}>
                                    {goal.text}
                                </span>
                                <span style={{ fontSize: 11, color: '#aaa' }}>{goal.goal_type === 'daily_habit' ? 'habit' : 'goal'}</span>
                                <button
                                    onClick={() => toggleAssignment(goal.id, selectedDate)}
                                    style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}
                                >
                                    ✕
                                </button>
                            </div>
                        )
                    })}

                    {/* assign more goals */}
                    <div style={{ marginTop: 12 }}>
                        <button
                            onClick={() => setAssigningGoal(assigningGoal ? null : true)}
                            style={{ fontSize: 13, background: 'none', border: '1px dashed #ccc', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', width: '100%', color: '#666' }}
                        >
                            {assigningGoal ? '— close' : '+ assign a goal to this day'}
                        </button>

                        {assigningGoal && (
                            <div style={{ marginTop: 8, border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
                                {(goals.current || [])
                                    .filter(g => !selectedAssignments.find(a => a.goal_id === g.id))
                                    .map(goal => (
                                        <div
                                            key={goal.id}
                                            onClick={() => { toggleAssignment(goal.id, selectedDate); setAssigningGoal(null) }}
                                            style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}
                                        >
                                            <span>{goal.text}</span>
                                            <span style={{ color: '#aaa', fontSize: 11 }}>{goal.goal_type === 'daily_habit' ? 'habit' : 'goal'}</span>
                                        </div>
                                    ))
                                }
                                {(goals.current || []).filter(g => !selectedAssignments.find(a => a.goal_id === g.id)).length === 0 && (
                                    <p style={{ padding: 12, fontSize: 13, color: '#aaa', margin: 0 }}>All goals assigned for this day.</p>
                                )}
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
                    {(goals.longTerm || []).map(goal => (
                        <div key={goal.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 14 }}>
                            <p style={{ margin: '0 0 6px', fontWeight: 500, fontSize: 14 }}>{goal.text}</p>
                            <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{goal.category}</p>
                            {goal.motivation && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#666', fontStyle: 'italic' }}>{goal.motivation}</p>}
                        </div>
                    ))}
                    {(goals.longTerm || []).length === 0 && (
                        <p style={{ fontSize: 13, color: '#aaa' }}>No long term goals yet — add some on the Goals page or run an AI session.</p>
                    )}
                </div>
            </div>

        </div>
    )
}