export function calculateScore(tasksCompleted, tasksTotal) {
    if (tasksTotal === 0) return null
    return Math.round((tasksCompleted / tasksTotal) * 100)
}

export function scoreColor(score) {
    if (score === null) return '#ccc'
    if (score >= 70) return '#22c55e'
    if (score >= 40) return '#f97316'
    return '#ef4444'
}

export function scoreLabel(score) {
    if (score === null) return '—'
    if (score >= 70) return 'Good'
    if (score >= 40) return 'Mid'
    return 'Low'
}