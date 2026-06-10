import { useState, useEffect, useMemo, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://staging-n8n-editor.easypanel.spyralinnovation.com.br/webhook'

const STATUSES = [
  { key: 'a_ligar', label: 'A ligar', color: 'var(--primary)' },
  { key: 'em_contato', label: 'Em contato', color: 'var(--blue)' },
  { key: 'fechado', label: 'Fechado', color: 'var(--green)' },
  { key: 'perdido', label: 'Perdido', color: 'var(--red)' },
  { key: 'nao_atende', label: 'Não atende', color: 'var(--gray)' },
  { key: 'numero_invalido', label: 'Número inválido', color: '#e0a458' },
]

const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]))

const OPERACIONAL_COLS = ['a_ligar', 'em_contato']
const FECHADOS_COLS = ['fechado', 'perdido', 'nao_atende', 'numero_invalido']

const NEXT = {
  a_ligar: [
    { to: 'em_contato', label: '📞 Em contato', kind: 'contato' },
    { to: 'perdido', label: '✕ Perdido', kind: 'perdido' },
    { to: 'nao_atende', label: '⊘ Não atende', kind: 'naoatende' },
    { to: 'numero_invalido', label: '⚠ Nº inválido', kind: 'numinvalido' },
  ],
  em_contato: [
    { to: 'fechado', label: '✅ Fechou', kind: 'fechou' },
    { to: 'perdido', label: '✕ Perdido', kind: 'perdido' },
    { to: 'nao_atende', label: '⊘ Não atende', kind: 'naoatende' },
    { to: 'numero_invalido', label: '⚠ Nº inválido', kind: 'numinvalido' },
  ],
  fechado: [{ to: 'a_ligar', label: '↩ Reabrir', kind: 'reabrir' }],
  perdido: [{ to: 'a_ligar', label: '↩ Reabrir', kind: 'reabrir' }],
  nao_atende: [
    { to: 'a_ligar', label: '↩ Reabrir', kind: 'reabrir' },
    { to: 'em_contato', label: '📞 Em contato', kind: 'contato' },
  ],
  numero_invalido: [{ to: 'a_ligar', label: '↩ Reabrir', kind: 'reabrir' }],
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

const isValidPhone = (p) => {
  const digits = String(p || '').replace(/\D/g, '')
  return digits.length === 11
}

const loadOperadores = () => {
  try {
    const raw = localStorage.getItem('kardcrm_operadores')
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((n) => typeof n === 'string' && n.trim()) : []
  } catch {
    return []
  }
}

function Metric({ value, label }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  )
}

function LeadCard({ lead, busy, onStatus, onNumeroOk, onClienteAtendeu }) {
  const actions = NEXT[lead.status] || []
  const phoneValid = isValidPhone(lead.phone)
  const numeroStatus = lead.numero_ok || (phoneValid ? 'desconhecido' : 'invalido')

  return (
    <div className={`card ${busy ? 'card-busy' : ''}`}>
      <div className="card-resp">👤 {lead.responsavel || 'Sem responsável'}</div>
      <div className="card-name">{lead.nome || 'Sem nome'}</div>
      <div className="card-value">
        {brl(lead.valor_liberado)}
        {lead.parcelas ? <span className="card-parcelas"> em {lead.parcelas}x</span> : null}
      </div>
      <div className="card-meta">
        <div>CPF {cpfMask(lead.taxpayer_id)}</div>
        <div>
          📞 {phoneMask(lead.phone)}
          {numeroStatus !== 'desconhecido' && (
            <span className={`numero-status ${numeroStatus}`}>{numeroStatus === 'ok' ? '✅ OK' : '⚠️ Inválido'}</span>
          )}
        </div>
        {lead.score ? <div>Score {lead.score}</div> : null}
      </div>

      <div className="card-controls">
        <label className="atendeu-check">
          <input
            type="checkbox"
            checked={lead.cliente_atendeu || false}
            onChange={(e) => onClienteAtendeu(lead.id, e.target.checked)}
            disabled={busy}
          />
          <span>Cliente atendeu</span>
        </label>

        <label className="numero-select">
          <span>Número</span>
          <select value={lead.numero_ok || ''} onChange={(e) => onNumeroOk(lead.id, e.target.value || null)} disabled={busy}>
            <option value="">Desconhecido</option>
            <option value="ok">✅ OK</option>
            <option value="invalido">⚠️ Inválido</option>
          </select>
        </label>
      </div>

      <div className="card-ago">
        Entrou {ago(lead.created_at)}
        {lead.fechado_em ? <> · fechado {ago(lead.fechado_em)}</> : null}
      </div>

      {actions.length > 0 && (
        <div className="card-actions">
          {actions.map((a) => (
            <button key={a.to} className={`btn-action btn-${a.kind}`} disabled={busy} onClick={() => onStatus(lead.id, a.to)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function RelatorioTab({ leads, metrics }) {
  const statusBreakdown = useMemo(() => {
    return STATUSES.map((st) => ({
      ...st,
      count: leads.filter((l) => l.status === st.key).length,
    }))
  }, [leads])

  const atendidos = leads.filter((l) => l.cliente_atendeu).length
  const numerosOk = leads.filter((l) => l.numero_ok === 'ok').length

  return (
    <div className="relatorio-container">
      <div className="relatorio-section">
        <h3>📊 Métricas Principais</h3>
        <div className="metrics" style={{ marginBottom: '0' }}>
          <Metric value={metrics.total} label="Leads totais" />
          <Metric value={metrics.hoje} label="Entraram hoje" />
          <Metric value={metrics.fila} label="Na fila" />
          <Metric value={metrics.fechados} label="Fechados" />
          <Metric value={metrics.conv} label="Conversão" />
        </div>
      </div>

      <div className="relatorio-section">
        <h3>📞 Atendimento</h3>
        <div className="metrics" style={{ marginBottom: '0' }}>
          <Metric value={atendidos} label="Clientes atendidos" />
          <Metric value={numerosOk} label="Números válidos" />
          <Metric value={`${Math.round((atendidos * 100) / (leads.length || 1))}%`} label="Taxa de contato" />
        </div>
      </div>

      <div className="relatorio-section">
        <h3>📈 Status dos Leads</h3>
        <div className="status-breakdown">
          {statusBreakdown.map((st) => (
            <div key={st.key} className="status-item">
              <div className="status-item-label">{st.label}</div>
              <div className="status-item-value">{st.count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AjustesTab({ operadores, onAdd, onRemove }) {
  const [novo, setNovo] = useState('')

  const add = () => {
    const nome = novo.trim()
    if (!nome) return
    onAdd(nome)
    setNovo('')
  }

  return (
    <div className="ajustes-container">
      <div className="ajustes-section">
        <h3>👥 Equipe do call center</h3>
        <p className="ajustes-hint">
          Cadastre os nomes dos operadores. No topo da tela, cada pessoa seleciona o próprio nome — ele fica registrado como
          responsável nas ações.
        </p>

        <div className="ajustes-add">
          <input
            type="text"
            placeholder="Nome do operador"
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button className="btn-refresh" onClick={add}>
            Adicionar
          </button>
        </div>

        {operadores.length === 0 ? (
          <div className="empty">Nenhum operador cadastrado ainda.</div>
        ) : (
          <ul className="operador-list">
            {operadores.map((nome) => (
              <li key={nome} className="operador-item">
                <span>👤 {nome}</span>
                <button className="operador-remove" onClick={() => onRemove(nome)} title="Remover">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Board({ columns, visible, loading, busyIds, onStatus, onNumeroOk, onClienteAtendeu }) {
  return (
    <div className={`board cols-${columns.length}`}>
      {columns.map((key) => {
        const st = STATUS_MAP[key]
        const items = visible.filter((l) => l.status === key)
        return (
          <div className="column" key={key}>
            <h2>
              <span className="dot" style={{ background: st.color }} />
              {st.label}
              <span className="count">{items.length}</span>
            </h2>
            {loading && <div className="empty">Carregando…</div>}
            {!loading && items.length === 0 && <div className="empty">Nenhum lead aqui</div>}
            {items.map((l) => (
              <LeadCard
                key={l.id}
                lead={l}
                busy={busyIds.has(l.id)}
                onStatus={onStatus}
                onNumeroOk={onNumeroOk}
                onClienteAtendeu={onClienteAtendeu}
              />
            ))}
          </div>
        )
      })}
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
  const [operadores, setOperadores] = useState(loadOperadores)
  const [activeTab, setActiveTab] = useState('operacional')

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

  const selecionarUser = (nome) => {
    setUser(nome)
    if (nome) localStorage.setItem('kardcrm_user', nome)
    else localStorage.removeItem('kardcrm_user')
  }

  const addOperador = (nome) => {
    setOperadores((prev) => {
      if (prev.some((n) => n.toLowerCase() === nome.toLowerCase())) return prev
      const next = [...prev, nome].sort((a, b) => a.localeCompare(b, 'pt-BR'))
      localStorage.setItem('kardcrm_operadores', JSON.stringify(next))
      return next
    })
  }

  const removeOperador = (nome) => {
    setOperadores((prev) => {
      const next = prev.filter((n) => n !== nome)
      localStorage.setItem('kardcrm_operadores', JSON.stringify(next))
      return next
    })
    if (user === nome) selecionarUser('')
  }

  const requireUser = () => {
    if (!user) {
      setError('Selecione seu nome no topo da tela antes de registrar ações. Cadastre operadores na aba Ajustes.')
      return null
    }
    return user
  }

  const setStatus = async (id, status) => {
    const responsavel = requireUser()
    if (!responsavel) return
    setBusyIds((s) => new Set(s).add(id))
    try {
      const lead = leads.find((l) => l.id === id)
      const r = await fetch(`${API_BASE}/kard-crm-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status,
          responsavel,
          numero_ok: lead?.numero_ok,
          cliente_atendeu: lead?.cliente_atendeu,
        }),
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

  const setNumeroOk = async (id, value) => {
    setBusyIds((s) => new Set(s).add(id))
    try {
      const r = await fetch(`${API_BASE}/kard-crm-numero-ok`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, numero_ok: value, responsavel: user || 'indefinido' }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, numero_ok: value } : l)))
      setError('')
    } catch (e) {
      setError(`Erro ao atualizar número (${e.message})`)
    } finally {
      setBusyIds((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
    }
  }

  const setClienteAtendeu = async (id, value) => {
    setBusyIds((s) => new Set(s).add(id))
    try {
      const r = await fetch(`${API_BASE}/kard-crm-cliente-atendeu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, cliente_atendeu: value, responsavel: user || 'indefinido' }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, cliente_atendeu: value } : l)))
      setError('')
    } catch (e) {
      setError(`Erro ao atualizar atendimento (${e.message})`)
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
    const conv = total ? `${Math.round((fechados * 100) / total)}%` : '—'
    return { total, hoje, fila, fechados, conv }
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
        <label className="operador-picker" title="Selecione seu nome">
          <span>👤</span>
          <select value={user} onChange={(e) => selecionarUser(e.target.value)}>
            <option value="">Selecione seu nome…</option>
            {operadores.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-refresh" onClick={load}>
          Atualizar
        </button>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <nav className="tabs">
        <button className={`tab ${activeTab === 'operacional' ? 'tab-active' : ''}`} onClick={() => setActiveTab('operacional')}>
          📊 Operacional
        </button>
        <button className={`tab ${activeTab === 'fechados' ? 'tab-active' : ''}`} onClick={() => setActiveTab('fechados')}>
          🗂️ Fechados
        </button>
        <button className={`tab ${activeTab === 'relatório' ? 'tab-active' : ''}`} onClick={() => setActiveTab('relatório')}>
          📈 Relatório
        </button>
        <button className={`tab ${activeTab === 'ajustes' ? 'tab-active' : ''}`} onClick={() => setActiveTab('ajustes')}>
          ⚙️ Ajustes
        </button>
      </nav>

      {activeTab === 'operacional' && (
        <>
          <div className="metrics">
            <Metric value={metrics.total} label="Leads totais" />
            <Metric value={metrics.hoje} label="Entraram hoje" />
            <Metric value={metrics.fila} label="Na fila (a ligar)" />
            <Metric value={metrics.fechados} label="Fechados" />
            <Metric value={metrics.conv} label="Conversão" />
          </div>

          <Board
            columns={OPERACIONAL_COLS}
            visible={visible}
            loading={loading}
            busyIds={busyIds}
            onStatus={setStatus}
            onNumeroOk={setNumeroOk}
            onClienteAtendeu={setClienteAtendeu}
          />
        </>
      )}

      {activeTab === 'fechados' && (
        <Board
          columns={FECHADOS_COLS}
          visible={visible}
          loading={loading}
          busyIds={busyIds}
          onStatus={setStatus}
          onNumeroOk={setNumeroOk}
          onClienteAtendeu={setClienteAtendeu}
        />
      )}

      {activeTab === 'relatório' && <RelatorioTab leads={leads} metrics={metrics} />}

      {activeTab === 'ajustes' && <AjustesTab operadores={operadores} onAdd={addOperador} onRemove={removeOperador} />}
    </div>
  )
}
