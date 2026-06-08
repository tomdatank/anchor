import { useState } from 'react'
import { supabase } from '../supabase'

export default function Auth() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [message, setMessage] = useState('')

    const signIn = async () => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setMessage(error.message)
    }

    const signUp = async () => {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) setMessage(error.message)
        else setMessage('Check your email to confirm your account.')
    }

    return (
        <div style={{ padding: 40, maxWidth: 400 }}>
            <h1>Anchor</h1>
            <input
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ display: 'block', width: '100%', marginBottom: 8, padding: 8 }}
            />
            <input
                placeholder="Password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ display: 'block', width: '100%', marginBottom: 8, padding: 8 }}
            />
            <button onClick={signIn} style={{ marginRight: 8 }}>Sign in</button>
            <button onClick={signUp}>Create account</button>
            {message && <p style={{ color: 'red', marginTop: 8 }}>{message}</p>}
        </div>
    )
}