import { useState, useEffect, useMemo, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://staging-n8n-editor.easypanel.spyralinnovation.com.br/webhook'

const STATUSES = [
  { key: 'a_ligar', label: 'A ligar', color: 'var(--amber)' },
  { key: 'em_contato', label: 'Em contato', color: 'var(--blue)' },
  { key: 'fechado', label: 'Fechado', color: 'var(--green)' },
  { key: 'perdido', label: 'Perdido', color: 'var(--red)' },
  { key: 'nao_atende', label: 'Não atende', color: 'var(--gray)' },
]

const NEXT = {
  a_ligar: [
    { to: 'em_contato', label: '📞 Em contato' },
    { to: 'perdido', label: 'Perdido' },
    { to: 'nao_atende', label: 'Não atende' },
  ],
  em_contato: [
    { to: 'fechado', label: '✅ Fechou' },
    { to: 'perdido', label: 'Perdido' },
    { to: 'nao_atende', label: 'Não atende' },
  ],
  fechado: [{ to: 'a_ligar', label: '↩ Reabrir' }],
  perdido: [{ to: 'a_ligar', label: '↩ Reabrir' }],
  nao_atende: [
    { to: 'a_ligar', label: '↩ Reabrir' },
    { to: 'em_contato', label: '📞 Em contato' },
  ],
}

const brl = (v) => {
  const n = Number(v)
  if (isNaN(n)) return '—'
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const cpfMask = (c) => {
  c = String(c || '').replace(/\D/g, '')
  if (c.length !== 11) return c
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`
}

const phoneMask = (p) => {
  p = String(p || '').replace(/\D/g, '')
  if (p.length === 11) return `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}`
  if (p.length === 10) return `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}`
  return p
}

const ago = (iso) => {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

const fmtDur = (ms) => {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}min`
}

function Metric({ value, label }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  )
}

function LeadCard({ lead, busy, onStatus }) {
  const actions = NEXT[lead.status] || []
  return (
    <div className={`card ${busy ? 'card-busy' : ''}`}>
      <div className="card-name">{lead.nome || 'Sem nome'}</div>
      <div className="card-value">
        {brl(lead.valor_liberado)}
        {lead.parcelas ? <span className="card-parcelas"> em {lead.parcelas}x</span> : null}
      </div>
      <div className="card-meta">
        CPF {cpfMask(lead.taxpayer_id)}
        <br />
        📞 {phoneMask(lead.phone)}
        {lead.score ? <> · score {lead.score}</> : null}
      </div>
      {lead.responsavel && <div className="card-resp">👤 {lead.responsavel}</div>}
      <div className="card-ago">
        Entrou {ago(lead.created_at)}
        {lead.fechado_em ? <> · fechado {ago(lead.fechado_em)}</> : null}
      </div>
      {actions.length > 0 && (
        <div className="card-actions">
          {actions.map((a) => (
            <button key={a.to} disabled={busy} onClick={() => onStatus(lead.id, a.to)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [leads, setLeads] = useState([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyIds, setBusyIds] = useState(new Set())
  const [user, setUser] = useState(() => localStorage.getItem('kardcrm_user') || '')

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/kard-crm-leads`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setLeads((Array.isArray(data) ? data : []).filter((l) => l && l.id))
      setError('')
    } catch (e) {
      setError(`Erro ao carregar leads (${e.message}). Verifique se o workflow kard_crm está publicado no n8n e a credencial do banco automation configurada.`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  const askUser = (force = false) => {
    let u = user
    if (!u || force) {
      u = window.prompt('Seu nome (fica registrado como responsável):', u || '') || u || ''
      if (u) {
        localStorage.setItem('kardcrm_user', u)
        setUser(u)
      }
    }
    return u
  }

  const setStatus = async (id, status) => {
    const responsavel = askUser(false)
    setBusyIds((s) => new Set(s).add(id))
    try {
      const r = await fetch(`${API_BASE}/kard-crm-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, responsavel }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setLeads((ls) =>
        ls.map((l) =>
          l.id === id
            ? {
                ...l,
                status,
                responsavel: responsavel || l.responsavel,
                em_contato_em: status === 'em_contato' && !l.em_contato_em ? new Date().toISOString() : l.em_contato_em,
                fechado_em: status === 'fechado' && !l.fechado_em ? new Date().toISOString() : l.fechado_em,
              }
            : l
        )
      )
      setError('')
    } catch (e) {
      setError(`Erro ao atualizar status (${e.message})`)
    } finally {
      setBusyIds((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
    }
  }

  const visible = useMemo(() => {
    if (!query) return leads
    const s = query.toLowerCase()
    const dig = s.replace(/\D/g, '')
    return leads.filter(
      (l) =>
        String(l.nome || '').toLowerCase().includes(s) ||
        (dig.length > 0 && (String(l.taxpayer_id || '').includes(dig) || String(l.phone || '').includes(dig)))
    )
  }, [leads, query])

  const metrics = useMemo(() => {
    const total = leads.length
    const fechados = leads.filter((l) => l.status === 'fechado').length
    const fila = leads.filter((l) => l.status === 'a_ligar').length
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const hoje = leads.filter((l) => l.created_at && new Date(l.created_at) >= startOfDay).length
    const contatos = leads.filter((l) => l.em_contato_em && l.created_at)
    const tMedio = contatos.length
      ? fmtDur(contatos.reduce((acc, l) => acc + (new Date(l.em_contato_em) - new Date(l.created_at)), 0) / contatos.length)
      : '—'
    const conv = total ? `${Math.round((fechados * 100) / total)}%` : '—'
    return { total, hoje, fila, fechados, conv, tMedio }
  }, [leads])

  return (
    <div className="app">
      <header>
        <div>
          <div className="logo">
            KARD<b>CRM</b>
          </div>
          <div className="sub">Leads do motor de score · atualiza a cada 60s</div>
        </div>
        <div className="spacer" />
        <input
          type="search"
          placeholder="Buscar nome, CPF ou telefone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="user-chip" onClick={() => askUser(true)} title="Clique para trocar o nome">
          👤 <b>{user || 'definir nome'}</b>
        </button>
        <button className="btn-refresh" onClick={load}>
          Atualizar
        </button>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="metrics">
        <Metric value={metrics.total} label="Leads totais" />
        <Metric value={metrics.hoje} label="Entraram hoje" />
        <Metric value={metrics.fila} label="Na fila (a ligar)" />
        <Metric value={metrics.fechados} label="Fechados" />
        <Metric value={metrics.conv} label="Conversão" />
        <Metric value={metrics.tMedio} label="Tempo médio até contato" />
      </div>

      <div className="board">
        {STATUSES.map((st) => {
          const items = visible.filter((l) => l.status === st.key)
          return (
            <div className="column" key={st.key}>
              <h2>
                <span className="dot" style={{ background: st.color }} />
                {st.label}
                <span className="count">{items.length}</span>
              </h2>
              {loading && <div className="empty">Carregando…</div>}
              {!loading && items.length === 0 && <div className="empty">Nenhum lead aqui</div>}
              {items.map((l) => (
                <LeadCard key={l.id} lead={l} busy={busyIds.has(l.id)} onStatus={setStatus} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
