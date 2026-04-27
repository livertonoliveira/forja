# Changelog

Todas as mudanças notáveis neste projeto são documentadas aqui.

O formato segue o padrão [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.2.8] — 2026-04-27

### Corrigido

- `VERSION` e `package.json` estavam dessincronizados: `npm version patch` atualizava só o `package.json`, enquanto o binário usa `VERSION` via esbuild — CI falhava com `expected '0.2.6' to be '0.2.7'`
- `scripts/bump-version.sh` agora roda `npm version` junto, garantindo que os dois arquivos ficam sempre iguais

## [0.2.7] — 2026-04-27

### Corrigido

- `DLQClient`: chave `load_error` adicionada ao objeto de traduções `useI18n()` (`lib/i18n.ts`) em `pt` e `en` — build TypeScript falhava porque a chave existia apenas no catálogo `next-intl` mas não no tipo derivado do `useI18n`

## [0.2.6] — 2026-04-27

### Corrigido

- Dashboard: textos hardcoded em inglês/português substituídos pelo sistema de i18n em 6 componentes:
  - `dlq/page.tsx`: título e descrição agora usam `getTranslations('dlq')`
  - `FindingDetailSheet`: toasts e labels Run/Commit/Branch passam pelo catálogo de traduções
  - `FindingDiffTable`: headers da tabela e mensagem de vazio agora traduzidos
  - `CopyLinkButton`: botão e toast passam pelo catálogo
  - `DLQClient`: mensagem de erro de carregamento traduzida
  - `EmptySearch`: mensagem de busca sem resultado traduzida via `filters.no_results_query`
- Adicionadas novas chaves em `en.json` e `pt-BR.json`: `findings.diff_empty`, `findings.columns.line/fingerprint`, `findings.detail.run_label/commit_label/branch_label/copy_link_success/copy_fingerprint_success`, `dlq.load_error`, `filters.no_results_query/try_different`, `common_actions.copy_link/copy_link_success`

## [0.2.5] — 2026-04-27

### Corrigido

- `forja ui`: path `../../../apps/ui` era relativo ao arquivo fonte — após bundle aponta para `bin/`, correto agora como `../apps/ui`
- `forja run`: path de `policies/models.yaml` tinha o mesmo problema, corrigido para `../policies/models.yaml`

## [0.2.4] — 2026-04-27

### Adicionado

- Campo `project_id` na tabela `runs` — identifica o projeto explicitamente, sem depender do prefixo da issue do Linear
- Detecção automática de `projectId` pelo nome do repositório git (`git remote get-url origin`) com fallback para o nome do diretório
- Campo `projectId` configurável em `forja/.forja-config.json` e via variável de ambiente `FORJA_PROJECT_ID`
- Migration `0011_project_id.sql`: adiciona coluna, faz backfill dos registros existentes via `SPLIT_PART(issue_id, '-', 1)` e cria índice

### Corrigido

- Dashboard: filtro de projeto usava `ILIKE issue_id%` (frágil) — substituído por `project_id = $n` (exato)
- Dashboard: custo por projeto usava `SPLIT_PART(issue_id, '-', 1)` — substituído por `project_id`
- Dashboard: detecção de runs cross-project usava regex no `issueId` — substituído por comparação de `projectId`
- Budget cap verificava prefixo do `issueId` — agora usa `projectId` do config

## [0.2.3] — 2026-04-27

### Corrigido

- Migrations do Drizzle não encontradas ao rodar `forja infra up` com pacote instalado globalmente: caminho `./migrations` era relativo ao CWD do usuário. Agora é resolvido relativo ao binário instalado (`bin/forja.js → ../migrations`)
- Pasta `migrations/` adicionada ao campo `files` do `package.json` — anteriormente não era publicada no npm

## [0.2.2] — 2026-04-27

### Corrigido

- `forja infra up` e `forja setup --with-harness` agora sempre usam `docker-compose.forja.yml` — anteriormente o `docker compose up -d` sem `-f` sobrescrevia o arquivo e tentava subir o `docker-compose.yml` do projeto do usuário, causando falha no setup

## [0.2.1] — 2026-04-27

### Corrigido

- Comando `setup --with-harness` quebrado devido a caminho de migration incorreto
- Mensagens de saída da CLI traduzidas para inglês, alinhando com o idioma interno do projeto

### Alterado

- Migração de Zod v3 para v4: validação UUID mais estrita, asserções de shape atualizadas nos testes
- Dependências atualizadas: commander, drizzle-orm, drizzle-kit e vitest para versões mais recentes
- npm atualizado para v11 no CI (alinhado com ambiente local)

## [0.2.0] — 2026-04-26

### Adicionado

#### Pipeline

- Toggle de fases por projeto: campo `phases` em `forja/.forja-config.json` (ou `~/.forja/config.json`) permite habilitar/desabilitar fases individuais da pipeline sem alterar políticas ou prompts. Cada fase tem um boolean independente (`dev`, `test`, `perf`, `security`, `review`, `homolog`, `pr`), todos `true` por default. Fases desabilitadas são logadas no início do run e ignoradas pelo engine.
- `PhasesEnabledSchema` e tipo `PhasesEnabled` exportados de `src/schemas/config.ts` — parte da superfície pública a partir desta versão.

#### Dashboard

- Design system completo em paleta black/white/gold (tokens em `apps/ui/lib/tokens.ts`) com componentes shadcn/ui customizados — Card, Button, Badge, Sheet, Skeleton, Table, FilterBar
- Tipografia hierárquica com Fraunces (display serif), Inter (sans) e JetBrains Mono carregadas via `next/font`
- Layout shell com sidebar refinada, top bar com busca global, breadcrumbs dinâmicos e empty states contextuais
- Storybook gallery em `apps/ui/.storybook/` cobrindo todos os componentes — `npm --prefix apps/ui run storybook`
- Filtros do dashboard de runs persistidos via URL query params (`q`, `from`, `to`, `gate`) com validação ISO-8601 server-side
- Busca full-text em runs com índice tsvector + GIN (migration `0005_search_vector.sql`)
- Gráficos de tendência temporal com Recharts (TrendChart, GateFunnelChart), lazy-loaded via `next/dynamic`
- Heatmap anual de atividade (365 × 24) em `/heatmap`
- Comparação lado a lado em `/runs/compare?ids=a,b,c` para 2–5 runs, com diff de findings categorizado por fingerprint (new / resolved / persistent), delta de custo/duração e aviso cross-project
- Drill-down de findings via `FindingDetailSheet` com OWASP/CWE, histórico de ocorrências por fingerprint e botão "Criar issue" via IntegrationProvider
- Página `/cost` com top 10 projetos, stacked chart por modelo/fase e mini-heatmap 7×24 dia × hora
- Sistema de alertas e budget caps de custo com CRUD em `/api/cost/alerts` (persistido em `forja/alerts.json`), notify via Slack/email
- Gantt chart de pipeline em `/runs/[runId]` com timestamps reais, sobreposições para fases paralelas e marcadores de gate
- Toast notifications via Sonner em `apps/ui/lib/toast.ts` com variants success/error/warning/info
- Empty states e loading choreography com staggered reveals
- Command Palette ⌘K via `cmdk` com navegação fuzzy de runs/issues e ações rápidas

#### CLI

- `forja help <cmd>` contextual gerado a partir de metadados em `src/cli/help/command-registry.ts` — adapta à largura do terminal, respeita `NO_COLOR`
- Shell completions bash/zsh/fish via `forja completion <shell>`
- Flag global `--dry-run` (alias `-n`) via middleware de interceptação — cobre GitHub Check, Slack notify, webhook, cost write
- `forja doctor` com diagnóstico extensível (Node, disco, Postgres, migrations, tokens Anthropic/GitHub/Linear, i18n config, circuit breakers) — exit `0=pass 1=warn 2=fail`
- `forja config migrate` para adicionar `artifact_language` em configs antigas sem sobrescrever campos existentes

#### Internacionalização

- Separação entre `artifact_language` (configurável: `pt-BR`, `en`, etc.) e `prompt_language` (sempre `en`, fixo)
- Setup `next-intl` na UI (`apps/ui/middleware.ts`) com catálogos completos de mensagens em `apps/ui/messages/{en,pt-BR}.json`
- Endpoint `GET /api/config/locale` para sincronização de idioma com a config do projeto

#### Integrações

- Interface `IntegrationProvider` em `src/integrations/base.ts` (createIssue/updateIssue/closeIssue/createPR/addComment/healthCheck) e factory plugável em `src/integrations/factory.ts`
- `JiraProvider`: auth Basic/Bearer, transitions dinâmicas com fallback (Done/Closed/Resolved/Completed), formatação ADF, mapeamento de severity → priority
- `GitLabProvider`: Merge Requests, issues com labels/milestones, suporte a Cloud e self-managed
- `AzureDevOpsProvider`: work items, PRs no Azure Repos, detecção automática de process template (Agile/Scrum/CMMI), hierarquia Epic/Feature/Story
- `BitbucketProvider`: PRs + comentários, Issues com fallback gracioso para PR comment, build status (INPROGRESS/SUCCESSFUL/FAILED)
- `DatadogProvider`: métricas customizadas (`forja.run.duration`, `forja.run.cost`, `forja.findings.count`), Event Stream, logs estruturados, batching em janelas de 10s

#### Observabilidade

- OpenTelemetry tracing nativo com `@opentelemetry/sdk-node` — spans hierárquicos run → phase → tool call
- Exportadores configuráveis: OTLP gRPC, OTLP HTTP, console
- Variáveis de ambiente: `FORJA_OTEL_ENABLED`, `FORJA_OTEL_ENDPOINT`, `FORJA_OTEL_PROTOCOL`
- Propagação W3C TraceContext para correlação com serviços externos

#### Resiliência de hooks

- `RetryEngine` em `src/hooks/retry.ts` com exponential backoff, jitter e suporte a `Retry-After` (`maxRetries=5`, `baseDelay=500ms`, `maxDelay=30s`)
- Dead-Letter Queue persistida em Postgres — tabela `hook_dlq` com colunas `hook_type`, `payload`, `error_message`, `attempts`, `status` (`dead` / `reprocessed` / `ignored`) via migration `0010_dlq_schema.sql`
- Página `/dlq` com tabela filtrável, payload preview com syntax highlight e ações de reprocessar/ignorar (acesso restrito a `forja-role=admin`)
- Circuit breaker por endpoint com estados closed/open/half-open (`failureThreshold=5`, `cooldownMs=60s`, `successThreshold=2`); transitions emitidas como spans OTel

#### Estabilidade & versionamento

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

[Unreleased]: https://github.com/livertonoliveira/forja/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/livertonoliveira/forja/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/livertonoliveira/forja/compare/v0.1.1...v0.1.3
[0.1.1]: https://github.com/livertonoliveira/forja/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/livertonoliveira/forja/releases/tag/v0.1.0
