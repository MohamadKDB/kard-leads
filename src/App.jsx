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

const TOKEN_KEY = 'kardcrm_token'
const SESSION_KEY = 'kardcrm_sessao'

const loadSession = () => {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const raw = localStorage.getItem(SESSION_KEY)
    if (!token || !raw) return null
    const s = JSON.parse(raw)
    if (s.expira && new Date(s.expira).getTime() < Date.now()) return null
    return { token, nome: s.nome, papel: s.papel, expira: s.expira }
  } catch {
    return null
  }
}

const saveSession = (row) => {
  localStorage.setItem(TOKEN_KEY, row.token)
  localStorage.setItem(SESSION_KEY, JSON.stringify({ nome: row.nome, papel: row.papel, expira: row.expira }))
}

const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(SESSION_KEY)
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {}
  if (token) headers['x-crm-token'] = token
  if (body) headers['Content-Type'] = 'application/json'
  const r = await fetch(`${API_BASE}/${path}`, {
    method,
    headers,
    cache: 'no-store',
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const txt = await r.text()
  if (!txt) return null
  try {
    return JSON.parse(txt)
  } catch {
    return null
  }
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

function Login({ onLogin }) {
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErro('')
    try {
      const data = await api('kard-crm-login', { method: 'POST', body: { nome: nome.trim(), senha } })
      const row = Array.isArray(data) ? data[0] : data
      if (row && row.token) {
        onLogin(row)
      } else {
        setErro('Nome ou senha inválidos.')
      }
    } catch (err) {
      setErro(`Não foi possível entrar (${err.message}).`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          KARD<b>CRM</b>
        </div>
        <div className="login-sub">Entre com seu usuário e senha</div>
        <input
          type="text"
          placeholder="Usuário"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
        />
        <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} />
        {erro && <div className="login-erro">{erro}</div>}
        <button type="submit" className="btn-refresh" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

function TrocarSenhaModal({ token, onClose }) {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (nova.length < 4) {
      setErro('A nova senha precisa ter pelo menos 4 caracteres.')
      return
    }
    setBusy(true)
    setErro('')
    try {
      const data = await api('kard-crm-senha', { method: 'POST', token, body: { senha_atual: atual, senha_nova: nova } })
      const row = Array.isArray(data) ? data[0] : data
      if (row && row.id) {
        window.alert('Senha alterada com sucesso.')
        onClose()
      } else {
        setErro('Senha atual incorreta.')
      }
    } catch (err) {
      setErro(`Erro ao trocar senha (${err.message}).`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Trocar minha senha</h3>
        <input type="password" placeholder="Senha atual" value={atual} onChange={(e) => setAtual(e.target.value)} autoFocus />
        <input type="password" placeholder="Nova senha" value={nova} onChange={(e) => setNova(e.target.value)} />
        {erro && <div className="login-erro">{erro}</div>}
        <div className="modal-acoes">
          <button type="button" className="btn-logout" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-refresh" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
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

function UsuariosTab({ token, onError }) {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [papel, setPapel] = useState('operador')
  const [busy, setBusy] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api('kard-crm-users', { token })
      setUsuarios((Array.isArray(data) ? data : []).filter((u) => u && u.id))
    } catch (e) {
      onError(`Erro ao listar usuários (${e.message})`)
    } finally {
      setLoading(false)
    }
  }, [token, onError])

  useEffect(() => {
    carregar()
  }, [carregar])

  const criar = async () => {
    if (busy) return
    if (!nome.trim() || senha.length < 4) {
      onError('Informe um nome e uma senha de pelo menos 4 caracteres.')
      return
    }
    setBusy(true)
    try {
      const data = await api('kard-crm-users-create', { method: 'POST', token, body: { nome: nome.trim(), senha, papel } })
      const row = Array.isArray(data) ? data[0] : data
      if (row && row.id) {
        setNome('')
        setSenha('')
        setPapel('operador')
        onError('')
        carregar()
      } else {
        onError('Não foi possível criar (esse nome já existe?).')
      }
    } catch (e) {
      onError(`Erro ao criar usuário (${e.message})`)
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (u) => {
    setBusy(true)
    try {
      await api('kard-crm-users-toggle', { method: 'POST', token, body: { id: u.id, ativo: !u.ativo } })
      carregar()
    } catch (e) {
      onError(`Erro ao atualizar usuário (${e.message})`)
    } finally {
      setBusy(false)
    }
  }

  const resetar = async (u) => {
    const nova = window.prompt(`Nova senha para ${u.nome} (mínimo 4 caracteres):`)
    if (nova == null) return
    if (nova.length < 4) {
      onError('A senha precisa ter pelo menos 4 caracteres.')
      return
    }
    setBusy(true)
    try {
      const data = await api('kard-crm-users-reset', { method: 'POST', token, body: { id: u.id, senha: nova } })
      const row = Array.isArray(data) ? data[0] : data
      if (row && row.id) onError('')
      else onError('Não foi possível redefinir a senha.')
    } catch (e) {
      onError(`Erro ao redefinir senha (${e.message})`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ajustes-container">
      <div className="ajustes-section">
        <h3>👥 Usuários</h3>
        <p className="ajustes-hint">
          Crie usuários para a equipe. Operadores veem só a fila e os leads que assumiram. Master vê tudo e gerencia usuários.
        </p>

        <div className="ajustes-add">
          <input type="text" placeholder="Nome de usuário" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} />
          <select className="papel-select" value={papel} onChange={(e) => setPapel(e.target.value)}>
            <option value="operador">Operador</option>
            <option value="master">Master</option>
          </select>
          <button className="btn-refresh" onClick={criar} disabled={busy}>
            Criar
          </button>
        </div>

        {loading ? (
          <div className="empty">Carregando…</div>
        ) : usuarios.length === 0 ? (
          <div className="empty">Nenhum usuário cadastrado ainda.</div>
        ) : (
          <ul className="operador-list">
            {usuarios.map((u) => (
              <li key={u.id} className="operador-item">
                <span>
                  👤 {u.nome}
                  <span className={`papel-badge ${u.papel}`}>{u.papel === 'master' ? 'Master' : 'Operador'}</span>
                  {!u.ativo && <span className="papel-badge inativo">Inativo</span>}
                </span>
                <span className="usuario-acoes">
                  <button className="btn-mini" onClick={() => resetar(u)} disabled={busy}>
                    Redefinir senha
                  </button>
                  <button className="btn-mini" onClick={() => toggle(u)} disabled={busy}>
                    {u.ativo ? 'Desativar' : 'Reativar'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(loadSession)
  const [leads, setLeads] = useState([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyIds, setBusyIds] = useState(new Set())
  const [activeTab, setActiveTab] = useState('operacional')
  const [trocarSenha, setTrocarSenha] = useState(false)

  const isMaster = session?.papel === 'master'

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
    setLeads([])
    setActiveTab('operacional')
  }, [])

  const load = useCallback(async () => {
    if (!session) return
    try {
      const data = await api('kard-crm-leads', { token: session.token })
      setLeads((Array.isArray(data) ? data : []).filter((l) => l && l.id))
      setError('')
    } catch (e) {
      setError(`Erro ao carregar leads (${e.message}).`)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (!session) return
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load, session])

  useEffect(() => {
    if (!session?.expira) return
    const ms = new Date(session.expira).getTime() - Date.now()
    if (ms <= 0) {
      logout()
      return
    }
    const t = setTimeout(logout, ms)
    return () => clearTimeout(t)
  }, [session, logout])

  const onLogin = (row) => {
    saveSession(row)
    setSession({ token: row.token, nome: row.nome, papel: row.papel, expira: row.expira })
    setLoading(true)
  }

  const setStatus = async (id, status) => {
    setBusyIds((s) => new Set(s).add(id))
    try {
      await api('kard-crm-status', {
        method: 'POST',
        token: session.token,
        body: { id, status, responsavel: session.nome },
      })
      setLeads((ls) =>
        ls.map((l) =>
          l.id === id
            ? {
                ...l,
                status,
                responsavel: session.nome,
                em_contato_em: status === 'em_contato' && !l.em_contato_em ? new Date().toISOString() : l.em_contato_em,
                fechado_em: status === 'fechado' && !l.fechado_em ? new Date().toISOString() : l.fechado_em,
              }
            : l
        )
      )
      setError('')
      load()
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
      await api('kard-crm-numero-ok', { method: 'POST', token: session.token, body: { id, numero_ok: value } })
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, numero_ok: value } : l)))
      setError('')
      load()
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
      await api('kard-crm-cliente-atendeu', { method: 'POST', token: session.token, body: { id, cliente_atendeu: value } })
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, cliente_atendeu: value } : l)))
      setError('')
      load()
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

  if (!session) return <Login onLogin={onLogin} />

  return (
    <div className="app">
      <header>
        <div>
          <div className="logo">
            KARD<b>CRM</b>
          </div>
          <div className="sub">Leads do motor de score · atualiza a cada 10s</div>
        </div>
        <div className="spacer" />
        <input
          type="search"
          placeholder="Buscar nome, CPF ou telefone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="user-chip">
          <span>👤 {session.nome}</span>
          <span className={`papel-badge ${session.papel}`}>{isMaster ? 'Master' : 'Operador'}</span>
        </div>
        <button className="btn-refresh" onClick={load}>
          Atualizar
        </button>
        <button className="btn-senha" onClick={() => setTrocarSenha(true)}>
          Trocar senha
        </button>
        <button className="btn-logout" onClick={logout}>
          Sair
        </button>
      </header>

      {trocarSenha && <TrocarSenhaModal token={session.token} onClose={() => setTrocarSenha(false)} />}

      {error && <div className="error-banner">{error}</div>}

      <nav className="tabs">
        <button className={`tab ${activeTab === 'operacional' ? 'tab-active' : ''}`} onClick={() => setActiveTab('operacional')}>
          📊 Operacional
        </button>
        <button className={`tab ${activeTab === 'fechados' ? 'tab-active' : ''}`} onClick={() => setActiveTab('fechados')}>
          🗂️ Fechados
        </button>
        {isMaster && (
          <button className={`tab ${activeTab === 'relatório' ? 'tab-active' : ''}`} onClick={() => setActiveTab('relatório')}>
            📈 Relatório
          </button>
        )}
        {isMaster && (
          <button className={`tab ${activeTab === 'usuarios' ? 'tab-active' : ''}`} onClick={() => setActiveTab('usuarios')}>
            👥 Usuários
          </button>
        )}
      </nav>

      {activeTab === 'operacional' && (
        <>
          <div className="metrics">
            <Metric value={metrics.total} label={isMaster ? 'Leads totais' : 'Meus leads'} />
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

      {activeTab === 'relatório' && isMaster && <RelatorioTab leads={leads} metrics={metrics} />}

      {activeTab === 'usuarios' && isMaster && <UsuariosTab token={session.token} onError={setError} />}
    </div>
  )
}
