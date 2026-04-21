# Changelog

Todas as mudanças notáveis neste projeto são documentadas aqui.

O formato segue o padrão [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado
- `SEMVER.md` declarando a superfície pública do Forja e o contrato SemVer 1.0
- `DEPRECATIONS.md` com guia de depreciações e helper `warnDeprecated` no runtime
- Script `scripts/generate-changelog.ts` para geração automática do CHANGELOG a partir de conventional commits
- Comando `npm run changelog` no `package.json`
- Gate no workflow de release que bloqueia publicação sem entrada no CHANGELOG

## [0.1.3] — 2026-04-20

### Adicionado
- Rastreamento de custo de tokens de cache: `cache_creation_input_tokens` e `cache_read_input_tokens` da API Claude agora são precificados corretamente (write = 1,25×, read = 0,10× do preço de input) e armazenados no banco e no JSONL
- Auto-migração de bancos locais: migrações pendentes são aplicadas automaticamente na inicialização
- Aviso de migração pendente para bancos remotos: mensagem clara orienta a executar `forja infra migrate`
- Snapshot de schema Drizzle para migração 0002
- Implementação completa da UI Zagreb: novo visual, navegação revisada e melhorias de UX

### Corrigido
- Build standalone da UI incluído corretamente no pacote npm
- Pré-renderização estática desabilitada em páginas com data-fetching para evitar erros de build

### Notas de migração
- **Migração de banco necessária**: execute `forja infra migrate` se utilizar banco remoto/gerenciado. Bancos locais (localhost) são migrados automaticamente na próxima inicialização.

## [0.1.1] — 2026-04-19

### Adicionado
- Writer de log de auditoria JSONL estruturado (`forja trace`)
- Contabilidade de tokens e custo via hook PostToolUse
- FindingWriter e gates determinísticos com exit codes orientados a política
- Gerador de relatório dashboard Markdown (`forja trace --format md`)
- IDs de correlação (span IDs) para rastreamento de agentes paralelos
- Interface `ForjaStore` e schema Drizzle para todas as 8 tabelas de dados
- Adapter Postgres para `ForjaStore` usando Drizzle ORM
- Docker Compose para Postgres local e comando `forja infra`
- Pipeline de ingestão dual-write (JSONL + Postgres)
- Configuração de conexão Postgres via env var e `forja config set`
- Política de retenção de dados e comando `forja prune`
- Hooks do Claude Code em `.claude/settings.json` (PreToolUse, PostToolUse, Stop)
- Motor de políticas YAML para decisões de gate
- Allowlist de ferramentas por fase via hook PreToolUse
- Redação automática de segredos nas escritas de trace e Postgres
- FSM (Finite State Machine — máquina de estados finita) explícita para orquestração do pipeline com persistência no Postgres
- Checkpoints de fase para resiliência e suporte a retomada de runs interrompidos
- Guarda de idempotência de fase com flags `--force` e `--force-phase`
- Enforcement de timeout de fase via stop hook
- Fixação de modelo por fase via `policies/models.yaml`
- Fingerprinting de prompt e rastreamento de seed nos eventos de trace
- Modo `forja replay` para reprodução de runs e detecção de regressões
- Ação de política de webhook genérico (`http_post`)
- Ação de política de notificação Slack para findings críticos
- Integração com a GitHub Checks API para exibição de resultados de gate em PRs
- Comando `forja schedule` para agendamento nativo de runs
- App Next.js para Forja UI (App Router, layout base, integração CLI)
- Páginas de timeline de run (`/runs` e `/runs/[runId]`)
- Páginas de histórico de issue (`/issues` e `/issues/[issueId]`)
- Dashboard de custo `/cost` com breakdown por modelo e fase
- Página de heatmap de findings `/heatmap`
- API routes Next.js para acesso a dados (runs, issues, custo, findings)
- CI com GitHub Actions (lint, typecheck, test, build)
- Mock do runner Claude para testes do pipeline sem chamadas à API
- Golden tests para todos os 16 comandos `/forja:*`
- Contract tests para conformidade dos schemas Zod em todos os writers

### Corrigido
- Processos órfãos do Vitest resolvidos via `--pool=threads`
- Binário renomeado para `forja.js` para compatibilidade com npm

## [0.1.0] — 2026-04-17

### Adicionado
- Esqueleto inicial do projeto (M0 — Fundação)
- Schemas Zod canônicos para todos os tipos de dados estruturados
- Binário CLI `forja` com stubs de subcomandos

---

[Unreleased]: https://github.com/livertonoliveira/forja/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/livertonoliveira/forja/compare/v0.1.1...v0.1.3
[0.1.1]: https://github.com/livertonoliveira/forja/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/livertonoliveira/forja/releases/tag/v0.1.0
