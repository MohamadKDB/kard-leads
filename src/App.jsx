import { useState, useEffect, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://staging-n8n-editor.easypanel.spyralinnovation.com.br/webhook'

const STATUSES = [
  { key: 'a_ligar', label: 'A ligar', color: 'var(--primary)' },
  { key: 'em_contato', label: 'Em contato', color: 'var(--blue)' },
  { key: 'link_enviado', label: 'Link enviado', color: '#9b8cff' },
  { key: 'fechado', label: 'Pago', color: 'var(--green)' },
  { key: 'perdido', label: 'Perdido', color: 'var(--red)' },
  { key: 'nao_atende', label: 'Não atende', color: 'var(--gray)' },
  { key: 'numero_invalido', label: 'Número inválido', color: '#e0a458' },
]

const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]))

const OPERACIONAL_COLS = ['a_ligar', 'em_contato']
const FECHADOS_COLS = ['link_enviado', 'fechado', 'perdido', 'nao_atende', 'numero_invalido']

const NEXT = {
  a_ligar: [
    { to: 'em_contato', label: '📞 Em contato', kind: 'contato' },
    { to: 'perdido', label: '✕ Perdido', kind: 'perdido' },
    { to: 'nao_atende', label: '⊘ Não atende', kind: 'naoatende' },
    { to: 'numero_invalido', label: '⚠ Nº inválido', kind: 'numinvalido' },
  ],
  em_contato: [
    { to: 'link_enviado', label: '🔗 Link enviado', kind: 'fechou' },
    { to: 'perdido', label: '✕ Perdido', kind: 'perdido' },
    { to: 'nao_atende', label: '⊘ Não atende', kind: 'naoatende' },
    { to: 'numero_invalido', label: '⚠ Nº inválido', kind: 'numinvalido' },
  ],
  link_enviado: [
    { to: 'em_contato', label: '↩ Voltar p/ contato', kind: 'reabrir' },
    { to: 'perdido', label: '✕ Perdido', kind: 'perdido' },
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
const TEMA_KEY = 'kardleads_tema'

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
          KARD<b>LEADS</b>
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

const CANAIS = [
  { key: 'canal_telefone', label: '📞 Telefone' },
  { key: 'canal_rcs', label: '💬 RCS' },
  { key: 'canal_whatsapp', label: '🟢 WhatsApp' },
]

function LeadCard({ lead, busy, onStatus, onNumeroOk, onCanal }) {
  const actions = NEXT[lead.status] || []
  const phoneValid = isValidPhone(lead.phone)
  const numeroStatus = lead.numero_ok || (phoneValid ? 'desconhecido' : 'invalido')

  const toggleCanal = (key) =>
    onCanal(lead.id, {
      canal_telefone: !!lead.canal_telefone,
      canal_rcs: !!lead.canal_rcs,
      canal_whatsapp: !!lead.canal_whatsapp,
      [key]: !lead[key],
    })

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
        <label className="numero-select">
          <span>Número</span>
          <select value={lead.numero_ok || ''} onChange={(e) => onNumeroOk(lead.id, e.target.value || null)} disabled={busy}>
            <option value="">Desconhecido</option>
            <option value="ok">✅ OK</option>
            <option value="invalido">⚠️ Inválido</option>
          </select>
        </label>

        <div className="canais-row">
          <span className="canais-label">Canais</span>
          <div className="canais-chips">
            {CANAIS.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`canal-chip ${lead[c.key] ? 'on' : ''}`}
                onClick={() => toggleCanal(c.key)}
                disabled={busy}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
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

function Board({ columns, visible, loading, busyIds, onStatus, onNumeroOk, onCanal }) {
  return (
    <div className={`board cols-${columns.length}`}>
      {columns.map((key) => {
        const st = STATUS_MAP[key]
        const items = visible.filter((l) => l.status === key)
        if (key === 'em_contato') {
          items.sort((a, b) => new Date(a.em_contato_em || 0) - new Date(b.em_contato_em || 0))
        }
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
                onCanal={onCanal}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const DATE_PRESETS = [
  { key: 'hoje', label: 'Hoje', from: () => startOfToday(), to: () => null },
  { key: '7d', label: '7 dias', from: () => Date.now() - 7 * 86400000, to: () => null },
  { key: '30d', label: '30 dias', from: () => Date.now() - 30 * 86400000, to: () => null },
  { key: 'mes', label: 'Este mês', from: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(), to: () => null },
  { key: 'tudo', label: 'Tudo', from: () => null, to: () => null },
]

const fmtDur = (ms) => {
  if (ms == null) return '—'
  const min = Math.round(ms / 60000)
  if (min < 1) return '< 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const mm = min % 60
  if (h < 24) return mm ? `${h}h ${mm}min` : `${h}h`
  const d = Math.floor(h / 24)
  const hh = h % 24
  return hh ? `${d}d ${hh}h` : `${d}d`
}

const pct = (n, d) => (d ? Math.round((n * 100) / d) : 0)

const pctStr = (n, d) => {
  if (!d) return '0%'
  const raw = (n * 100) / d
  if (raw > 0 && raw < 1) return '<1%'
  if (raw > 99 && raw < 100) return '>99%'
  return `${Math.round(raw)}%`
}

function computeReport(leads) {
  const sum = (arr, f) => arr.reduce((a, l) => a + (Number(l[f]) || 0), 0)
  const total = leads.length
  const fila = leads.filter((l) => l.status === 'a_ligar')
  const emContato = leads.filter((l) => l.status === 'em_contato')
  const linkEnviado = leads.filter((l) => l.status === 'link_enviado')
  const fechados = leads.filter((l) => l.status === 'fechado')
  const perdidos = leads.filter((l) => l.status === 'perdido')
  const naoAtende = leads.filter((l) => l.status === 'nao_atende')
  const trabalhados = total - fila.length
  // "Atendeu" agora é calculado pela coluna do lead: só quem passou por
  // Em contato / Link enviado / Pago garantiu que a pessoa atendeu.
  const ATENDEU = (l) =>
    l.status === 'em_contato' || l.status === 'link_enviado' || l.status === 'fechado'
  const atendidos = leads.filter(ATENDEU)

  const valorFechado = sum(fechados, 'valor_liberado')
  const valorLinkEnviado = sum(linkEnviado, 'valor_liberado')
  const valorPipeline = sum([...fila, ...emContato, ...linkEnviado], 'valor_liberado')
  const valorPerdido = sum(perdidos, 'valor_liberado')
  const ticketMedio = fechados.length ? valorFechado / fechados.length : 0

  const avgMs = (arr, fEnd, fStart) => {
    const xs = arr
      .map((l) => new Date(l[fEnd]).getTime() - new Date(l[fStart]).getTime())
      .filter((x) => x > 0 && isFinite(x))
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  }
  const tContato = avgMs(leads.filter((l) => l.em_contato_em && l.created_at), 'em_contato_em', 'created_at')
  const tFecho = avgMs(fechados.filter((l) => l.fechado_em && l.created_at), 'fechado_em', 'created_at')

  const parados = fila.filter((l) => l.created_at && Date.now() - new Date(l.created_at).getTime() > 2 * 86400000).length

  const ops = {}
  for (const l of leads) {
    const r = l.responsavel
    if (!r) continue
    ops[r] = ops[r] || { nome: r, assumidos: 0, atendidos: 0, links: 0, fechados: 0, valor: 0 }
    ops[r].assumidos++
    if (ATENDEU(l)) ops[r].atendidos++
    if (l.status === 'link_enviado') ops[r].links++
    if (l.status === 'fechado') {
      ops[r].fechados++
      ops[r].valor += Number(l.valor_liberado) || 0
    }
  }
  const operadores = Object.values(ops).sort((a, b) => b.valor - a.valor || b.fechados - a.fechados || b.links - a.links)

  const canalDefs = [
    { key: 'canal_telefone', label: '📞 Telefone' },
    { key: 'canal_rcs', label: '💬 RCS' },
    { key: 'canal_whatsapp', label: '🟢 WhatsApp' },
  ]
  const canais = canalDefs.map((c) => {
    const used = leads.filter((l) => l[c.key])
    const fch = used.filter((l) => l.status === 'fechado')
    return {
      label: c.label,
      usados: used.length,
      atendidos: used.filter(ATENDEU).length,
      links: used.filter((l) => l.status === 'link_enviado').length,
      fechados: fch.length,
      valor: sum(fch, 'valor_liberado'),
    }
  })
  const semCanal = leads.filter(
    (l) => l.status !== 'a_ligar' && !l.canal_telefone && !l.canal_rcs && !l.canal_whatsapp
  ).length

  return {
    total,
    trabalhados,
    atendidos: atendidos.length,
    fila: fila.length,
    emContato: emContato.length,
    linkEnviado: linkEnviado.length,
    fechados: fechados.length,
    perdidos: perdidos.length,
    naoAtende: naoAtende.length,
    numerosInvalidos: leads.filter((l) => l.numero_ok === 'invalido').length,
    valorFechado,
    valorLinkEnviado,
    valorPipeline,
    valorPerdido,
    ticketMedio,
    convGeral: pctStr(fechados.length, total),
    convAtendidos: pctStr(fechados.length, atendidos.length),
    taxaAtendimento: pctStr(atendidos.length, trabalhados),
    taxaFechamento: pctStr(fechados.length, trabalhados),
    tContato,
    tFecho,
    parados,
    operadores,
    canais,
    semCanal,
  }
}

function FunnelRow({ label, value, total, color }) {
  const w = total ? Math.max(4, Math.round((value * 100) / total)) : 0
  return (
    <div className="funnel-row">
      <div className="funnel-label">{label}</div>
      <div className="funnel-bar-wrap">
        <div className="funnel-bar" style={{ width: `${w}%`, background: color }}>
          <span className="funnel-bar-val">{value}</span>
        </div>
      </div>
      <div className="funnel-pct">{pctStr(value, total)}</div>
    </div>
  )
}

function exportarExcel(leads) {
  const rows = leads.map((l) => ({
    Nome: l.nome || '',
    CPF: cpfMask(l.taxpayer_id),
    Telefone: phoneMask(l.phone),
    'Valor liberado': Number(l.valor_liberado) || 0,
    Parcelas: l.parcelas || '',
    Score: l.score || '',
    Status: STATUS_MAP[l.status]?.label || l.status,
    Responsável: l.responsavel || '',
    Atendeu: ['em_contato', 'link_enviado', 'fechado'].includes(l.status) ? 'Sim' : 'Não',
    Número: l.numero_ok === 'ok' ? 'OK' : l.numero_ok === 'invalido' ? 'Inválido' : '',
    Canais: [l.canal_telefone && 'Telefone', l.canal_rcs && 'RCS', l.canal_whatsapp && 'WhatsApp']
      .filter(Boolean)
      .join(', '),
    'Entrou em': l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : '',
    'Em contato em': l.em_contato_em ? new Date(l.em_contato_em).toLocaleString('pt-BR') : '',
    'Fechado em': l.fechado_em ? new Date(l.fechado_em).toLocaleString('pt-BR') : '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [28, 16, 16, 14, 9, 7, 14, 16, 14, 10, 22, 18, 18, 18].map((wch) => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leads')
  XLSX.writeFile(wb, `kardleads-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function RelatorioTab({ leads, scopeNome }) {
  const [preset, setPreset] = useState('tudo')
  const [custom, setCustom] = useState({ from: '', to: '' })

  const scoped = useMemo(
    () => (scopeNome ? leads.filter((l) => l.responsavel === scopeNome) : leads),
    [leads, scopeNome]
  )

  const range = useMemo(() => {
    if (custom.from || custom.to) {
      const from = custom.from ? new Date(custom.from + 'T00:00:00').getTime() : null
      const to = custom.to ? new Date(custom.to + 'T23:59:59').getTime() : null
      return { from, to }
    }
    const p = DATE_PRESETS.find((x) => x.key === preset) || DATE_PRESETS[4]
    return { from: p.from(), to: p.to() }
  }, [preset, custom])

  const periodoLabel = useMemo(() => {
    const fmt = (t) => new Date(t).toLocaleDateString('pt-BR')
    if (range.from && range.to) return `${fmt(range.from)} a ${fmt(range.to)}`
    if (range.from) return `desde ${fmt(range.from)}`
    return 'Todo o período'
  }, [range])

  const filtered = useMemo(() => {
    if (range.from == null && range.to == null) return scoped
    return scoped.filter((l) => {
      if (!l.created_at) return false
      const t = new Date(l.created_at).getTime()
      if (range.from != null && t < range.from) return false
      if (range.to != null && t > range.to) return false
      return true
    })
  }, [scoped, range])

  const r = useMemo(() => computeReport(filtered), [filtered])

  const statusBreakdown = STATUSES.map((st) => ({
    ...st,
    count: filtered.filter((l) => l.status === st.key).length,
  }))

  const gerarPDF = () => window.print()

  return (
    <div className="relatorio-container">
      <div className="print-header">
        <div className="print-logo">
          KARD<b>LEADS</b>
        </div>
        <div className="print-title">
          <div>{scopeNome ? `Meu Desempenho · ${scopeNome}` : 'Relatório de Performance Comercial'}</div>
          <div className="print-meta">
            Período: {periodoLabel} · Gerado em {new Date().toLocaleString('pt-BR')}
          </div>
        </div>
      </div>

      <div className="relatorio-toolbar no-print">
        <div className="date-filter">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              className={`date-chip ${!custom.from && !custom.to && preset === p.key ? 'date-chip-active' : ''}`}
              onClick={() => {
                setPreset(p.key)
                setCustom({ from: '', to: '' })
              }}
            >
              {p.label}
            </button>
          ))}
          <span className="date-sep">|</span>
          <input
            type="date"
            value={custom.from}
            onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
          />
          <span className="date-sep">→</span>
          <input
            type="date"
            value={custom.to}
            onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
          />
        </div>
        <div className="toolbar-acoes">
          <button className="btn-excel" onClick={() => exportarExcel(filtered)}>
            📥 Exportar Excel
          </button>
          <button className="btn-pdf" onClick={gerarPDF}>
            🖨️ Gerar PDF
          </button>
        </div>
      </div>

      <div className="periodo-tag">📅 {periodoLabel} · {r.total} leads</div>

      <div className="relatorio-section">
        <h3>💰 Visão Executiva</h3>
        <div className="kpi-grid">
          <div className="kpi kpi-hl">
            <div className="kpi-value">{brl(r.valorFechado)}</div>
            <div className="kpi-label">Valor fechado</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{brl(r.valorPipeline)}</div>
            <div className="kpi-label">Pipeline em aberto</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{brl(r.ticketMedio)}</div>
            <div className="kpi-label">Ticket médio</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{r.convGeral}</div>
            <div className="kpi-label">Conversão geral</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{r.linkEnviado}</div>
            <div className="kpi-label">Links enviados</div>
            <div className="kpi-hint">{brl(r.valorLinkEnviado)} em aberto</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{brl(r.valorPerdido)}</div>
            <div className="kpi-label">Valor perdido</div>
          </div>
        </div>
      </div>

      <div className="relatorio-section">
        <h3>🔻 Funil de Conversão</h3>
        <div className="funnel">
          <FunnelRow label="Leads recebidos" value={r.total} total={r.total} color="var(--primary)" />
          <FunnelRow label="Trabalhados" value={r.trabalhados} total={r.total} color="var(--blue)" />
          <FunnelRow label="Atenderam" value={r.atendidos} total={r.total} color="#7c6fe0" />
          <FunnelRow label="Link enviado" value={r.linkEnviado} total={r.total} color="#9b8cff" />
          <FunnelRow label="Fechados" value={r.fechados} total={r.total} color="var(--green)" />
        </div>
      </div>

      <div className="relatorio-section">
        <h3>📞 Eficiência de Atendimento</h3>
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-value">{r.taxaAtendimento}</div>
            <div className="kpi-label">Taxa de atendimento</div>
            <div className="kpi-hint">{r.atendidos} de {r.trabalhados} trabalhados</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{r.convAtendidos}</div>
            <div className="kpi-label">Conversão s/ atendidos</div>
            <div className="kpi-hint">{r.fechados} de {r.atendidos} atendidos</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{r.taxaFechamento}</div>
            <div className="kpi-label">Taxa de fechamento</div>
            <div className="kpi-hint">{r.fechados} de {r.trabalhados} trabalhados</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{r.numerosInvalidos}</div>
            <div className="kpi-label">Números inválidos</div>
          </div>
        </div>
      </div>

      <div className="relatorio-section">
        <h3>⏱️ Velocidade (SLA)</h3>
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-value">{fmtDur(r.tContato)}</div>
            <div className="kpi-label">Até 1º contato</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{fmtDur(r.tFecho)}</div>
            <div className="kpi-label">Até fechamento</div>
          </div>
          <div className="kpi">
            <div className={`kpi-value ${r.parados > 0 ? 'kpi-warn' : ''}`}>{r.parados}</div>
            <div className="kpi-label">Parados na fila +2d</div>
          </div>
        </div>
      </div>

      {!scopeNome && (
      <div className="relatorio-section">
        <h3>🏆 Desempenho por Operador</h3>
        {r.operadores.length === 0 ? (
          <div className="empty">Nenhum lead atribuído no período.</div>
        ) : (
          <div className="table-scroll">
          <table className="rank-table">
            <thead>
              <tr>
                <th>Operador</th>
                <th>Assumidos</th>
                <th>Atenderam</th>
                <th>Links</th>
                <th>Fechados</th>
                <th>Conversão</th>
                <th>Valor fechado</th>
              </tr>
            </thead>
            <tbody>
              {r.operadores.map((o) => (
                <tr key={o.nome}>
                  <td>{o.nome}</td>
                  <td>{o.assumidos}</td>
                  <td>{o.atendidos}</td>
                  <td>{o.links}</td>
                  <td>{o.fechados}</td>
                  <td>{pctStr(o.fechados, o.assumidos)}</td>
                  <td>{brl(o.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
      )}

      <div className="relatorio-section">
        <h3>📡 Canais de Contato</h3>
        <div className="table-scroll">
        <table className="rank-table">
          <thead>
            <tr>
              <th>Canal</th>
              <th>Usado em</th>
              <th>Atenderam</th>
              <th>Link enviado</th>
              <th>Fechados</th>
              <th>Conversão</th>
              <th>Valor fechado</th>
            </tr>
          </thead>
          <tbody>
            {r.canais.map((c) => (
              <tr key={c.label}>
                <td>{c.label}</td>
                <td>{c.usados}</td>
                <td>{c.atendidos}</td>
                <td>{c.links}</td>
                <td>{c.fechados}</td>
                <td>{pctStr(c.fechados, c.usados)}</td>
                <td>{brl(c.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="kpi-hint" style={{ marginTop: 10 }}>
          Um lead pode usar mais de um canal, então a soma pode passar do total. {r.semCanal} lead(s) trabalhado(s) sem canal marcado.
        </div>
      </div>

      <div className="relatorio-section">
        <h3>📊 Distribuição por Status</h3>
        <div className="status-breakdown">
          {statusBreakdown.map((st) => (
            <div key={st.key} className="status-item">
              <div className="status-item-label">{st.label}</div>
              <div className="status-item-value">{st.count}</div>
              <div className="status-item-pct">{pctStr(st.count, r.total)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function UsuariosTab({ token, onError, currentNome }) {
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

  const excluir = async (u) => {
    if (!window.confirm(`Excluir o usuário "${u.nome}"? Esta ação não pode ser desfeita.`)) return
    setBusy(true)
    try {
      const data = await api('kard-crm-users-delete', { method: 'POST', token, body: { id: u.id } })
      const row = Array.isArray(data) ? data[0] : data
      if (row && row.id) {
        onError('')
        carregar()
      } else {
        onError('Não foi possível excluir esse usuário.')
      }
    } catch (e) {
      onError(`Erro ao excluir usuário (${e.message})`)
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
                  {u.nome !== currentNome && (
                    <button className="btn-mini btn-mini-danger" onClick={() => excluir(u)} disabled={busy}>
                      Excluir
                    </button>
                  )}
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
  const [tema, setTema] = useState(() => localStorage.getItem(TEMA_KEY) || 'dark')

  const isMaster = session?.papel === 'master'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema)
    localStorage.setItem(TEMA_KEY, tema)
  }, [tema])

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

  const setCanal = async (id, canais) => {
    setBusyIds((s) => new Set(s).add(id))
    try {
      await api('kard-crm-canais', { method: 'POST', token: session.token, body: { id, ...canais } })
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...canais } : l)))
      setError('')
      load()
    } catch (e) {
      setError(`Erro ao atualizar canais (${e.message})`)
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
    const linkEnviado = leads.filter((l) => l.status === 'link_enviado').length
    const fila = leads.filter((l) => l.status === 'a_ligar').length
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const hoje = leads.filter((l) => l.created_at && new Date(l.created_at) >= startOfDay).length
    const conv = total ? `${Math.round((fechados * 100) / total)}%` : '—'
    return { total, hoje, fila, linkEnviado, fechados, conv }
  }, [leads])

  if (!session) return <Login onLogin={onLogin} />

  return (
    <div className="app">
      <header>
        <div>
          <div className="logo">
            KARD<b>LEADS</b>
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
        <button
          className="btn-tema"
          onClick={() => setTema((t) => (t === 'dark' ? 'light' : 'dark'))}
          title={tema === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
        >
          {tema === 'dark' ? '☀️' : '🌙'}
        </button>
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
        {!isMaster && (
          <button className={`tab ${activeTab === 'meu' ? 'tab-active' : ''}`} onClick={() => setActiveTab('meu')}>
            📈 Meu desempenho
          </button>
        )}
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
            <Metric value={metrics.linkEnviado} label="Link enviado" />
            <Metric value={metrics.fechados} label="Pagos" />
            <Metric value={metrics.conv} label="Conversão" />
          </div>

          <Board
            columns={OPERACIONAL_COLS}
            visible={visible}
            loading={loading}
            busyIds={busyIds}
            onStatus={setStatus}
            onNumeroOk={setNumeroOk}
            onCanal={setCanal}
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
          onCanal={setCanal}
        />
      )}

      {activeTab === 'meu' && !isMaster && <RelatorioTab leads={leads} scopeNome={session.nome} />}

      {activeTab === 'relatório' && isMaster && <RelatorioTab leads={leads} />}

      {activeTab === 'usuarios' && isMaster && (
        <UsuariosTab token={session.token} onError={setError} currentNome={session.nome} />
      )}
    </div>
  )
}
