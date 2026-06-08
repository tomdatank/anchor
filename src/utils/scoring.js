// Scoring weights — we'll add screentime here later
const WEIGHTS = {
    goalsCompleted: 70,   // 70% of score from goals checked off
    habitBonus: 30        // 30% from daily habits specifically
}

export function calculateScore(goalsCompleted, goalsTotal, habitsCompleted, habitsTotal) {
    if (goalsTotal === 0 && habitsTotal === 0) return null // no data yet

    const goalScore = goalsTotal > 0
        ? (goalsCompleted / goalsTotal) * WEIGHTS.goalsCompleted
        : 0

    const habitScore = habitsTotal > 0
        ? (habitsCompleted / habitsTotal) * WEIGHTS.habitBonus
        : 0

    return Math.round(goalScore + habitScore)
}

export function scoreColor(score) {
    if (score === null) return '#ccc'
    if (score >= 70) return '#22c55e'  // green
    if (score >= 40) return '#f97316'  // orange
    return '#ef4444'                    // red
}

export function scoreLabel(score) {
    if (score === null) return '—'
    if (score >= 70) return 'Good'
    if (score >= 40) return 'Mid'
    return 'Low'
}