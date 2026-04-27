<p align="center">
  <img src="https://raw.githubusercontent.com/livertonoliveira/forja/main/docs/assets/logo.png" alt="Forja" height="96">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-Slash_Commands-7C3AED?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTcgMTRsNS01IDUgNSIvPjwvc3ZnPg==" alt="Claude Code">
  <img src="https://img.shields.io/badge/Stack-Agnostic-10B981?style=for-the-badge" alt="Stack Agnóstico">
  <img src="https://img.shields.io/badge/License-BUSL--1.1-blue?style=for-the-badge" alt="Licença BUSL-1.1">
  <img src="https://img.shields.io/badge/Linear-Integration-5E6AD2?style=for-the-badge&logo=linear&logoColor=white" alt="Integração Linear">
  <img src="https://img.shields.io/badge/npm-%40forja--hq%2Fcli-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="pacote npm">
  <img src="https://github.com/livertonoliveira/forja/actions/workflows/ci.yml/badge.svg" alt="CI">
</p>

<p align="center">
  <strong>A pipeline de desenvolvimento automatizada para Claude Code.</strong><br>
  Da ideia bruta ao Pull Request entregue — com gates de qualidade, agentes em paralelo, observabilidade completa e trilha auditável de custo para cada chamada de ferramenta.
</p>

<p align="center">
  <a href="#por-que-forja">Por que Forja</a> ·
  <a href="#início-rápido">Início rápido</a> ·
  <a href="#instalação">Instalação</a> ·
  <a href="#configuração">Configuração</a> · <a href="#controle-de-fases-da-pipeline">Fases</a> ·
  <a href="#a-pipeline">A pipeline</a> ·
  <a href="#harness-engine">Harness Engine</a> ·
  <a href="#comandos-slash">Comandos slash</a> ·
  <a href="#referência-do-cli">CLI</a> ·
  <a href="#dashboard">Dashboard</a> ·
  <a href="#políticas">Políticas</a> ·
  <a href="#hub-de-integrações">Integrações</a> ·
  <a href="#plugins--extensibilidade">Plugins</a> ·
  <a href="#estabilidade--versionamento">Estabilidade</a>
</p>

---

## Por que Forja

Claude Code é um martelo incrível. Forja é a linha de montagem.

Entregar uma feature do jeito "normal" com um LLM (Large Language Model — modelo de linguagem grande) significa malabarismo entre uma dúzia de abas: requisitos, tarefas, testes, revisão de segurança, análise de performance, descrição de PR (Pull Request), atualização do tracker, disciplina de commit. Cada uma consome contexto. Cada uma está a um prompt de ser esquecida. E quando a sessão trava no meio, você começa do zero.

A Forja troca esse caos por uma **pipeline determinística e auditável** rodando em cima do Claude Code:

- **Um comando especifica a feature inteira.** `/forja:spec "adicionar reset de senha"` vira um projeto no Linear com milestones, labels e tarefas granulares — cada uma do tamanho certo para caber numa única rodada do Claude.
- **Um comando entrega a tarefa.** `/forja:run TASK-ID` executa develop → test → performance → security → review → aceitação, com **3+ agentes em paralelo** e um gate de qualidade rígido em cada fase.
- **Um comando entrega a PR.** `/forja:pr` produz Conventional Commits atômicos e um PR com relatório de qualidade agregado.

Por baixo dos panos, o **Harness Engine** — um runtime TypeScript registrado como hook do Claude Code — intercepta cada chamada de ferramenta, persiste no PostgreSQL, calcula custo em USD (Dólar Americano) por fase, aplica gates baseados em política e expõe um dashboard Next.js para você ver (e replayar) tudo o que aconteceu.

### O dia a dia muda assim

| Antes | Com Forja |
|-------|-----------|
| "Acho que o Claude rodou bem dessa vez" | Trace completo no Postgres, custo por fase em USD, gate determinístico em CI (Continuous Integration — integração contínua) |
| "Cadê aquele finding crítico do run anterior?" | `/runs/compare?ids=a,b,c` mostra o que mudou — categorizado por fingerprint |
| "Por que essa pipeline custou tanto?" | `/cost` com top 10 projetos, breakdown por modelo/fase, alerta com budget cap automático |
| "Slack caiu e perdi a notificação" | Retry com exponential backoff → DLQ (Dead-Letter Queue — fila de letras mortas) persistida → Circuit Breaker — nada se perde, nada flapa em loop |
| "Vamos integrar com o Jira semana que vem (talvez)" | Provider plugável: Jira, GitLab, Azure DevOps, Bitbucket — escolha por config, não por código |
| "O dashboard é feio, ninguém abre" | Premium black/white/gold com Command Palette ⌘K, Gantt interativo, drill-down de findings — feito pra ficar aberto o dia inteiro |

### O que você ganha, ponto a ponto

| | Sem Forja | Com Forja |
|---|---|---|
| Planejamento de feature | Conversa livre | Projeto no Linear com tarefas granulares (<400 linhas cada) |
| Qualidade de código | "Por favor revise isso" | 3 agentes em paralelo: performance + security + SOLID/DRY/KISS |
| Cobertura de testes | Ad-hoc | Unit + integration + e2e (End-to-End — ponta a ponta) gerados em paralelo |
| Postura de segurança | Olho no olho | Scan OWASP Top 10 em todo diff, com gate por política |
| Visibilidade de custo | Nenhuma | USD por fase, por modelo, por chamada de ferramenta |
| Sessão travou | Começa de novo | `forja resume <run-id>` pega do último checkpoint |
| Veredito de qualidade | Opinião do LLM | DSL (Domain-Specific Language — linguagem específica de domínio) de gates com 8 predicados tipados + justificativa persistida; exit codes `0=pass 1=warn 2=fail` |
| Trilha de auditoria | Log do chat | Trace completo no PostgreSQL + GitHub Check assinado |
| Disciplina de commit | "Initial commit" × 20 | Conventional Commits atômicos por design |
| Cobertura de stack | Setup manual por repo | Detecta automaticamente Node / Python / Go / Rust / Java / Ruby / PHP / .NET |
| Extensibilidade | Forka os prompts | Plugin API tipada: comandos custom, fases, módulos de auditoria, ações de política |
| Estabilidade da API pública | Achismo | `SEMVER.md`, `DEPRECATIONS.md`, CI de breaking changes, guias de upgrade assinados |
| Compatibilidade de artefatos | "Funciona na minha máquina" | `schemaVersion` em todo schema Zod, header JSONL, front-matter de relatório e linha do Postgres — `forja migrate` para upgrades |
| Alcance do issue tracker | Só Linear | **Linear** (primário, MCP-native) + Jira / GitLab / Azure DevOps / Bitbucket via factory tipada |
| Resiliência de chamada externa | Best-effort | RetryEngine (exponential backoff + jitter + `Retry-After`) → DLQ persistida no Postgres + observável em `/dlq` → Circuit Breaker por endpoint |
| Tracing | Só JSONL | Spans nativos OpenTelemetry via `@opentelemetry/sdk-node` — exporta para qualquer backend (Jaeger / Tempo / Datadog / Honeycomb / OTLP collector) |
| Dashboard | Tabela de runs | UI premium black/white/gold: Command Palette ⌘K, comparação de runs, drill-down de findings, Gantt, gráficos de tendência, heatmap de atividade, ranking de custo + alertas e budget caps |
| Ergonomia do CLI | Comandos pelados | `forja doctor` + `--dry-run` + `forja completion <shell>` + `forja help <cmd>` contextual |
| Internacionalização | Só inglês | `artifact_language` (pt-BR / en) desacoplado do `prompt_language` do LLM (sempre `en`); UI traduzida via `next-intl` |

---

## Início rápido

Quatro linhas para sair do zero ao dashboard rodando:

```bash
# 1. CLI global
npm install -g @forja-hq/cli

# 2. Slash commands + hooks + Postgres local via Docker
forja setup --with-harness

# 3. Diagnóstico — falha barulhento se algo estiver fora do lugar
forja doctor

# 4. Dashboard premium (deixa rodando neste terminal; abra http://localhost:4242 no navegador)
forja ui
```

E o loop completo dentro do Claude Code:

```
/forja:init                                # detecta sua stack
/forja:spec "adicionar reset de senha por email"
/forja:run <task-id>
/forja:pr
```

O ciclo todo: especifique → rode → entregue.

---

## Instalação

A Forja tem duas camadas e você pode adotar qualquer uma isoladamente.

### Camada 1 — Apenas slash commands (leve, zero infra)

```bash
npm install -g @forja-hq/cli
forja setup
```

`forja setup` faz três coisas:

1. Copia os slash commands `/forja:*` para `.claude/commands/forja/`
2. Configura os hooks `PreToolUse`, `PostToolUse` e `Stop` em `.claude/settings.json`
3. Anexa a seção da Forja no seu `CLAUDE.md`

A pipeline já roda imediatamente, com estado salvo em issues do Linear ou em arquivos markdown locais. **Sem banco, sem Docker, sem config.**

### Camada 2 — Harness Engine (estado persistente, custo, observabilidade)

Você tem três caminhos para conectar um PostgreSQL.

#### Opção A — Postgres local via Docker (zero config)

```bash
forja setup --with-harness
```

Copia `docker-compose.forja.yml` para o seu projeto, sobe PostgreSQL 16, espera o health check e roda as migrations. Usa o DSN (Data Source Name — nome da fonte de dados) padrão `postgresql://forja:forja@localhost:5432/forja`. Requer Docker.

#### Opção B — Postgres remoto / gerenciado (recomendado para times)

Se você já tem uma instância PostgreSQL (RDS, Neon, Supabase, banco compartilhado do time), aponte a Forja para ela:

```bash
# Persiste a connection string em ~/.forja/config.json (nível usuário)
forja config set store_url postgresql://user:password@host:5432/forja

# Em seguida, só rode as migrations — sem Docker
forja infra migrate
```

#### Opção C — Variável de ambiente (CI/CD, shells efêmeros)

```bash
export FORJA_STORE_URL=postgresql://user:password@host:5432/forja
forja infra migrate
```

#### Prioridade de configuração

A Forja resolve a store URL nesta ordem, primeiro match vence:

1. Variável de ambiente `FORJA_STORE_URL`
2. `forja/.forja-config.json` (nível projeto — versione no git se o time compartilha o mesmo banco)
3. `~/.forja/config.json` (nível usuário — defaults da máquina pessoal)
4. Default: `postgresql://forja:forja@localhost:5432/forja` (convenção do Docker compose)

#### Integrações opcionais

```bash
# GitHub Checks API — posta um check-run assinado a cada fim de pipeline
forja config set github_token ghp_...
# ou: export GITHUB_TOKEN=ghp_...

# Slack — notifica findings críticos via incoming webhook
forja config set slack_webhook_url https://hooks.slack.com/services/...
# ou: export FORJA_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### Atualizando de uma versão anterior

Se você já tem o Forja rodando e quer pegar tudo o que entrou nesta versão (DLQ, Circuit Breaker, novos providers, OTel, dashboard premium, `forja doctor`, `--dry-run`, `artifact_language`, etc.), o caminho seguro é uma sequência de cinco comandos:

```bash
# 1. Atualize o CLI globalmente
npm update -g @forja-hq/cli

# 2. Re-rode o setup — recopia os slash commands; os hooks que já estão em
#    .claude/settings.json continuam intactos
forja setup

# 3. Aplique as migrations novas (índices de busca, trend, fingerprint,
#    cost breakdown e a tabela hook_dlq)
forja infra migrate

# 4. Adicione o campo artifact_language no forja/config.md sem sobrescrever
#    nada que já estava lá
forja config migrate

# 5. Confirme que tudo está verde antes de rodar a próxima pipeline
forja doctor
```

`forja doctor` é a sua rede de proteção: ele aponta migrations pendentes, tokens faltantes, integrações com circuit breaker aberto e config sem `artifact_language`. Exit code `0=pass 1=warn 2=fail` — se sair `2`, leia a mensagem (cada falha vem com hint de remediação) e só siga depois de zerar.

**Atualizando o banco em produção / time:** se vocês compartilham um Postgres, rode `forja infra migrate` em uma única máquina (CI ou um runbook). As migrations `0005`–`0010` são aditivas (criam índices e a tabela `hook_dlq`) — não há downtime nem mudança destrutiva. Use `forja infra status` antes para ver o que está aplicado e o que vai aplicar.

**Artefatos antigos com `schemaVersion`:** se você tem traces JSONL ou relatórios markdown gerados em versões muito antigas (pré-`0004_schema_versioning.sql`), use os comandos pontuais:

```bash
forja migrate trace path/to/trace.jsonl --dry-run   # preview
forja migrate report path/to/report.md
forja migrate postgres                              # migra cada linha do banco
```

A versão atual de schema (`1.0`) não introduziu breaking change, então a maioria dos times só precisa dos 5 passos acima.

**Atalhos novos que valem ligar agora:** `forja completion <bash|zsh|fish>` para autocomplete e `forja config set artifact_language pt-BR` se você quer specs, issues e PRs em português.

### Verificação

```bash
forja config get store_url     # mostra qual DSN está ativo e a fonte
forja infra status             # status da conexão e estado das migrations
forja plugins list             # plugins instalados com versão e tipo
```

Em seguida, abra o Claude Code e rode `/forja:init`. Se ele detectar sua stack e criar `forja/config.md`, você está no ar.

---

## Configuração

Capacidades práticas que você liga em segundos depois do setup.

### Idioma dos artefatos

A Forja separa o idioma dos artefatos (specs, issues, docs, descrições de PR) do idioma dos prompts internos do LLM:

```bash
# Artefatos em português; o LLM continua falando inglês internamente
forja config set artifact_language pt-BR
```

`artifact_language` aceita `pt-BR`, `en`, `es`, `fr`, `de`, `ja`, `zh-CN`. `prompt_language` é fixo em `en` — o LLM rende mais nesse idioma e, quando ele fala com você, traduz para o idioma escolhido. Isso garante saída no idioma do time sem degradar a qualidade do raciocínio. O dashboard segue o mesmo `artifact_language` automaticamente, com catálogos completos em `apps/ui/messages/{en,pt-BR}.json`.

### Controle de fases da pipeline

Nem toda pipeline precisa passar por todos os gates. Se o scan de security é lento demais para o loop de desenvolvimento local — mas essencial na CI — desligue-o por projeto sem mexer em nenhum prompt ou política:

```json
// forja/.forja-config.json
{
  "storeUrl": "postgresql://...",
  "phases": {
    "security": false
  }
}
```

Ao rodar `forja run <issue>`, o engine loga as fases ignoradas e segue:

```
[forja] phases disabled by config: security
[forja] → dev
[forja] → test
[forja] → homolog
[forja] → pr
```

Cada fase tem um toggle independente: `dev`, `test`, `perf`, `security`, `review`, `homolog`, `pr`. Todos habilitados por default. O mesmo campo em `~/.forja/config.json` define defaults para a máquina inteira — útil para desabilitar fases pesadas localmente sem commitar no projeto.

> **Escopo do toggle:** fases runtime (`dev`, `test`, `homolog`, `pr`) são controladas pelo engine. Fases skill-driven (`perf`, `security`, `review`) leem o mesmo `forja/config.md` antes de disparar — `/forja:security` respeita `security: disabled` e retorna imediatamente.

### Autocomplete no shell

```bash
forja completion zsh  > ~/.zsh/completions/_forja
forja completion bash > ~/.local/share/bash-completion/completions/forja
forja completion fish > ~/.config/fish/completions/forja.fish
```

Cobre 100% dos comandos e flags. Valores dinâmicos (run-ids, task-ids) são consultados via API local com fallback estático sem erro quando a API está offline.

### Diagnóstico extensível — `forja doctor`

```bash
forja doctor
#   ✓  Node 20.11.1
#   ✓  38 GB livres em disco
#   ✓  Postgres acessível, 11/11 migrations aplicadas
#   ✓  artifact_language: pt-BR
#   ✓  ANTHROPIC_API_KEY definido
#   ⚠  Circuit breaker ABERTO para https://hooks.slack.com/...
#       → 5 falhas em 60s; cooldown termina em 38s
#   ✗  Health-check do Jira falhou: 401 Unauthorized
#       → confira JIRA_TOKEN (rotacionado pela última vez 2026-04-12?)
```

Cada check é um módulo registrado em `src/cli/doctor/checks/`. Saída em ANSI ou `--json` para CI. Exit code `0=pass 1=warn 2=fail` — pluga direto no pipeline de deploy.

### Integrações externas (apenas as que você usa)

Linear é o caminho primário e já vem via MCP (Model Context Protocol — protocolo do Claude Code). Para os demais, exporte o token e adicione o bloco em `forja/config.md`:

```bash
# Jira
export JIRA_TOKEN=...
# integrations.jira: { baseUrl, email }

# GitLab (Cloud ou self-managed)
export GITLAB_TOKEN=glpat-...
# integrations.gitlab: { baseUrl }

# Azure DevOps
export AZURE_DEVOPS_TOKEN=...
# integrations.azure: { organization, project }

# Bitbucket
export BITBUCKET_APP_PASSWORD=...
# integrations.bitbucket: { workspace, username }

# Datadog (métricas + eventos + logs)
export DD_API_KEY=...
export DD_APP_KEY=...
# integrations.datadog: { site }
```

Re-rode `forja doctor` — cada provider novo aparece com latência de health-check e estado de circuit breaker. Trocar de Jira para GitLab é um diff de config, não um diff de código. Detalhes da arquitetura no [Hub de Integrações](#hub-de-integrações).

### Tracing OpenTelemetry

```bash
# Habilitar export OTLP/gRPC para um collector local (Jaeger/Tempo/Datadog Agent)
forja config set otel.enabled true
forja config set otel.endpoint http://localhost:4317
forja config set otel.protocol grpc

# Ou via env vars (preferido em CI):
export FORJA_OTEL_ENABLED=true
export FORJA_OTEL_ENDPOINT=http://otel-collector:4317
export FORJA_OTEL_PROTOCOL=grpc   # grpc | http | console
```

Spans hierárquicos (run → phase → tool call) propagam W3C TraceContext, então um run que chama um webhook se conecta naturalmente ao trace do serviço receptor em Tempo / Jaeger / Datadog / Honeycomb. Com OTel desabilitado, o SDK fica lazy e não adiciona overhead mensurável. Detalhes no [Harness Engine](#harness-engine).

---

## A pipeline

### 1. `/forja:spec` — da ideia ao plano decomposto

```
/forja:spec "descrição da feature"   (ou um issue ID do Linear)
│
├─► 2 agentes em paralelo  (busca no Linear  +  mapa do codebase)
│
└─► usuário revisa o plano
    │
    └─► SAÍDA
        ├── proposal.md  +  design.md  (ou Linear Documents)
        └── projeto Linear
            ├── Milestone 1
            │   ├── Tarefa A  (~150 linhas)
            │   └── Tarefa B  (~200 linhas)
            └── Milestone 2
                ├── Tarefa C  (~120 linhas)
                └── Tarefa D  (~180 linhas)
```

### 2. `/forja:run TASK-ID` — da tarefa ao código aceito

```
/forja:run TASK-ID
│
├─► DEVELOP            N agentes em paralelo, um por módulo independente
│
├─► TEST               3 agentes em paralelo: unit + integration + e2e
│
├─► QUALITY PHASES     3 gates em paralelo, num único pass:
│   ├── PERFORMANCE    2 agentes  (escopo: diff)
│   ├── SECURITY       3 agentes  (OWASP no diff)
│   └── REVIEW         N agentes  (SOLID / DRY / KISS)
│
├─► GATE CHECK
│   ├── fail   →  corrija e re-rode
│   ├── warn   →  pergunta ao usuário
│   └── pass   →  continua
│
└─► ACCEPT             você aprova
    │
    └─► /forja:pr      Conventional Commits atômicos + PR com relatório
```

### Quality gates

Cada fase de qualidade emite findings com uma severidade. O avaliador de política mapeia severidade para uma decisão de gate:

| Severidade | Gate | Comportamento |
|------------|------|---------------|
| `critical` / `high` | **FAIL** | Pipeline para. Findings viram sub-issues no Linear. Você corrige ou força override. |
| `medium` | **WARN** | Pipeline pausa. Você decide: corrigir agora ou seguir. |
| `low` / nenhum | **PASS** | Pipeline continua automaticamente. |

Decisões de gate são salvas na tabela `gate_decisions` e expostas via `forja gate --run <id>` com exit codes Unix padrão: `0=pass 1=warn 2=fail`. Coloque isso na sua CI e você tem um gate de qualidade determinístico.

### Storage dual (Linear ou local)

| | Com Linear MCP | Standalone |
|---|---|---|
| Proposal & Design | Linear Documents | `forja/changes/<feature>/proposal.md` + `design.md` |
| Tarefas | Linear Issues (com milestones + labels) | `forja/changes/<feature>/tasks.md` |
| Relatórios de qualidade | Comentários nas issues | `forja/changes/<feature>/report-*.md` |
| Tracking | Sub-issues no Linear | `forja/changes/<feature>/tracking.md` |
| Footprint local | Apenas `forja/config.md` | Workspace `forja/` completo |

De qualquer maneira, **todo contexto sobrevive a uma sessão que travou**.

### Pipeline ponta a ponta na prática

```bash
# 1. Especifique a feature em pt-BR (Linear MCP cria projeto + milestones + issues)
/forja:spec "rotação automática de tokens de API"

# 2. Antes de tocar em estado, confira o que a pipeline faria
forja run MOB-XXXX --dry-run
# Saída prefixada com [DRY-RUN]; zero side effects (notify, GitHub Check, webhook, cost write)

# 3. Rode de verdade — gera spans OTel, mede custo, aplica gates
forja run MOB-XXXX

# 4. Compare com o run anterior do mesmo task
forja replay <run-id-anterior> --compare-to <run-id-novo>
# ou abra o dashboard:
open "http://localhost:4242/runs/compare?ids=<a>,<b>"

# 5. Se houver finding crítico, drill-down via /runs/<id>/findings/<id>
#    — botão "Criar issue" usa o IntegrationProvider ativo (Linear por padrão)

# 6. Custo do run + acumulado do projeto
forja cost --run <run-id>
open http://localhost:4242/cost

# 7. Quando tudo estiver verde
/forja:pr
```

Auditorias de projeto inteiro (não diff-scoped) sempre que você quiser:

```bash
/forja:audit:run    # backend + frontend + database + security em paralelo
```

---

## Harness Engine

O Harness é o que transforma a Forja de um conjunto de prompts num runtime real e observável.

### Como pluga no Claude Code

O binário `forja` se registra como um [hook do Claude Code](https://docs.anthropic.com/en/docs/claude-code/hooks) em `.claude/settings.json`. Cada chamada de ferramenta passa por ele:

```
Claude Code quer chamar uma ferramenta
  │
  ▼
forja hook pre-tool-use
  ├─ recebe {tool_name, tool_input} via stdin
  ├─ aplica a política de tools (ex: fase security não pode Write nem Bash)
  ├─ valida atribuição de modelo (ex: spec deve usar Opus)
  ├─ redige segredos no payload (sk-*, ghp_*, strings de alta entropia)
  └─ pode BLOQUEAR a ferramenta com exit code 2
  │
  ▼
Claude executa a ferramenta
  │
  ▼
forja hook post-tool-use
  ├─ lê tokens in / out da response
  ├─ calcula custo USD por modelo (Opus 15/75, Sonnet 3/15, Haiku 0.8/4 por 1M)
  ├─ registra duração, nome da ferramenta, span ID, agent ID
  └─ grava cost_event + tool_call no PostgreSQL
  │
  ▼
Claude para
  │
  ▼
forja hook stop
  ├─ detecta timeouts de fase
  ├─ transiciona o FSM (dev → test → perf → ...)
  ├─ finaliza o status do run e escreve o trace consolidado
  └─ dispara ações: GitHub Check, notificação Slack, webhooks
```

Efeito líquido: **cada chamada de ferramenta é uma linha imutável no seu banco**, marcada com run, fase, agente e custo. Você pode replayar qualquer run, detectar regressões, faturar para o centro de custo certo ou provar o que aconteceu durante um incidente.

### Máquina de estados

Um run da pipeline percorre um FSM (Finite State Machine — máquina de estados finita) explícito com locks em nível de linha que impedem transições concorrentes:

```
caminho feliz:
  init  →  spec  →  dev  →  test  →  perf  →  security  →  review  →  homolog  →  pr  →  done

caminho de falha:
  perf | security | review   →   failed   →   dev   (retry a partir de dev)
```

Transições inválidas são rejeitadas no nível do banco — você literalmente não consegue pular `security` porque o FSM não deixa.

### Checkpoints e resiliência de sessão

Cada fase grava um checkpoint ao concluir. Se o Claude trava, dá timeout, ou um humano dá Ctrl+C:

```bash
forja resume <run-id>   # retoma da última fase concluída
```

Combinado com `idempotency.ts`, re-rodar uma fase já concluída é no-op a menos que você passe `--force` ou `--force-phase dev`.

### Replay e detecção de regressão

```bash
forja replay <run-id>
```

Re-executa um run anterior com inputs idênticos e **dá diff dos resultados**: findings adicionados (bugs novos), removidos (corrigidos ou falsos positivos), gates que mudaram. Os arquivos de comando são fingerprintados (SHA-256 do prompt da fase), então você consegue dizer se uma regressão veio de mudança de código ou de mudança de prompt — chega de "funcionou ontem".

### Custo

```bash
forja cost --run <run-id>
```

Breakdown por fase e por modelo, em USD, com contagem de tokens. O acumulador roda dentro do `post-tool-use`, então o custo é calculado **conforme acontece** — você consegue matar uma pipeline descontrolada no meio do voo.

Tabela de preço (por 1M tokens, in / out):
- Opus 4.x — `$15 / $75`
- Sonnet 4.x — `$3 / $15`
- Haiku 4.x — `$0.80 / $4`

### Redação de segredos

Payloads de saída do hook são escaneados com:
- Regex baseada em padrões para prefixos conhecidos (`sk-ant-*`, `ghp_*`, chaves AWS, bearer tokens)
- Heurística de entropia de Shannon para strings desconhecidas de alta entropia

Matches são substituídos por `[REDACTED]` antes de qualquer escrita em traces, banco ou Slack. Seus tokens não vazam para a sua stack de observabilidade.

### GitHub Checks

Quando uma pipeline termina, a Forja parseia o git remote, extrai `owner/repo` e posta um check-run assinado no SHA atual via GitHub Checks API. Sua PR mostra um ✅/❌ nativo do lado do commit — sem precisar configurar GitHub Actions.

### Notificações Slack

Ações de política podem disparar webhooks Slack com mensagens templatizadas:

```yaml
actions:
  on_critical:
    - kind: notify_slack
      channel: "#eng-alerts"
      text: "🚨 Critical finding in {{runId}}: {{finding.title}}"
```

Apenas webhooks HTTPS são aceitos.

### Resiliência de hooks — RetryEngine + DLQ + Circuit Breaker

Todo efeito colateral de saída (webhook Slack, GitHub Checks API, batch Datadog, chamada de IntegrationProvider, ação de política `http_post` genérica) atravessa três camadas compostas:

```
hook call
   │
   ▼
CircuitBreaker (por endpoint, src/hooks/circuit-breaker.ts)
   │   estados: closed → open → half-open
   │   failureThreshold=5 em 60s · cooldownMs=60s · successThreshold=2
   │   open  →  falha em <1ms (sem chamada de rede)
   ▼
RetryEngine (src/hooks/retry.ts)
   │   maxRetries=5 · baseDelay=500ms · maxDelay=30s · jitter
   │   honra `Retry-After` (segundos ou HTTP-date)
   │   4xx (exceto 429) pula retry → vai direto para a DLQ
   ▼
External API
   │
   ▼ (em falha permanente)
DLQ (tabela hook_dlq, migration 0010_dlq_schema.sql)
   │   {hook_type, payload, error_message, attempts, status: dead|reprocessed|ignored}
   │   visível em /dlq com ações de reprocessar / ignorar
   └─ disponível para qualquer usuário da instância
```

`forja doctor` reporta o estado vivo do circuit breaker por endpoint, então você descobre uma integração intermitente sem abrir o dashboard. Cada retry, transition e enqueue na DLQ é emitido como span OpenTelemetry — aparecem ao lado do resto do trace do seu run.

### Tracing OpenTelemetry nativo

O Harness se instrumenta com `@opentelemetry/sdk-node`. Quando OTel está habilitado (`forja config set otel.enabled true` ou `FORJA_OTEL_ENABLED=true`), cada run produz um trace hierárquico: span pai para o run, spans filhos para cada fase, spans netos para cada chamada de ferramenta. Exporters suportados de fábrica:

| Exporter | Como ativar |
|----------|-------------|
| **OTLP / gRPC** *(default)* | `FORJA_OTEL_PROTOCOL=grpc` + `FORJA_OTEL_ENDPOINT=http://collector:4317` |
| **OTLP / HTTP** | `FORJA_OTEL_PROTOCOL=http` + `FORJA_OTEL_ENDPOINT=http://collector:4318/v1/traces` |
| **Console** | `FORJA_OTEL_PROTOCOL=console` |
| **Nenhum** *(desabilitado)* | `FORJA_OTEL_ENABLED=false` |

Os spans propagam W3C TraceContext, então um run da CI que chama um webhook pode ser correlacionado com o trace do serviço receptor em Tempo / Jaeger / Datadog / Honeycomb sem mudança de código. Com OTel desabilitado, o SDK é carregado lazy e não adiciona overhead mensurável.

### Observabilidade

- **Traces JSONL** em `forja/state/runs/<run-id>/trace.jsonl` — sempre escritos, mesmo se o banco estiver indisponível (arquitetura dual-write)
- **PostgreSQL** para histórico consultável
- **OpenTelemetry** com spans para cada fase, hook, retry e transition do circuit breaker (acima)
- **Dashboard Next.js** (`forja ui`) para humanos

### Versionamento de schema e migrations

Cada artefato que a Forja produz — registros validados por Zod, headers de trace JSONL, front-matter de relatórios markdown e 7 tabelas do Postgres (`runs`, `phases`, `findings`, `gate_decisions`, `tool_calls`, `cost_events`, `issue_links`) — carrega um campo `schemaVersion` carimbado a partir de `CURRENT_SCHEMA_VERSION` (`src/schemas/versioning.ts`). A versão atual é `1.0`, definida pela migration `0004_schema_versioning.sql`.

Atualizar artefatos antigos é uma operação de um comando:

```bash
forja migrate trace path/to/trace.jsonl   # upgrade in-place de um trace JSONL
forja migrate report path/to/report.md    # upgrade do front-matter de um relatório
forja migrate postgres                    # migra cada linha do banco configurado

# Todos os subcomandos aceitam:
#   --dry-run            preview da mudança sem escrever
#   --from <version>     versão de origem explícita (default: lê do header)
#   --to   <version>     versão de destino explícita (default: CURRENT_SCHEMA_VERSION)
```

Os runners (`src/store/migrations/{trace,report,postgres}-runner.ts`) percorrem um registry de migration steps versionados, aplicando-os em sequência. A compatibilidade forward é validada por testes golden de roundtrip: fixtures em `tests/fixtures/schemas/{pre-1.0,v1.0,hypothetical-1.1}/` exercitam upgrades pre-1.0 → 1.0, parsing atual e tolerância a versões futuras com campos desconhecidos. A CI re-roda a suíte de roundtrip a cada mudança em `src/schemas/` ou `src/store/migrations/`.

Releases que sobem `schemaVersion` vêm com guia de upgrade em `docs/upgrades/v<X.Y>.md`, gerado a partir de `docs/upgrades/_template.md` e validado por `scripts/validate-upgrade-guide.ts` antes do tagging — o release script se recusa a publicar se sobrar qualquer placeholder `...` não preenchido.

### Retenção

```bash
forja prune --older-than 90d   # retenção padrão é 90 dias
forja prune --dry-run          # preview de impacto primeiro
```

Remove linhas em batches de 50 e os diretórios `forja/state/runs/<run-id>/` correspondentes, reportando total de bytes liberados.

### Agendamento

```bash
forja schedule list
forja schedule create --cron "0 2 * * 1" --command "/forja:audit:run"
```

Runs recorrentes via cron. Schedules vivem em `.forja/schedules.json`; próximos horários são calculados via `cron-parser`.

### Harness vs apenas slash — lado a lado

| Capacidade | Apenas slash | Com Harness |
|------------|--------------|-------------|
| Estado da pipeline | Linear / markdown | PostgreSQL + FSM |
| Sessão interrompida | Começa de novo | `forja resume <run-id>` |
| Tracking de custo | — | USD por fase via `forja cost`, mais UI `/cost` com alertas e budget caps |
| Veredito de gate | Decisão do LLM | Avaliador da DSL com justificativa persistida e exit-code aplicado |
| Histórico de tool calls | — | Consultável no PostgreSQL |
| Interceptação real-time | — | Hooks pre/post bloqueiam ferramentas não permitidas |
| Dashboard | — | App Next.js `forja ui` — UI premium, palette ⌘K, comparação de runs, drill-down, /dlq |
| Replay + detecção de regressão | — | `forja replay <run-id>` |
| Pipelines agendadas | — | `forja schedule` |
| Issue trackers externos | — | Linear / Jira / GitLab / Azure DevOps / Bitbucket via `IntegrationProvider` |
| GitHub Checks | — | Automático ao fim do run |
| Tracing OpenTelemetry | — | Exporters OTLP gRPC / HTTP / console via `@opentelemetry/sdk-node` |
| Resiliência de hook | — | RetryEngine + DLQ + Circuit Breaker por endpoint |
| Redação de segredos | — | Padrão + entropia |
| Retenção / pruning | — | `forja prune` |

---

## Comandos slash

Cada comando roda standalone — você não precisa começar pelo `/forja:spec` se só quer um scan de segurança.

### Pipeline

| Comando | O que faz |
|---------|-----------|
| `/forja:init` | Detecta stack, convenções e framework de testes; escreve `forja/config.md` |
| `/forja:spec` | Decompõe uma feature em tarefas granulares (<400 linhas); cria projeto Linear com milestones e labels |
| `/forja:run` | Pipeline completa para uma tarefa: develop → test → perf → security → review → aceitação |
| `/forja:develop` | Fase de implementação com N agentes em paralelo (um por módulo independente) |
| `/forja:test` | Gera e roda testes unit + integration + e2e (3 agentes em paralelo) |
| `/forja:perf` | Análise de performance do **diff atual** — N+1, índices faltantes, bundle size, re-renders |
| `/forja:security` | Scan OWASP do **diff atual** — injection, auth, exposição de dados (3 agentes em paralelo) |
| `/forja:review` | Análise SOLID, DRY, KISS, Clean Code |
| `/forja:homolog` | Apresenta o relatório de qualidade agregado para aceitação do usuário |
| `/forja:pr` | Produz Conventional Commits atômicos e abre PR com relatório consolidado |
| `/forja:update` | Puxa os arquivos de comando atualizados do pacote do CLI |

### Auditorias (escopo: projeto inteiro, não diff)

| Comando | O que faz |
|---------|-----------|
| `/forja:audit:backend` | Deep-dive de performance backend: N+1, índices faltantes, memory leaks, concorrência, arquitetura — **3 agentes em paralelo** |
| `/forja:audit:frontend` | Performance frontend: roteia automaticamente para metodologia Next.js (5 camadas) ou genérica (11 categorias) — **3 agentes em paralelo** |
| `/forja:audit:database` | Auditoria de DB: MongoDB / PostgreSQL / MySQL — índices, queries, modelagem, config — **3 agentes em paralelo** |
| `/forja:audit:security` | AppSec: OWASP Top 10, mapeamento CWE, score A–F, PoC para critical/high — **4 agentes em paralelo** |
| `/forja:audit:run` | Meta-comando que roda toda auditoria aplicável em paralelo, baseado no tipo de projeto em `forja/config.md` |

**Fases da pipeline vs auditorias:**
- Fases da pipeline (`/forja:perf`, `/forja:security`) analisam **apenas o diff** — rápidas, escopo da tarefa, rodam em toda tarefa.
- Comandos de auditoria (`/forja:audit:*`) analisam o **codebase inteiro** — rode periodicamente ou antes de uma release.

**Auditorias são `AuditModule`s tipados, não apenas prompts.** Cada uma implementa a interface `AuditModule` (`src/plugin/types.ts`) com formato `AuditFinding`/`AuditReport` validado por Zod, exportado como JSON Schema (Draft 7) em `schemas/audit/`. O runner de auditorias (`src/audits/runner.ts`) executa módulos em paralelo com cap configurável de concorrência (default 4, máximo 64) e timeout via `AbortController` por módulo (default 120s), invocando hooks de lifecycle `onRun` / `onResult` para plugins. A auditoria de segurança ainda roda `src/audits/security/poc-generator.ts`, que produz um PoC (Proof of Concept — prova de conceito) curl/exploit com mapeamento CWE para todo finding `critical`/`high` que carrega um `exploitVector`. Como auditorias são plugins de primeira classe, você pode shippar a sua em `forja/plugins/` ou como pacote npm `forja-plugin-*` — veja [Plugins & Extensibilidade](#plugins--extensibilidade).

---

## Referência do CLI

```
forja <comando> [opções]
```

### Bootstrap do projeto

| Comando | Propósito |
|---------|-----------|
| `forja setup [--with-harness] [--skip-claude-md]` | Instala slash commands, configura hooks, opcionalmente sobe Postgres |
| `forja doctor [--json]` | Diagnóstico extensível — checa Node, disco, conexão DB + migrations pendentes, tokens (Anthropic / GitHub / Linear), validade de `artifact_language` e estado vivo do circuit breaker para cada integração registrada. Exit `0=pass 1=warn 2=fail` |
| `forja help [<comando>]` | Help contextual gerado a partir do registry de comandos — adapta à largura do terminal, respeita `NO_COLOR` |
| `forja completion <bash\|zsh\|fish>` | Emite script de completion para o shell escolhido (`forja completion zsh > ~/.zsh/completions/_forja`) |
| `forja config get <key>` | Lê `store_url`, `slack_webhook_url`, `github_token` ou `artifact_language` e mostra a fonte |
| `forja config set <key> <value>` | Persiste um valor em `~/.forja/config.json` |
| `forja config migrate` | Adiciona campos faltantes (ex: `artifact_language`) em `forja/config.md` sem sobrescrever os existentes |
| `forja infra migrate` | Roda migrations pendentes do banco |
| `forja infra status` | Status da conexão e migrations aplicadas |
| `forja infra up` / `down` | Lifecycle do Postgres via Docker (equivalente a compose up/down) |
| `forja migrate trace <path>` | Atualiza um artefato `trace.jsonl` para o `schemaVersion` atual |
| `forja migrate report <path>` | Atualiza o front-matter de um relatório markdown |
| `forja migrate postgres` | Migra cada linha no store Postgres configurado |
| `forja policies migrate [--in <file>] [--out <file>] [--dry-run]` | Converte políticas YAML legadas para o formato v2 da DSL de gates |
| `forja plugins list [--json] [--invalid]` | Lista plugins registrados com ID, tipo, versão, fonte e path |

**Flag global — `--dry-run` / `-n`:** disponível em todo comando que tem efeitos colaterais (criação de PR, post de GitHub Check, notify Slack, POST de webhook, escrita de cost-event). Saída prefixada com `[DRY-RUN]` e zero escritas — validado por `src/cli/middleware/dry-run.test.ts`. Cole na frente de qualquer run para ver o que aconteceria sem tocar em estado.

### Execução da pipeline

| Comando | Propósito |
|---------|-----------|
| `forja run <issue-id> [--model <id>] [--dry-run] [--force] [--force-phase <name>] [--timeout-phase <name>:<seconds>]` | Inicia um run rastreado |
| `forja resume <run-id>` | Retoma um run interrompido a partir do último checkpoint |
| `forja replay <run-id> [--phase <name>] [--compare-to <run-id>]` | Re-executa um run anterior; dá diff de findings e gates |

### Observabilidade e auditoria

| Comando | Propósito |
|---------|-----------|
| `forja trace --run <run-id> [--format md\|json\|pretty] [--output <file>]` | Trace completo de execução com timeline, findings, custos |
| `forja cost --run <run-id>` | Breakdown USD por fase, por modelo, com contagem de tokens |
| `forja gate --run <run-id> [--policy <path>]` | Avalia gates de qualidade; exit `0=pass 1=warn 2=fail` |
| `forja ui [--port 4242]` | Sobe o dashboard Next.js no navegador |

### Manutenção

| Comando | Propósito |
|---------|-----------|
| `forja prune [--older-than <duration>] [--dry-run]` | Apaga runs além da janela de retenção |
| `forja schedule list` | Lista pipelines agendadas |
| `forja schedule create --cron <expr> --command <cmd>` | Registra novo run cron |
| `forja schedule delete <id>` | Remove um schedule |

### Hook dispatcher (chamado pelo Claude Code, não por você)

| Comando | Propósito |
|---------|-----------|
| `forja hook pre-tool-use` | Política + redação + gating de ferramenta |
| `forja hook post-tool-use` | Contabilidade de custo + tracing de tool call |
| `forja hook stop` | Transition do FSM + finalização de run |

---

## Dashboard

```bash
forja ui              # default em http://localhost:4242
```

Um dashboard de observabilidade Next.js apoiado pelo mesmo PostgreSQL do CLI. UI premium black / white / gold construída com Next.js 14 (App Router) + Tailwind + shadcn/ui — pensada para ser o dashboard que o seu time efetivamente mantém aberto o dia inteiro, não o que ele tolera.

| Rota | O que tem |
|------|-----------|
| `/` | Runs recentes: issue, status, duração, custo, decisão de gate |
| `/runs` | Tabela paginada de todo run com filtros persistidos na URL (status, issue, gate, intervalo de data) via `nuqs`, busca full-text em `tsvector` |
| `/runs/<id>` | Gantt chart com timestamps reais de fase e marcadores de gate, sumário por fase, detalhe de findings, breakdown de custo, trace completo |
| `/runs/<id>/findings/<finding-id>` | Sheet de drill-down com contexto completo, mapeamento OWASP / CWE, histórico do fingerprint e botão *Criar Issue* em qualquer IntegrationProvider registrado |
| `/runs/compare?ids=a,b,c` | Diff lado a lado de 2–5 runs — findings categorizados como new / resolved / persistent por fingerprint, delta de custo / duração, aviso cross-project |
| `/cost` | Top 10 projetos ranqueados, breakdown stacked por fase × modelo, mini-heatmap 7×24 (dia × hora), exportação CSV |
| `/cost` *(painel de alertas)* | CRUD (Create, Read, Update, Delete — criar, ler, atualizar, deletar) sobre `forja/alerts.json`: thresholds por projeto / período (day / week / month), notify via Slack / email, budget cap opcional |
| `/issues` | Catálogo de findings de qualidade entre todos os runs, ordenável por severidade / categoria / file path |
| `/heatmap` | Heatmap de atividade — runs por dia × hora na paleta gold |
| `/dlq` | Dashboard da DLQ (Dead Letter Queue — fila de eventos mortos) para entregas de hook que falharam — filtros por status (`dead` / `reprocessed` / `ignored`) e tipo de hook, preview de payload com syntax-highlight, ações reprocess / ignore |

**Power-user features:**

- **Command Palette ⌘K** (`cmdk`) — navegação fuzzy entre runs / issues / rotas, mais ações rápidas como *Abrir último run*, *Trocar idioma*, *Comparar runs selecionados*
- **Toast notifications** (`sonner`) para toda ação CRUD com variants success / error / warning / info
- **i18n** — alterne entre **pt-BR** / **en** pela top bar; o locale ativo segue `artifact_language` do `forja/config.md`
- **Loading choreography** — animações de reveal staggered e skeletons dedicados em `loading.tsx` por rota, sem layout shift
- **Galeria Storybook** em `apps/ui/.storybook/` (`npm --prefix apps/ui run storybook`) documenta todo componente (Badge, Button, Card, Sheet, Skeleton, Table, FilterBar, TrendChart, HeatmapGrid, Palette)

### Atalhos de teclado

| Atalho | Ação |
|--------|------|
| `⌘K` / `Ctrl+K` | Abre o Command Palette |
| `g r` | Vai para Runs |
| `g c` | Vai para Cost |
| `g h` | Vai para Heatmap |
| `g d` | Vai para DLQ |
| `Esc` | Fecha o Sheet de drill-down e devolve foco ao elemento de origem |

---

## Políticas

Três arquivos YAML em `policies/` (sobrescrevíveis no nível do projeto) controlam toda decisão declarativa: comportamento de gate, restrição de tools e atribuição de modelo.

### `default.yaml` — Política de gate (DSL v2)

A política de gate não é mais uma tabela de severidade hardcoded — é uma DSL pequena e declarativa embutida em YAML. Cada gate tem uma expressão `when:` e uma lista de ações `then:`. Expressões suportam `and` / `or` / `not`, operadores de comparação (`> < >= <= == !=`) e chamadas de predicado com argumentos tipados. A gramática EBNF completa está em [`docs/gates-dsl.md`](docs/gates-dsl.md); o racional para manter embutida em YAML (em vez de hooks TypeScript ou CEL) está no [ADR (Architecture Decision Record — registro de decisão arquitetural) 0001](docs/adr/0001-gates-dsl-yaml-only.md).

```yaml
version: '2'
gates:
  - name: gate-critical
    when: findings.countBySeverity("critical") > 0
    then:
      - fail
      - 'log("Critical finding: {{finding.title}}")'
      - notify_slack("#eng-alerts", "Critical finding in run {{runId}}")

  - name: gate-high
    when: findings.countBySeverity("high") > 0
    then: [fail]

  - name: gate-coverage-regression
    when: coverage.delta() < -0.02 and touched.matches("src/**")
    then: [warn]

  - name: gate-expensive-run
    when: cost.usd() > 5.00 or time.phaseDurationMs("dev") > 600000
    then:
      - 'log("Run {{runId}} is unusually expensive — see /cost dashboard")'
```

#### Os 8 predicados canônicos

Definidos em [`src/policy/dsl/predicates.ts`](src/policy/dsl/predicates.ts) e exportados via `PREDICATES_REGISTRY`. Todos retornam valores fortemente tipados, utilizáveis em comparações.

| Predicado | Retorna | Propósito |
|-----------|---------|-----------|
| `coverage.delta()` | `number` | Delta de cobertura vs base (fração; `-0.05` = -5pp) |
| `coverage.absolute()` | `number` | Percentual absoluto de cobertura no run |
| `diff.filesChanged()` | `number` | Quantidade de arquivos modificados no diff |
| `diff.linesChanged()` | `number` | Quantidade de linhas modificadas no diff |
| `touched.matches(glob)` | `boolean` | Se algum arquivo modificado bate com o glob |
| `time.phaseDurationMs(phase)` | `number` | Duração wall-clock de uma fase, em ms |
| `cost.usd()` | `number` | Custo total em USD do run atual |
| `findings.countBySeverity(sev)` | `number` | Quantidade de findings na severidade dada |

Adicionar um predicado novo é bump MINOR; renomear ou remover é MAJOR (conforme [`SEMVER.md`](SEMVER.md)).

#### Trilha de justificativa

O avaliador da DSL (`src/policy/dsl/evaluator.ts`) é uma função pura: dado um AST e um contexto, retorna uma `decision` mais uma string de `justification` que rastreia cada valor de predicado, comparação e operador booleano que contribuiu. Essa justificativa é persistida na coluna `gate_decisions.justification` (migration `0003_dsl_justification.sql`) — significa que cada `pass` / `warn` / `fail` no seu trace pode ser explicado, auditado e replayado. Chega de arqueologia "por que esse gate disparou?".

#### Migrando YAML legado

Se você ainda tem políticas v1 (estilo `finding.severity: critical`), um comando converte in-place:

```bash
forja policies migrate                    # converte cada policies/*.yaml
forja policies migrate --in old.yaml --dry-run   # preview do diff
forja policies migrate --in old.yaml --out new.dsl.yaml
```

O migrator (`src/policy/dsl/migrator.ts`) é conservador: avisa em vez de silenciosamente jogar fora regras que ele não consegue traduzir.

### `tools.yaml` — restrições de tool por fase

```yaml
security:
  deny: [Write, Edit, Bash, MultiEdit]
  allow: [Read, Glob, Grep, WebSearch, WebFetch]
perf:
  deny: [Write, Edit, Bash, MultiEdit]
review:
  deny: [Write, Edit, Bash, MultiEdit]
develop:
  allow: "*"
```

O hook pre-tool-use aplica isso. Uma fase de security não consegue (acidentalmente ou adversarialmente) mutar seu código.

### `models.yaml` — atribuição de modelo por fase

```yaml
spec: claude-opus-4-7
develop: claude-sonnet-4-6
test: claude-sonnet-4-6
perf: claude-sonnet-4-6
security: claude-sonnet-4-6
review: claude-sonnet-4-6
homolog: claude-haiku-4-5
pr: claude-haiku-4-5
audit_*: claude-sonnet-4-6
```

Escolha o cérebro certo para o trabalho certo: Opus para especificação profunda, Sonnet para o grind, Haiku para sumarização. Custo cai ~5× sem perder qualidade nas fases mais leves.

---

## Plugins & Extensibilidade

A Forja oferece uma Plugin API tipada para você estender qualquer camada da pipeline — comandos custom no CLI, fases novas, categorias de finding, ações de política ou módulos de auditoria inteiros — sem forkar o codebase. Referência completa em [`PLUGIN-API.md`](PLUGIN-API.md), regenerado de `src/plugin/types.ts` via `npm run plugin-api:gen`.

### O que você pode estender

Todas as cinco interfaces são exportadas pelo subpath **`@forja-hq/cli/plugin`** (resolve para `dist/plugin/index.js`).

| Interface | Propósito |
|-----------|-----------|
| **`Command`** | Adiciona um subcomando custom `forja <id>`. Recebe um `CommandContext` (`cwd`, `config`, `store`, `logger`) e retorna um exit code. |
| **`Phase`** | Injeta uma fase nova na pipeline via `insertAfter`. Recebe um `PhaseContext` (`runId`, `previousPhases`, `store`, `abortSignal`) e retorna `pass` / `warn` / `fail`. |
| **`FindingCategory`** | Registra uma categoria nova (`id`, `name`, `defaultSeverity`) para que seus findings sejam reconhecidos pelos predicados de gate e pelo heatmap do dashboard. |
| **`PolicyAction`** | Define uma ação `then:` custom invocável da DSL — ex: abrir um ticket no Jira, pingar um webhook, empurrar uma métrica. |
| **`AuditModule`** | Shippa uma auditoria completa (`detect` + `run` + `report`) que o runner agenda em paralelo com as auditorias built-in. |

### Discovery

O loader de plugin descobre extensões automaticamente a partir de duas fontes, com detecção de colisão entre ambas:

1. **Plugins locais** — todo módulo JS/TS sob `forja/plugins/` (sobrescrever path com `FORJA_PLUGIN_DIR`). Fonte = `local`.
2. **Plugins NPM** — todo pacote em `dependencies` ou `devDependencies` cujo nome bata com `forja-plugin-*`. Fonte = `npm`.

Se o mesmo `id` de plugin é registrado por duas fontes, o bootstrap falha com `PluginCollisionError` listando cada fonte, path e ID em conflito — sem override silencioso.

```bash
forja plugins list           # tabela legível: ID | Tipo | Versão | Fonte | Path
forja plugins list --json    # legível por máquina, para CI
```

### Lifecycle hooks

Cada plugin pode opcionalmente implementar quatro lifecycle hooks (`src/plugin/hooks.ts`). Eles rodam isolados da pipeline — um erro lançado ou timeout nunca derruba um run, só aparece como finding `low`/`medium` no trace.

| Hook | Quando dispara |
|------|----------------|
| `onRegister(ctx)` | Uma vez no bootstrap do plugin |
| `onRun(ctx)` | Antes de cada fase da pipeline |
| `onResult(ctx)` | Após cada fase concluir |
| `onError(ctx)` | Quando uma fase falha |

Timeout rígido por hook é **5000 ms** por padrão, sobrescrevível via a key de config `plugin_hook_timeout_ms`.

### Autorando um plugin em 9 passos

```bash
mkdir my-forja-plugin && cd my-forja-plugin
npm init -y && npm install --save-dev typescript
npm install --save-peer @forja-hq/cli
# escreva src/index.ts (snippet abaixo)
npx tsc
# em um projeto-alvo, registre: forja.config.ts → plugins: ['./dist/index.js']
forja plugins list           # validar
npm publish                  # publique como forja-plugin-<name> para auto-discovery
```

```ts
import type { Command } from '@forja-hq/cli/plugin';

export const greetCommand: Command = {
  id: 'my-plugin:greet',
  description: 'Prints a greeting to the log',
  labels: ['demo'],
  async run(ctx) {
    ctx.logger.info('Hello from my-plugin!');
    return { exitCode: 0, summary: 'Greeted successfully' };
  },
};
```

`id` deve ser globalmente único — namespace com seu prefixo de plugin (`my-plugin:greet`) para conviver bem com outros. `run` nunca deve lançar exceção: capture internamente e retorne um `exitCode` não-zero.

---

## Hub de Integrações

O issue tracker primário é o **Linear**, integrado nativamente via Linear MCP — esse é o caminho default usado por `/forja:spec` e `/forja:run` para projetos, milestones, sub-issues, labels e sync de status.

Para times em outro tracker, uma interface `IntegrationProvider` tipada (`src/integrations/base.ts`) mais uma factory (`src/integrations/factory.ts`) deixam todo tracker secundário falar o mesmo contrato de seis métodos:

```ts
interface IntegrationProvider {
  name: string
  createIssue(input: IssueInput): Promise<IssueOutput>
  updateIssue(id: string, patch: IssuePatch): Promise<void>
  closeIssue(id: string): Promise<void>
  createPR(input: PRInput): Promise<PROutput>
  addComment(targetId: string, body: string): Promise<void>
  healthCheck(): Promise<HealthStatus>
}
```

A factory é um registry de funções `(config) => Provider | null` — cada módulo de provider se auto-registra ao ser importado e retorna sua instância só quando o bloco de config dele está presente. O primeiro match não-nulo vence. Trocar de tracker é um diff de config, não um diff de código.

### Providers secundários

| Provider | Origem | Capacidades |
|----------|--------|-------------|
| **Jira** | `src/integrations/jira.ts` | REST v3, transitions dinâmicas (cadeia de fallback Done/Closed/Resolved), comentários ADF, hierarquia Epic/Story, mapeamento severity → priority (`critical→Highest`, `high→High`, etc.) |
| **GitLab** | `src/integrations/gitlab.ts` | API v4, MRs + Issues com labels e milestones, build status, instâncias **Cloud + self-managed** |
| **Azure DevOps** | `src/integrations/azure-devops.ts` | Work items, PRs no Azure Repos, **detecção de process template** (Agile / Scrum / CMMI), hierarquia Epic → Feature → User Story |
| **Bitbucket** | `src/integrations/bitbucket.ts` | API v2, PRs + comentários, Issues com **fallback gracioso** (PR comment quando Issues está desabilitado), build status (INPROGRESS / SUCCESSFUL / FAILED) |
| **GitHub Checks** | `src/integrations/github-checks.ts` | Check-run assinado a cada fim de pipeline — sua PR mostra um ✅/❌ nativo do lado do commit |
| **Mock** | `src/integrations/mock.ts` | `MockIntegrationProvider` em memória usado pela suíte de testes |

O módulo **Datadog** (`src/integrations/datadog.ts`) é um irmão — ele não implementa `IntegrationProvider` porque seu trabalho é observabilidade, não issue tracking. Emite métricas custom (`forja.run.duration`, `forja.run.cost`, `forja.findings.count`), entradas no Event Stream e logs estruturados, todos batched em janelas de 10 segundos para respeitar rate limits.

### Configurando providers

Config de provider vive sob o bloco `integrations:` do `forja/config.md` (parseado via `IntegrationConfig` em `src/schemas/config.ts`). Ativar Jira, por exemplo, é só adicionar uma seção `jira` com `baseUrl` + auth, mais o token relevante via env var (`JIRA_TOKEN`, `GITLAB_TOKEN`, `AZURE_DEVOPS_TOKEN`, `BITBUCKET_APP_PASSWORD`, `DD_API_KEY` + `DD_APP_KEY` para Datadog). `forja doctor` valida cada conjunto de credencial e pinga `healthCheck()` em todo provider registrado — falhas aparecem com hints de remediação e exit code 2.

### Autorando um provider custom

Implemente `IntegrationProvider`, depois chame `registerProviderFactory((config) => /* retorne seu provider | null */)` no carregamento do módulo. A pipeline pega o primeiro match não-nulo. Shippe como plugin (pacote `forja-plugin-*` ou em `forja/plugins/`) para auto-discovery.

---

## Estabilidade & Versionamento

A Forja trata sua superfície pública como uma API que consumidores dependem. Cinco artefatos juntos definem o que é prometido, o que está deprecated e como upgrades acontecem.

### `SEMVER.md` — o contrato

[`SEMVER.md`](SEMVER.md) enumera exatamente o que está coberto por Versionamento Semântico a partir da v1.0.0:

- **Flags do CLI** — todo argumento de subcomando `forja`, com tipo, default e versão de origem (`Since`)
- **Schemas Zod** — `ConfigSchema`, `FindingSchema`, `GateDecisionSchema`, `CostEventSchema`, `RunStateEnum`, `TraceEventSchema`, `AuditFindingSchema`, `AuditReportSchema`, `StackInfoSchema`
- **Formatos YAML de política** — gate / models / tools, todos `version: "1"`
- **DSL de gate** — os 8 predicados canônicos e suas assinaturas
- **Plugin API** — `Command`, `Phase`, `FindingCategory`, `PolicyAction`, `AuditModule` e seus tipos de contexto
- **JSON Schemas de auditoria** — `schemas/audit/audit-finding.json` e `schemas/audit/audit-report.json` (Draft 7)

Qualquer coisa fora dessa lista — símbolos TypeScript internos, layout das tabelas Postgres, formato binário do checkpoint, markdown dos slash commands — é explicitamente marcada como **interna** e pode mudar em qualquer release.

### `DEPRECATIONS.md` + `warnDeprecated`

Superfícies deprecated vivem em [`DEPRECATIONS.md`](DEPRECATIONS.md) por **duas versões minor** antes da remoção (mais, se um CVE de segurança forçar exceção). Em runtime, o helper `warnDeprecated()` emite um Node `DeprecationWarning` e escreve um evento de trace `deprecation_warning` quando `FORJA_RUN_ID` está setado — então chamadas deprecated aparecem na sua trilha de observabilidade, não só no stderr. Defina `FORJA_SUPPRESS_DEPRECATION_WARNINGS=1` para silenciar.

### `CHANGELOG.md` (Keep a Changelog)

[`CHANGELOG.md`](CHANGELOG.md) segue o formato [Keep a Changelog](https://keepachangelog.com/) e SemVer. Gere uma entrada draft a partir dos seus conventional commits com:

```bash
npm run changelog
```

O release script se recusa a publicar se `CHANGELOG.md` não tem entrada para a versão sendo tagged.

### CI de breaking changes

Cada PR roda `.github/workflows/check-breaking-changes.yml`, que:

1. Re-emite JSON Schemas dos schemas Zod atuais (`scripts/check-breaking-changes.ts`)
2. Faz diff contra o snapshot em `tests/fixtures/public-api/<major.minor>/`
3. Sai com código `2` e posta um comentário no PR se um breaking change for detectado
4. Bloqueia o merge a menos que o PR carregue a label `allow-breaking`

Snapshots são versionados — quebrar acidentalmente a superfície pública é falha de CI, não surpresa em runtime.

### Release script

Tagging de release é um comando interativo:

```bash
npm run release                          # interativo
npm run release -- --dry-run             # preview sem taggear nem pushar
npm run release -- --bump minor --yes    # não-interativo (CI)
```

`scripts/release.ts` detecta o bump automaticamente (exit code do CI de breaking-change → MAJOR; `feat!:` / `feat:` / outros no `git log` → MAJOR / MINOR / PATCH), valida que o `docs/upgrades/v<X.Y>.md` correspondente existe sem placeholders `...` não preenchidos, exige uma referência de RFC em `SEMVER.md` para bumps MAJOR e em seguida cria a tag git.

### Guias de upgrade

Toda minor (e major) shippa um guia de upgrade em `docs/upgrades/v<X.Y>.md`, scaffoldado a partir de [`docs/upgrades/_template.md`](docs/upgrades/_template.md):

```
What's new   →   Breaking changes   →   Deprecations (v+2)   →   Migration steps   →   Known issues
```

O validador (`scripts/validate-upgrade-guide.ts`) parseia o arquivo e rejeita qualquer linha de placeholder restante (`...`, `- ...`, `3. ...`). O guia também carrega um link de âncora para o CHANGELOG (`[v<X.Y>](../CHANGELOG.md#vxy)`), então consumidores transitam entre changelog de alto nível e migração passo a passo num clique.

### Config Gate Behavior

O bloco `gate_behavior` em `forja/config.md` controla como o avaliador colapsa múltiplas ações em uma única decisão. Lógica: qualquer `fail_gate` → `fail`; senão qualquer `warn_gate` → `warn`; senão `pass`. Exit codes são estáveis e fazem parte da superfície pública: `0=pass`, `1=warn`, `2=fail` — coloque `forja gate --run <id>` na CI e você tem um gate de qualidade determinístico.

---

## Paralelismo

| Fase | Agentes | Workload paralelo |
|------|---------|-------------------|
| Spec | 2 | Busca no Linear + exploração do codebase |
| Develop | N | Um agente por módulo independente |
| Test | 3 | Unit + integration + e2e |
| Quality | 3 | Performance + security + review **(simultaneamente)** |
| Perf (diff) | 2 | Backend + frontend |
| Security (diff) | 3 | Injection / Auth / Exposição de dados |
| Review | N | Um agente por área de código |
| audit:backend | 3 | DB+NET / CPU+MEM+CONC / CODE+CONF+ARCH |
| audit:frontend | 3 | Rendering+Boundary / Data+Cache / Bundle+Assets |
| audit:database | 3 | Modelagem+Writes / Indexes / Queries+Config |
| audit:security | 4 | Injection / Auth+Access / Data+Config / BusinessLogic+Compliance |
| audit:run | N | Toda auditoria aplicável de uma vez |

Cada agente escreve em saída isolada — sem race conditions.

---

## Stack suportada

Detectada automaticamente por `/forja:init`:

| Categoria | Suportado |
|-----------|-----------|
| **Runtimes** | Node.js, Python, Go, Rust, Java, Ruby, PHP, .NET |
| **Frameworks backend** | NestJS, Express, FastAPI, Django, Flask, Gin, Spring Boot, Rails, Laravel |
| **Frameworks frontend** | Next.js, React, Vue, Angular, Svelte, Astro, Nuxt, Remix |
| **Bancos de dados** | MongoDB, PostgreSQL, MySQL, Redis, SQLite, DynamoDB |
| **Frameworks de teste** | Vitest, Jest, Mocha, pytest, go test, RSpec, JUnit, Playwright, Cypress |
| **Formatos de projeto** | Backend, frontend, fullstack, **monorepo** (workspace-aware) |

Em monorepos, a Forja detecta workspaces e despacha agentes por workspace — uma mudança que toca `apps/api` e `apps/web` dispara análises de backend e frontend separadas, em paralelo.

---

## Exemplos práticos

### Especificar e entregar uma feature a partir de um issue do Linear

```
/forja:spec PROJ-42        # decompõe em tarefas, cria projeto Linear
/forja:run PROJ-43         # primeira tarefa pela pipeline completa
/forja:run PROJ-44         # próxima tarefa
/forja:pr                  # entrega
```

### Scan de segurança one-off no diff atual

```
/forja:security
```

3 agentes em paralelo para injection, auth/access e exposição de dados — um pass OWASP completo em ~60s.

### Comparar dois runs da mesma tarefa

```
http://localhost:4242/runs/compare?ids=<run-a>,<run-b>
```

Ou pelo CLI: `forja replay <run-id> --compare-to <other-id>`. O diff categoriza findings como **new**, **resolved** ou **persistent** por fingerprint, mostra delta de custo / duração e flagga comparações cross-project.

### Soltar uma pipeline por dry-run primeiro

```bash
forja run PROJ-42 --dry-run
# todo notify Slack, GitHub Check, webhook e write de cost-event é logado com `[DRY-RUN]`
# zero efeitos colaterais — perfeito para preview de mudança de config em CI
```

### Diagnosticar uma integração instável

```bash
forja doctor
#   ✓  Node 20.11.1
#   ✓  38 GB livres em disco
#   ✓  Postgres acessível, 11/11 migrations aplicadas
#   ✗  Health-check do Jira falhou: 401 Unauthorized
#       → confira JIRA_TOKEN (rotacionado pela última vez 2026-04-12?)
#   ⚠  Circuit breaker ABERTO para https://hooks.slack.com/...
#       → 5 falhas em 60s; cooldown termina em 38s
```

### Retomar depois de uma sessão que travou

```bash
forja trace --format pretty | head          # localize o run ID
forja resume <run-id>                       # continua do último checkpoint
```

### Ver exatamente quanto custou um run

```bash
forja cost --run <run-id>
# fase           modelo        tokens_in  tokens_out  usd
# spec           opus-4-7      42_000     8_100       $1.24
# develop        sonnet-4-6    128_400    61_200      $1.30
# test           sonnet-4-6    88_200     32_100      $0.75
# security       sonnet-4-6    54_000     18_900      $0.45
# TOTAL                                                $3.74
```

### Exportar um relatório auditável completo de um run

```bash
forja trace --run <run-id> --format md --output audit.md
```

### Detectar regressões na própria pipeline

```bash
forja replay <run-id>
# +3 findings adicionados (bugs novos?)
# -1 finding removido (falso positivo anterior ou corrigido?)
# gate: pass → warn (regressão!)
# drift: fingerprint do comando dev mudou
```

### Auditoria completa de projeto antes de uma release

```
/forja:audit:run
```

Lê `forja/config.md`, dispara cada auditoria aplicável em paralelo (backend perf + database + frontend perf + security) e produz um relatório consolidado PASS/WARN/FAIL único. Findings critical e high vão para o Linear como issues.

### Auditorias profundas direcionadas

```
/forja:audit:security    # OWASP Top 10, score A–F, PoC para cada critical/high
/forja:audit:database    # análise de índice, N+1, anti-patterns de schema
/forja:audit:frontend    # Core Web Vitals, bundle size, estratégia de rendering
/forja:audit:backend     # N+1, concorrência, memory leaks, arquitetura
```

### Agendar uma auditoria noturna

```bash
forja schedule create --cron "0 2 * * *" --command "/forja:audit:run"
forja schedule list
```

---

## Próximos passos

- **Time todo no mesmo Postgres**: aponte `store_url` para um banco gerenciado (Neon, Supabase, RDS) e cada engenheiro vê os runs dos outros no `/runs`.
- **Auditoria semanal automática**: `forja schedule create --cron "0 2 * * 1" --command "/forja:audit:run"` agenda backend + frontend + database + security toda segunda 02:00.
- **Plugin próprio**: implemente `IntegrationProvider`, `Phase`, `AuditModule`, `Command`, `FindingCategory` ou `PolicyAction` (veja [`PLUGIN-API.md`](PLUGIN-API.md)) e shippe como `forja-plugin-*` no npm para auto-discovery.

---

## Requisitos

| Requisito | Obrigatório? | Notas |
|-----------|--------------|-------|
| [Claude Code](https://claude.ai/code) | **Sim** | CLI, app desktop, app web ou extensão de IDE |
| Repositório git | **Sim** | A Forja faz diff contra o histórico do git |
| Node.js 20+ | **Sim** | Exigido pelo binário do CLI |
| [GitHub CLI](https://cli.github.com/) (`gh`) | Recomendado | Usado por `/forja:pr` para abrir PRs |
| MCP do [Linear](https://linear.app) | Opcional | Habilita o caminho nativo de issue tracking |
| PostgreSQL 16+ | Opcional | Exigido pelo Harness Engine (qualquer provedor: local, RDS, Neon, Supabase, etc.) |
| Docker / Docker Compose | Opcional | Caminho mais fácil para Postgres local via `--with-harness` |

---

## Layout do projeto

```
forja/
├── config.md                      # Stack + convenções do projeto (saída de /forja:init)
├── plugins/                       # Módulos de plugin local (auto-discovery)
│   └── my-plugin/index.js
├── changes/
│   └── <feature-name>/
│       ├── proposal.md            # Requisitos, critérios de aceitação, escopo
│       ├── design.md              # Arquitetura e decisões técnicas
│       ├── tasks.md               # Tarefas granulares (<400 linhas cada)
│       ├── report-<task>.md       # Relatórios de qualidade por tarefa (com front-matter schemaVersion)
│       └── tracking.md            # Tracker de issues + findings
├── audits/                        # Relatórios de auditoria do projeto inteiro
│   ├── backend-<date>.md
│   ├── frontend-<date>.md
│   ├── database-<date>.md
│   ├── security-<date>.md
│   └── run-<date>.md              # Suíte de auditoria consolidada
└── state/                         # Dados de runtime do harness (gitignored)
    └── runs/<run-id>/
        └── trace.jsonl            # JSONL com header schemaVersion
```

Quando o MCP do Linear está conectado, tudo sob `forja/changes/` e o tracking moram no Linear — só `config.md` fica local.

### Layout do repositório (para contribuidores)

```
.
├── SEMVER.md                      # Contrato da API pública (CLI + schemas + DSL + Plugin API)
├── DEPRECATIONS.md                # Itens agendados para remoção (janela de 2 minors)
├── CHANGELOG.md                   # Formato Keep a Changelog
├── PLUGIN-API.md                  # Referência gerada (npm run plugin-api:gen)
├── docs/
│   ├── gates-dsl.md               # Gramática EBNF da DSL de gate
│   ├── adr/0001-gates-dsl-yaml-only.md
│   └── upgrades/
│       ├── _template.md           # Origem de todo upgrade guide
│       └── v<X.Y>.md              # Um guide por release
├── migrations/                    # Migrations SQL (incl. 0004_schema_versioning.sql)
├── policies/                      # default.yaml (DSL de gate) + tools.yaml + models.yaml
├── schemas/audit/                 # Exports JSON Schema (Draft 7)
└── src/
    ├── audits/{backend,frontend,database,security}/   # AuditModules tipados
    ├── plugin/                    # Tipos, registry, loaders e hooks de plugin
    ├── policy/dsl/                # Parser, AST, evaluator, predicados, migrator
    └── store/migrations/          # Runners de migration trace / report / Postgres
```

---

## Contribuindo

Slash commands são markdown puro. Sem build step para editar.

```bash
git clone https://github.com/livertonoliveira/forja
cd forja
npm install
npm run dev           # tsx watch mode para o Harness
npm run typecheck
npm test
npm run build         # compila para bin/forja
forja setup           # instala seu build local em um projeto-teste
```

Editando um comando:

1. Abra `commands/forja/<name>.md`
2. Salve
3. Re-rode `forja setup` no projeto-alvo

PRs são bem-vindos — cada mudança deve shippar como Conventional Commits atômicos. (Sim, fazemos dogfooding da Forja com a Forja.)

---

## Licença

[BUSL-1.1](LICENSE) — Líverton Oliveira

Business Source License 1.1: gratuita para uso interno, avaliação e workloads não-produtivos. Veja o arquivo da licença para a data de mudança de uso em produção.
