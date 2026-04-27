# ADR-0001 — Gramática da DSL de Gates: YAML + sub-linguagem de expressões embutida (sem escape-hatch TypeScript na v1.0)

**Data:** 2026-04-21
**Status:** Aceito
**Autor:** Time Forja Harness Engine
**Issue:** MOB-1047

---

## Contexto

### O que temos hoje

O sistema de gates atual é definido inteiramente em `policies/default.yaml`. Cada política mapeia uma condição simples de severidade (`finding.severity`) para uma ou mais ações (`fail_gate`, `warn_gate`, `pass_gate`, `log`, `notify_slack`, `http_post`). Exemplo representativo:

```yaml
version: "1"
policies:
  - name: gate-critical
    when:
      finding.severity: critical
    then:
      - action: fail_gate
      - action: log
        message: "Critical finding: {{finding.title}}"

  - name: gate-medium
    when:
      finding.severity: medium
    then:
      - action: warn_gate
```

O campo `when:` aceita hoje apenas um mapa de chave-valor direto, equivalendo sempre a comparações de igualdade simples. Toda a lógica de decisão é uma conjunção implícita de igualdades — sem suporte a negação, disjunção, comparações numéricas, chamadas de predicados ou condições compostas.

### A dor

Usuários do Forja Harness Engine têm demandado condições que não podem ser expressas no formato atual:

- **Condições compostas com AND/OR:** "falhar o gate se a cobertura de testes caiu mais de 5 pontos percentuais E um arquivo marcado como crítico foi modificado"
- **Comparações numéricas e de delta:** "alertar se o tempo médio de resposta aumentou mais de 20% em relação à baseline"
- **Predicados contextuais:** "falhar apenas se o branch alvo for `main` ou `release/*`"
- **Negação:** "ignorar findings de severidade `low` em caminhos `test/**`"

Sem suporte a essas construções, equipes contornam o sistema com scripts externos que executam antes ou depois do pipeline, quebrando a natureza declarativa e rastreável dos gates.

---

## Decisão

Adotamos **YAML como único formato público da DSL de gates**, com a introdução de uma **sub-linguagem de expressões embutida** no campo `when:`.

### Princípios da decisão

1. **Formato único:** O arquivo de políticas continua sendo YAML puro. Não há nenhum arquivo TypeScript, JavaScript ou outro executável como parte da definição de gates na v1.0.
2. **Expressão como string YAML:** Quando a condição for mais complexa do que uma igualdade simples, o campo `when:` aceita uma string que segue a gramática de expressões do Forja (EBNF — Extended Backus-Naur Form — especificada em `docs/gates-dsl.md`).
3. **Sem escape-hatch de código arbitrário:** A v1.0 não expõe nenhum mecanismo para executar código TypeScript, JavaScript ou qualquer outra linguagem de programação de propósito geral como parte da avaliação de um gate.

### Como fica o formato

**Caso simples — igualdade direta (retrocompatível):**

```yaml
- name: gate-high
  when:
    finding.severity: high
  then:
    - action: fail_gate
```

**Caso composto — expressão embutida como string:**

```yaml
- name: gate-coverage-drop-critical-file
  when: "coverage.delta() < -5 and severity.is(\"critical\")"
  then:
    - action: fail
    - action: notify
      channel: "#eng-alerts"
      message: "Cobertura caiu com finding crítico: {{finding.title}}"

- name: gate-perf-regression-on-main
  when: "perf.p95Delta() > 20 and git.targetBranch() == \"main\""
  then:
    - action: warn
```

**Retrocompatibilidade:** O formato de mapa simples (`when: { finding.severity: critical }`) continua válido e é depreciado apenas quando o parser embutido for promovido a GA (disponibilidade geral) na v2.0. Durante a v1.0, os dois formatos coexistem.

---

## Alternativas Consideradas

### 1. Hooks TypeScript (rejeitada)

Permitir que usuários definam um arquivo `.ts` ou `.js` por política, chamado pelo engine em tempo de execução para avaliar se o gate deve ser disparado.

**Motivo da rejeição:**

- **Quebra a natureza declarativa:** Gates deixam de ser auditáveis por humanos ou ferramentas de análise estática sem executar código. Não é possível raciocinar sobre o comportamento de um pipeline lendo apenas o YAML.
- **Risco de segurança:** Código arbitrário executado dentro do processo do harness representa superfície de ataque significativa — injeção de dependências maliciosas, exfiltração de segredos de ambiente, execução de comandos do sistema operacional.
- **Dificulta versionamento e portabilidade:** Políticas que dependem de código TypeScript exigem runtime Node.js, acoplamento a versões de dependências e processo de build próprio. Um arquivo YAML pode ser validado, compartilhado e versionado sem nenhuma infraestrutura adicional.
- **Experiência de usuário fragmentada:** Usuários precisariam manter dois artefatos por política (YAML + TS), aumentando a carga cognitiva e a probabilidade de inconsistências.

### 2. JSON Schema puro (rejeitada)

Usar apenas as primitivas de validação do JSON Schema (mínimo, máximo, enum, pattern, etc.) para expressar condições, sem introduzir uma sub-linguagem.

**Motivo da rejeição:**

- **Poder expressivo insuficiente:** JSON Schema foi projetado para validação de estrutura de dados, não para lógica condicional de pipeline. Expressar "cobertura caiu mais de 5% E arquivo crítico mudou" requer encadeamento de `if/then/else` aninhados que rapidamente se tornam ilegíveis.
- **Sem suporte a predicados contextuais:** Não há como referenciar funções como `matches`, `contains` ou `startsWith` de forma natural. Tudo precisa ser mapeado para primitivas de schema, resultando em workarounds frágeis.
- **Curva de aprendizado desalinhada:** Usuários do Forja já conhecem YAML e expressões simples. Exigir que aprendam semântica de JSON Schema para escrever condições de gate é uma barreira de adoção desnecessária.

### 3. CEL — Common Expression Language (considerada, diferida para v2.0)

O CEL é uma linguagem de expressão de propósito geral criada pelo Google, amplamente usada em produtos como Firebase Security Rules, Kubernetes Admission Webhooks e OPA (Open Policy Agent). É fortemente tipada, determinística, sem efeitos colaterais e possui implementações em Go, Java, C++ e outras linguagens.

**Por que não agora:**

- **Overkill para v1.0:** O conjunto de operadores que o Forja precisa na v1.0 é pequeno e bem delimitado. Adotar o CEL completo introduz uma dependência externa com seu próprio ciclo de vida, documentação e curva de aprendizado.
- **Complexidade de integração:** O parser e evaluator do CEL precisam ser integrados ao engine TypeScript, o que requer binding de biblioteca externa ou reimplementação, aumentando o escopo da v1.0 além do necessário.

**Por que é o caminho natural para v2.0:**

- A gramática pública da DSL (campo `when:` como string) não muda. O que muda é apenas o parser interno.
- Adotar CEL como implementação do evaluator na v2.0 seria uma mudança puramente interna, sem breaking changes para usuários existentes.
- CEL já é battle-tested em sistemas de alta escala e forneceria gratuitamente: type-checking, suporte a macros, funções customizáveis e otimização de expressões.

---

## Consequências

### Positivas

- **Superfície pública menor:** Usuários interagem apenas com YAML. Não há API de código, não há hooks, não há contrato além do schema do arquivo de políticas.
- **Migração simples para usuários existentes:** O formato atual de mapa simples continua funcionando sem nenhuma alteração. A adoção da sub-linguagem de expressões é incremental e opcional.
- **Auditabilidade total:** Qualquer gate pode ser inspecionado, validado e raciocinavelmente compreendido lendo apenas o arquivo YAML, sem executar código.
- **Portabilidade:** Um arquivo `policies.yaml` pode ser copiado entre projetos, organizações ou stacks sem dependências de runtime além do próprio Forja.
- **Caminho claro para extensão:** Se a expressividade de TypeScript for genuinamente necessária no futuro, pode ser introduzida como feature opcional em uma minor release posterior, sem breaking changes — a gramática YAML pública permanece estável.

### Negativas / Riscos

- **Parser próprio a manter:** A sub-linguagem de expressões precisa de um parser e evaluator implementados e testados no engine. Isso é complexidade adicional em relação ao formato de mapa simples atual.
- **Expressividade limitada na v1.0:** Usuários que precisam de lógica muito complexa (ex.: consultas a APIs externas, estado acumulado entre runs) não serão atendidos na v1.0.
- **Coexistência de dois formatos `when:`:** Durante a transição, o engine precisa detectar se o valor de `when:` é um mapa (formato legado) ou uma string (expressão embutida) e tratar cada caso adequadamente — aumentando a complexidade do parsing inicial.

### Decisões futuras relacionadas

- **MOB-1047 (concluída):** ADR e gramática EBNF da sub-linguagem publicadas em `docs/adr/0001-gates-dsl-yaml-only.md` e `docs/gates-dsl.md`.
- **REQ-06:** Implementação do parser com base na gramática definida em `docs/gates-dsl.md`.
- **REQ-07:** Lista definitiva de predicados disponíveis (placeholder em `docs/gates-dsl.md`).
- **Futuro:** Avaliar adoção de CEL como implementação interna do parser de expressões na v2.0, mantendo a gramática pública estável.
- **Futuro:** Deprecar formalmente o formato de mapa simples de `when:` quando o parser de expressões atingir GA.
