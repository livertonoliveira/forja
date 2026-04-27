# DSL de Gates — Especificação da Gramática

## Introdução

O sistema de gates do Forja Harness Engine evoluiu de um mapeamento simples de severidade para ação
(`finding.severity: critical` → `fail_gate`) para uma linguagem declarativa expressiva. Essa DSL
(Domain-Specific Language, Linguagem Específica de Domínio) permite compor condições lógicas
arbitrárias, combinar predicados de contexto distintos e definir ações com parâmetros — tudo dentro
da estrutura YAML que já existia nas políticas.

O campo `when:` continua sendo YAML, mas agora aceita uma **string de expressão** avaliada por um
parser interno. Isso elimina a limitação de comparar apenas um campo por regra e abre espaço para:

- Condições compostas com `and`, `or` e `not`
- Predicados com argumentos tipados (números, strings, booleanos)
- Namespaces de predicado que agrupam funções por domínio (`severity.*`, `coverage.*`, `file.*`, `finding.*`)
- Ações estendidas com parâmetros inline

O formato legado (chave `finding.severity: <valor>`) é mantido para compatibilidade, mas
considerado depreciado a partir da versão `2` do campo `version:`.

---

## Gramática EBNF

EBNF (Extended Backus-Naur Form, Forma de Backus-Naur Estendida) é a notação formal usada para
descrever a sintaxe da linguagem de expressão. Os símbolos `*` (zero ou mais), `+` (um ou mais) e
`?` (zero ou um) seguem a convenção EBNF estendida.

```ebnf
policy         ::= "version:" string "\n" "gates:" "\n" gate+

gate           ::= "-" "name:" string "\n"
                   "when:" expr "\n"
                   "then:" then

expr           ::= or_expr

or_expr        ::= and_expr ("or" and_expr)*

and_expr       ::= not_expr ("and" not_expr)*

not_expr       ::= "not"? primary

primary        ::= predicate_call (cmp_op value)?
               | "(" expr ")"

predicate_call ::= ident ("." ident)* "(" args? ")"

args           ::= value ("," value)*

ident          ::= [a-zA-Z_][a-zA-Z0-9_]*

cmp_op         ::= ">" | "<" | ">=" | "<=" | "==" | "!="

value          ::= number | string | boolean

number         ::= "-"? [0-9]+ ("." [0-9]+)?

string         ::= '"' [^"]* '"'

boolean        ::= "true" | "false"

then           ::= action+

action         ::= "fail" | "warn" | "pass" | action_obj

action_obj     ::= "{" "action:" action_name ("," action_param)* "}"

action_name    ::= "fail" | "warn" | "pass" | "log" | "notify" | "http_post"

action_param   ::= ident ":" value
```

> **Nota sobre escopo:** As regras `policy` e `gate` descrevem a estrutura YAML — interpretada pelo parser YAML padrão. O separador `"\n"` nessas regras representa a quebra de linha do YAML, não um token da linguagem de expressão. As regras `expr` e seus descendentes (`or_expr`, `and_expr`, `not_expr`, `primary`, `predicate_call`) descrevem exclusivamente a sub-linguagem de expressões avaliada pelo parser embutido no campo `when:`.

---

## Operadores e Tipos

### Operadores Lógicos

| Operador | Descrição                                      | Exemplo                              |
|----------|------------------------------------------------|--------------------------------------|
| `and`    | Verdadeiro somente se ambos os lados forem `true` | `severity.is("high") and file.changed("src/**")` |
| `or`     | Verdadeiro se ao menos um lado for `true`      | `severity.is("critical") or severity.is("high")` |
| `not`    | Negação do predicado seguinte                  | `not file.changed("**/*.test.ts")`   |

A precedência segue a ordem: `not` > `and` > `or`. Parênteses podem ser usados para alterar a
ordem de avaliação.

### Operadores de Comparação

Usados opcionalmente após um predicado que retorna um valor numérico ou comparável.

| Operador | Significado         |
|----------|---------------------|
| `>`      | Maior que           |
| `<`      | Menor que           |
| `>=`     | Maior ou igual a    |
| `<=`     | Menor ou igual a    |
| `==`     | Igual a             |
| `!=`     | Diferente de        |

### Tipos de Valor

| Tipo      | Sintaxe                       | Exemplos                  |
|-----------|-------------------------------|---------------------------|
| `number`  | Inteiro ou decimal            | `5`, `0.5`, `100`         |
| `string`  | Entre aspas duplas            | `"critical"`, `"src/**"`  |
| `boolean` | Literal `true` ou `false`     | `true`, `false`           |

### Predicados

Predicados são funções nomeadas com namespace em notação de ponto. Retornam `true`/`false` por
padrão, ou um valor comparável quando combinados com operadores de comparação.

| Predicado              | Argumentos        | Descrição resumida                            |
|------------------------|-------------------|-----------------------------------------------|
| `severity.is(s)`       | `string`          | Verifica se a severidade do finding é `s`     |
| `coverage.dropped(n)`  | `number`          | Verifica se a cobertura caiu mais de `n` %    |
| `file.changed(glob)`   | `string` (glob)   | Verifica se algum arquivo modificado bate no padrão |
| `finding.count()`      | —                 | Retorna o número total de findings            |

### Ações

| Ação     | Efeito                                                |
|----------|-------------------------------------------------------|
| `fail`   | Interrompe o pipeline imediatamente (gate bloqueado)  |
| `warn`   | Emite aviso e pausa o pipeline aguardando confirmação |
| `pass`   | Permite o pipeline continuar sem interrupção          |

Ações estendidas aceitam parâmetros adicionais via objeto inline e permitem integrações como
notificações Slack, webhooks ou logging estruturado.

---

## Exemplos Lado a Lado

### Exemplo 1 — Verificação simples de severidade crítica

**Legado (formato depreciado):**

```yaml
version: "1"
gates:
  - name: gate-critical
    when:
      finding.severity: critical
    then:
      - action: fail_gate
      - action: log
        message: "Critical finding: {{finding.title}}"
```

**Nova DSL:**

```yaml
version: "2"
gates:
  - name: gate-critical
    when: "severity.is(\"critical\")"
    then: fail
```

A nova forma é equivalente semânticamente. O campo `then: fail` substitui `action: fail_gate`,
e o log pode ser reintroduzido como ação estendida quando necessário.

---

### Exemplo 2 — Condição composta: queda de cobertura E arquivo crítico alterado

Não existe equivalente no formato legado, pois este só suporta uma condição por regra.

**Nova DSL:**

```yaml
version: "2"
gates:
  - name: gate-coverage-core
    when: "coverage.dropped(5) and file.changed(\"src/core/**\")"
    then: fail
```

O gate bloqueia apenas quando a cobertura de testes cai mais de 5 pontos percentuais **e** o diff
inclui arquivos dentro de `src/core/`. Isso evita falsos positivos em mudanças de menor impacto.

---

### Exemplo 3 — Severidade alta OR severidade média com muitas ocorrências

**Nova DSL:**

```yaml
version: "2"
gates:
  - name: gate-high-or-medium-flood
    when: "severity.is(\"high\") or (severity.is(\"medium\") and finding.count() >= 10)"
    then: warn
```

Emite aviso e pausa o pipeline se houver qualquer finding de severidade alta, ou se findings de
severidade média acumularem 10 ou mais ocorrências. A combinação de `or` com agrupamento por
parênteses garante a precedência correta.

---

### Exemplo 4 — Negação: passa se o arquivo modificado NÃO for arquivo de teste

**Nova DSL:**

```yaml
version: "2"
gates:
  - name: gate-non-test-change
    when: "not file.changed(\"**/*.test.ts\")"
    then: pass
```

Esse gate libera o pipeline quando a mudança não toca em arquivos de teste TypeScript. Útil para
distinguir entre alterações de produção e de suite de testes em pipelines diferenciados.

---

### Exemplo 5 — Severidade baixa sempre libera o pipeline

**Nova DSL:**

```yaml
version: "2"
gates:
  - name: gate-low
    when: "severity.is(\"low\")"
    then: pass
```

Equivalente direto ao `gate-low` do formato legado. Findings de severidade baixa não bloqueiam
nem emitem avisos — o pipeline segue sem interrupção.

---

## Predicados Disponíveis

Os predicados abaixo fazem parte da API pública da DSL e seguem garantias SemVer a partir da v1.0.0.

| Predicado | Assinatura | Retorno | Descrição |
|-----------|-----------|---------|-----------|
| `coverage.delta` | `coverage.delta()` | `number` | Diff de cobertura entre execução atual e baseline. Unidade: fração (0.05 = 5%). |
| `coverage.absolute` | `coverage.absolute()` | `number` | Cobertura absoluta da execução atual. |
| `diff.filesChanged` | `diff.filesChanged()` | `number` | Quantidade de arquivos alterados no diff. |
| `diff.linesChanged` | `diff.linesChanged()` | `number` | Quantidade de linhas alteradas no diff. |
| `touched.matches` | `touched.matches(glob: string)` | `boolean` | `true` se qualquer arquivo em `diff.touched` casar com o padrão glob (usa minimatch). |
| `time.phaseDurationMs` | `time.phaseDurationMs(phase: string)` | `number` | Duração da fase nomeada em milissegundos. |
| `cost.usd` | `cost.usd()` | `number` | Custo total em USD da execução atual. |
| `findings.countBySeverity` | `findings.countBySeverity(severity: string)` | `number` | Quantidade de findings com a severidade informada (`critical`, `high`, `medium`, `low`). |

### Exemplos

```yaml
# Bloqueia se cobertura caiu mais de 5%
- name: coverage-drop
  when: "coverage.delta() < -0.05"
  then: fail

# Bloqueia se arquivo de autenticação foi tocado E há findings críticos
- name: auth-with-critical
  when: "touched.matches(\"src/auth/**\") and findings.countBySeverity(\"critical\") > 0"
  then: fail

# Aviso se fase de testes demorou mais de 2 minutos
- name: slow-tests
  when: "time.phaseDurationMs(\"test\") > 120000"
  then: warn

# Aviso se custo ultrapassou $5
- name: high-cost
  when: "cost.usd() > 5"
  then: warn
```

---

## Estabilidade e Versionamento

O campo `version:` nas políticas segue versionamento semântico (SemVer) conforme definido em `SEMVER.md` (a ser criado em tarefa separada).

As regras de estabilidade da linguagem de expressão são:

- **Adição de novo predicado** — incremento de versão _minor_ (ex.: `2.1.0 → 2.2.0`). O
  predicado novo pode ser usado imediatamente; políticas existentes continuam funcionando sem
  alteração.

- **Renomeação ou remoção de predicado** — incremento de versão _major_ (ex.: `2.x.x → 3.0.0`).
  Requer migração das políticas existentes. O período de depreciação mínimo é de um ciclo de
  release major.

- **Alteração de semântica de operador** — tratado como _breaking change_; incremento _major_
  obrigatório.

- **Correção de comportamento incorreto documentado** — pode ser _patch_ se não alterar políticas
  corretas existentes.

O campo `version:` no arquivo de política indica a versão da gramática DSL esperada pelo parser.
Parsers de versão superior devem aceitar políticas de versão inferior dentro do mesmo major.
Políticas `version: "1"` (formato legado) são aceitas pelo parser v2 com aviso de depreciação.
