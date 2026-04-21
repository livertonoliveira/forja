# Guia de Migração: YAML Legacy → DSL de Gates

## Visão Geral

As policies YAML no formato legado (`version: "1"` com chave `policies:`) foram substituídas pelo novo formato DSL (Domain-Specific Language — linguagem de domínio específico) de gates (`version: "2"` com chave `gates:`). Use o comando `forja policies migrate` para converter automaticamente.

## Passo a Passo

### 1. Faça backup das policies atuais

```bash
cp -r policies/ policies.backup/
```

### 2. Revise o diff antes de migrar

```bash
forja policies migrate --dry-run
```

O comando exibe as diferenças entre o formato legado e o DSL para cada arquivo, sem escrever nada.

### 3. Execute a migração

```bash
# Migra todas as policies em policies/*.yaml
forja policies migrate

# Ou migra um arquivo específico
forja policies migrate --in policies/default.yaml --out policies/default.dsl.yaml
```

### 4. Revise os arquivos gerados

Cada `policies/<nome>.dsl.yaml` criado deve ser revisado manualmente, especialmente se houver avisos de ações não-portáveis.

### 5. Execute os testes

```bash
npx vitest run
```

### 6. Commit as mudanças

```bash
git add policies/
git commit -m "chore: migrate policies to DSL gate format"
```

## Exemplos

### Antes (legado)

```yaml
version: "1"
policies:
  - name: gate-critical
    when:
      finding.severity: critical
    then:
      - action: fail_gate
      - action: notify_slack
        channel: "#eng-alerts"
        message: "Crítico: {{finding.title}}"
```

### Depois (DSL)

```yaml
version: "2"
gates:
  - name: gate-critical
    when: 'findings.countBySeverity("critical") > 0'
    then:
      - fail
      - notify_slack("#eng-alerts", "Crítico: {{finding.title}}")
```

## Mapeamento de Condições

| Legado | DSL |
|--------|-----|
| `finding.severity: critical` | `findings.countBySeverity("critical") > 0` |
| `finding.severity: high` | `findings.countBySeverity("high") > 0` |
| `finding.severity: medium` | `findings.countBySeverity("medium") > 0` |
| `finding.severity: low` | `findings.countBySeverity("low") > 0` |

## Mapeamento de Ações

| Legado | DSL |
|--------|-----|
| `action: fail_gate` | `fail` |
| `action: warn_gate` | `warn` |
| `action: pass_gate` | `pass` |
| `action: log, message: "..."` | `log("...")` |
| `action: notify_slack, channel: "...", message: "..."` | `notify_slack("...", "...")` |
| `action: http_post, url: "..."` | `http_post("...")` + aviso `non_portable_action` |

## Troubleshooting

### `non_portable_action`

**Quando aparece:** A policy usa `action: http_post` com uma URL externa customizada.

**O que significa:** O migrador conseguiu gerar um `http_post("url")` no DSL, mas a integração precisa ser validada manualmente — parâmetros como `headers` e `payload` podem ter sido simplificados.

**O que fazer:**
1. Verifique o campo `http_post(...)` no DSL gerado.
2. Confirme que a URL ainda está correta.
3. Se precisar passar headers ou payload customizados, considere usar uma action plugin.

### `Invalid policy file`

**Quando aparece:** O arquivo YAML (Yet Another Markup Language — linguagem de marcação) não segue o schema legado (`version` + `policies`).

**O que fazer:** Verifique se o arquivo já está no formato DSL (`gates:`). Se sim, não precisa migrar.

### Warning de deprecação no carregamento

Ao carregar um arquivo YAML legado com `forja gate`, você verá:

```
DeprecationWarning: legacy-policy-format is deprecated since 2.0.0 and will be removed in 3.0.0. Use DSL gate format (version: "2") instead.
```

Isso indica que o arquivo ainda está no formato legado. Rode `forja policies migrate` para converter.
