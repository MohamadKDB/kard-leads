# Kard CRM

CRM de leads do motor de score do Kardbank. Frontend em React (Vite), backend = webhooks do n8n sobre o banco Postgres `automation` (schema `crm`).

## Arquitetura

```
Postgres (kscore) → n8n (notificacao_isolado) → INSERT crm.leads
                                                      │
Este app (Vercel) ──► GET  /webhook/kard-crm-leads ───┤  n8n = API
                  ──► POST /webhook/kard-crm-status ──┘
```

O workflow `kard_crm` no n8n expõe:

| Endpoint | Método | Função |
|---|---|---|
| `/webhook/kard-crm-leads` | GET | Lista os leads de `crm.leads` (JSON) |
| `/webhook/kard-crm-status` | POST | Atualiza status: body `{ "id", "status", "responsavel" }` |

Status válidos: `a_ligar`, `em_contato`, `fechado`, `perdido`, `nao_atende`.

## Rodar local

```bash
npm install
cp .env.example .env   # ajuste a URL se necessário
npm run dev
```

Abre em http://localhost:5173

## Deploy no Vercel

Opção A — via GitHub (recomendado):
1. Suba esta pasta num repositório GitHub
2. No Vercel: **Add New → Project → importa o repo** (ele detecta Vite sozinho)
3. Em **Settings → Environment Variables**, adicione:
   - `VITE_API_BASE` = `https://staging-n8n-editor.easypanel.spyralinnovation.com.br/webhook`
4. Deploy

Opção B — via CLI:
```bash
npm i -g vercel
vercel
# segue o prompt; depois configura a env var no dashboard e roda:
vercel --prod
```

## Como atualizar

- **Visual/lógica do painel**: edite os arquivos em `src/`, commit + push → Vercel faz redeploy automático (se conectado ao GitHub).
- **API / regras de negócio** (novos campos, filtros, endpoints): edite o workflow `kard_crm` no n8n.
- **Novos campos no card**: adicione a coluna em `crm.leads`, inclua no SELECT do node "Buscar leads no banco" no n8n, e renderize em `src/App.jsx` (componente `LeadCard`).

## Observação de segurança

Os webhooks do n8n estão públicos (qualquer pessoa com a URL lê os leads, que contêm CPF e telefone). Para produção, ative autenticação por header no n8n (Webhook → Authentication → Header Auth) e envie o header no `fetch` deste app.
