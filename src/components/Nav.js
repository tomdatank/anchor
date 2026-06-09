import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Nav({ session }) {
    const signOut = () => supabase.auth.signOut()

    return (
        <nav style={{ padding: '12px 24px', borderBottom: '1px solid #eee', display: 'flex', gap: 24, alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', marginRight: 8 }}>Anchor</span>
            <Link to="/">Dashboard</Link>
            <Link to="/goals">Goals</Link>
            <Link to="/journal">Journal</Link>
            <Link to="/recurring">Tasks</Link>
            <Link to="/ai-session">AI Session</Link>
            <span style={{ marginLeft: 'auto', fontSize: 14, color: '#888' }}>
                {session.user.email}
                <button onClick={signOut} style={{ marginLeft: 12 }}>Sign out</button>
            </span>
        </nav>
    )
}