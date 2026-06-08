import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function Journal({ session }) {
    const [entries, setEntries] = useState([])
    const [text, setText] = useState('')

    useEffect(() => { loadEntries() }, [])

    const loadEntries = async () => {
        const { data } = await supabase.from('journal_entries').select('*').order('created_at', { ascending: false })
        setEntries(data || [])
    }

    const save = async () => {
        if (!text.trim()) return
        await supabase.from('journal_entries').insert({ content: text })
        setText('')
        loadEntries()
    }

    const remove = async (id) => {
        if (!window.confirm('Delete this entry?')) return
        await supabase.from('journal_entries').delete().eq('id', id)
        loadEntries()
    }

    return (
        <div style={{ padding: 40, maxWidth: 700 }}>
            <h2>Journal</h2>
            <div style={{ marginBottom: 24 }}>
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="What did you do today?"
                    style={{ display: 'block', width: '100%', minHeight: 100, padding: 12, marginBottom: 8, fontSize: 15 }}
                />
                <button onClick={save}>Save entry</button>
            </div>
            <div>
                {entries.map(e => (
                    <div key={e.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <p style={{ margin: 0, flex: 1 }}>{e.content}</p>
                            <button onClick={() => remove(e.id)} style={{ color: 'red', marginLeft: 12, flexShrink: 0 }}>Delete</button>
                        </div>
                        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#aaa' }}>{new Date(e.created_at).toLocaleString()}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}