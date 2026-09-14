/**
 * `QueryBuilder` falso, em memória, usado só por `FakeRepository.createQueryBuilder`
 * (ver `fakeRepository.ts`) para permitir testar `analise.service.ts`,
 * `analise-avaliacoes.service.ts` e `analise-resultados-pergunta.service.ts`
 * (os módulos hoje cujas queries de agregação usam `createQueryBuilder`/SQL
 * cru em vez de `find`/`count` simples — ver `.claude/tasks/analise-visao-geral/`,
 * `.claude/tasks/analise-avaliacoes/` e `.claude/tasks/analise-resultados-pergunta/`).
 *
 * NÃO é um interpretador SQL genérico — interpreta só o subconjunto de
 * sintaxe efetivamente usado nesses services:
 * - `.select(expr, alias)` / `.addSelect(expr, alias)`: coluna simples
 *   (`'c.id'`), extração jsonb (`"item.valor ->> 'texto'"`), extração jsonb
 *   com cast entre parênteses (`"(item.valor ->> 'nota')::int"`, usada por
 *   `agregarLikert360`/`agregarLikertClima` de "Resultados por Pergunta"), ou
 *   agregação (`'COUNT(*)'`, `'COUNT(rc.id)'`, `'COUNT(DISTINCT rel.avaliador_id)'`,
 *   `'AVG(EXTRACT(EPOCH FROM (a - b)) / 3600)'`).
 * - `.where(cond, params)` / `.andWhere(cond, params)` (sempre combinadas por
 *   AND, como o SQL gerado real): suporta expressões compostas com `AND`/`OR`
 *   top-level e parênteses (ex.: `"(a = :x AND b = :y) OR (a = :z AND b = :w)"`),
 *   além dos átomos `<=`, `>=`, `=`, `<>`, `IN (:...param)`,
 *   `BETWEEN :p1 AND :p2`, `IS [NOT] NULL`, comparação com literal `'...'` —
 *   com ou sem cast `::date`, com ou sem extração jsonb `->> 'chave'` no
 *   campo do lado esquerdo.
 * - `.innerJoin(Entidade, alias, condicao, params?)`: condição de igualdade
 *   simples entre colunas, ou composta com `AND` (ex.: `'p.id = i.pergunta_id
 *   AND p.tipo = :tipo'`) — nested-loop em memória.
 * - `.groupBy(expr)` / `.addGroupBy(expr)`: agrupa por 1+ colunas simples
 *   antes de aplicar `.select()`/`.addSelect()` (aggregate ou não) por grupo.
 * - `.orderBy(expr)` / `.addOrderBy(expr)`: ordenação estável por
 *   comparação de string das linhas juntadas (só usada para determinismo de
 *   teste, nunca para semântica de negócio).
 * - `.getCount()` / `.getRawMany()` / `.getRawOne()` — `getRawOne` sobre
 *   agregação sem `GROUP BY` sempre retorna 1 linha (mesma semântica do
 *   Postgres: `AVG` de 0 linhas é `NULL`, `COUNT(*)` de 0 linhas é `0`).
 *
 * Qualquer expressão fora desse subconjunto lança erro explícito em vez de
 * silenciosamente devolver um resultado errado — se um service mudar a forma
 * de uma query, o teste quebra alto (erro claro), não baixo (asserção
 * incorreta silenciosa).
 */

type Params = Record<string, unknown>
type Linha = Record<string, any>

interface JoinInfo {
  entidade: Function
  alias: string
  condicao: string
}

/** Referência de campo: `alias.coluna` ou extração jsonb `alias.coluna ->> 'chave'`. */
const CAMPO = `\\w+\\.\\w+(?:\\s*->>\\s*'\\w+')?`

function snakeParaCamel(campo: string): string {
  return campo.replace(/_([a-zA-Z])/g, (_match, letra: string) => letra.toUpperCase())
}

function paraDataSomente(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return ''
  const data = valor instanceof Date ? valor : new Date(String(valor))
  if (Number.isNaN(data.getTime())) return ''
  return data.toISOString().slice(0, 10)
}

function resolverCampo(refCampo: string, linha: Linha): unknown {
  const [alias, coluna] = refCampo.split('.') as [string, string]
  const linhaAlias = linha[alias]
  if (linhaAlias === undefined) return undefined
  return linhaAlias[snakeParaCamel(coluna)]
}

/** Extrai `(alias.coluna ->> 'chave')::tipo` (jsonb + cast entre parênteses, ex.: `(item.valor ->> 'nota')::int`) — usado por "Resultados por Pergunta" para extrair nível numérico de likert/matriz. `undefined` = não casa com o padrão. */
function extrairJsonComCast(ref: string): { campoBase: string; chave: string; cast: string } | undefined {
  const m = ref.match(/^\(\s*(\w+\.\w+)\s*->>\s*'(\w+)'\s*\)::(\w+)$/)
  if (!m) return undefined
  const [, campoBase, chave, cast] = m as [string, string, string, string]
  return { campoBase, chave, cast }
}

/** Resolve `alias.coluna` normal, `alias.coluna ->> 'chave'` OU `(alias.coluna ->> 'chave')::tipo` (extração de campo jsonb, shape `{ chave: valor }`, com cast opcional entre parênteses). */
function resolverCampoOuJson(ref: string, linha: Linha): unknown {
  const comCast = extrairJsonComCast(ref)
  if (comCast) {
    const bruto = resolverCampo(comCast.campoBase, linha)
    if (bruto === null || bruto === undefined) return null
    const valor = (bruto as Record<string, unknown>)[comCast.chave] ?? null
    if (valor === null) return null
    return comCast.cast === 'int' ? Number(valor) : String(valor)
  }

  const jsonMatch = ref.match(/^(\w+\.\w+)\s*->>\s*'(\w+)'$/)
  if (jsonMatch) {
    const [, campoBase, chave] = jsonMatch as [string, string, string]
    const bruto = resolverCampo(campoBase, linha)
    if (bruto === null || bruto === undefined) return null
    return (bruto as Record<string, unknown>)[chave] ?? null
  }
  return resolverCampo(ref, linha)
}

function resolverParametro(nome: string, params: Params): unknown {
  if (!(nome in params)) {
    throw new Error(`FakeQueryBuilder: parâmetro ":${nome}" não foi informado a where/andWhere/innerJoin`)
  }
  return params[nome]
}

/** Divide `expr` no separador (ex.: `' OR '`, `' AND '`) só em profundidade 0 de parênteses. */
function dividirTopNivel(expr: string, separador: string): string[] {
  const partes: string[] = []
  let profundidade = 0
  let atual = ''
  let i = 0
  while (i < expr.length) {
    const char = expr[i] as string
    if (char === '(') profundidade++
    if (char === ')') profundidade--
    if (profundidade === 0 && expr.slice(i, i + separador.length) === separador) {
      partes.push(atual)
      atual = ''
      i += separador.length
      continue
    }
    atual += char
    i++
  }
  partes.push(atual)
  return partes.map((p) => p.trim())
}

/** `true` só se os parênteses externos de `expr` envolverem literalmente a expressão inteira (não um `(a) OR (b)`). */
function parensEnvolvemTudo(expr: string): boolean {
  if (!expr.startsWith('(') || !expr.endsWith(')')) return false
  let profundidade = 0
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') profundidade++
    if (expr[i] === ')') profundidade--
    if (profundidade === 0 && i < expr.length - 1) return false
  }
  return true
}

/** Tenta casar `atomo` inteiro contra um dos padrões suportados; `undefined` = não é um átomo reconhecido (chamador tenta dividir por AND/OR). */
function tentarAvaliarAtomo(atomo: string, params: Params, linha: Linha): boolean | undefined {
  let m: RegExpMatchArray | null

  m = atomo.match(new RegExp(`^(${CAMPO}) IS (NOT )?NULL$`))
  if (m) {
    const [, campo, negacao] = m as [string, string, string | undefined]
    const valor = resolverCampoOuJson(campo, linha)
    const ehNulo = valor === null || valor === undefined
    return negacao ? !ehNulo : ehNulo
  }

  m = atomo.match(new RegExp(`^(${CAMPO}) IN \\(:\\.\\.\\.(\\w+)\\)$`))
  if (m) {
    const [, campo, paramNome] = m as [string, string, string]
    const valor = resolverCampoOuJson(campo, linha)
    const lista = resolverParametro(paramNome, params) as unknown[]
    return lista.includes(valor)
  }

  m = atomo.match(new RegExp(`^(${CAMPO})(?:::date)? BETWEEN :(\\w+)(?:::date)? AND :(\\w+)(?:::date)?$`))
  if (m) {
    const [, campo, paramDe, paramAte] = m as [string, string, string, string]
    const valor = paraDataSomente(resolverCampoOuJson(campo, linha))
    const de = String(resolverParametro(paramDe, params))
    const ate = String(resolverParametro(paramAte, params))
    return valor !== '' && valor >= de && valor <= ate
  }

  m = atomo.match(new RegExp(`^(${CAMPO})(?:::date)? (<=|>=|=|<>) :(\\w+)(?:::date)?$`))
  if (m) {
    const [, campo, operador, paramNome] = m as [string, string, string, string]
    const bruto = resolverCampoOuJson(campo, linha)
    const paramValor = resolverParametro(paramNome, params)
    if (atomo.includes('::date')) {
      const valor = paraDataSomente(bruto)
      const comparado = String(paramValor)
      if (valor === '') return false
      if (operador === '<=') return valor <= comparado
      if (operador === '>=') return valor >= comparado
      if (operador === '<>') return valor !== comparado
      return valor === comparado
    }
    if (operador === '=') return bruto === paramValor
    if (operador === '<>') return bruto !== paramValor
    if (operador === '<=') return (bruto as any) <= (paramValor as any)
    return (bruto as any) >= (paramValor as any)
  }

  m = atomo.match(new RegExp(`^(${CAMPO}) (<=|>=|=|<>) '([^']*)'$`))
  if (m) {
    const [, campo, operador, literal] = m as [string, string, string, string]
    const bruto = resolverCampoOuJson(campo, linha)
    const valor = bruto === null || bruto === undefined ? '' : String(bruto)
    if (operador === '=') return valor === literal
    if (operador === '<>') return valor !== literal
    if (operador === '<=') return valor <= literal
    return valor >= literal
  }

  // Igualdade entre duas colunas (estilo condição de JOIN, sem parâmetro).
  m = atomo.match(new RegExp(`^(${CAMPO}) = (${CAMPO})$`))
  if (m) {
    const [, esquerda, direita] = m as [string, string, string]
    return resolverCampoOuJson(esquerda, linha) === resolverCampoOuJson(direita, linha)
  }

  return undefined
}

/** Avalia uma expressão WHERE/JOIN completa, com suporte a `AND`/`OR` top-level e parênteses (ex.: OR dinâmico de grupos ANDed). */
function avaliarExpressao(expr: string, params: Params, linha: Linha): boolean {
  const exprTrim = expr.trim()

  if (parensEnvolvemTudo(exprTrim)) {
    return avaliarExpressao(exprTrim.slice(1, -1), params, linha)
  }

  const comoAtomo = tentarAvaliarAtomo(exprTrim, params, linha)
  if (comoAtomo !== undefined) return comoAtomo

  const orPartes = dividirTopNivel(exprTrim, ' OR ')
  if (orPartes.length > 1) return orPartes.some((p) => avaliarExpressao(p, params, linha))

  const andPartes = dividirTopNivel(exprTrim, ' AND ')
  if (andPartes.length > 1) return andPartes.every((p) => avaliarExpressao(p, params, linha))

  throw new Error(`FakeQueryBuilder: expressão WHERE/JOIN não suportada: "${expr}"`)
}

function resolverValorSelect(expr: string, linha: Linha): unknown {
  const comCast = extrairJsonComCast(expr)
  if (comCast) {
    const bruto = resolverCampo(comCast.campoBase, linha)
    if (bruto === null || bruto === undefined) return null
    const valor = (bruto as Record<string, unknown>)[comCast.chave] ?? null
    if (valor === null) return null
    return comCast.cast === 'int' ? Number(valor) : String(valor)
  }
  const jsonMatch = expr.match(/^(\w+\.\w+)\s*->>\s*'(\w+)'$/)
  if (jsonMatch) {
    const [, campoBase, chave] = jsonMatch as [string, string, string]
    const bruto = resolverCampo(campoBase, linha)
    if (bruto === null || bruto === undefined) return null
    return (bruto as Record<string, unknown>)[chave] ?? null
  }
  const simples = expr.match(/^(\w+\.\w+)$/)
  if (simples) return resolverCampo(simples[1] as string, linha)
  throw new Error(`FakeQueryBuilder: SELECT não suportado fora de agregação: "${expr}"`)
}

function ehExpressaoAgregada(expr: string): boolean {
  return /^(COUNT|AVG|SUM|MIN|MAX)\(/.test(expr)
}

/** Resultado bruto de agregação — string (ou null), espelhando o driver `pg` real (sempre string/null, nunca number). */
function calcularAgregado(expr: string, linhas: Linha[]): string | null {
  if (expr === 'COUNT(*)') return String(linhas.length)

  const countDistinct = expr.match(/^COUNT\(DISTINCT (\w+\.\w+)\)$/)
  if (countDistinct) {
    const campo = countDistinct[1] as string
    const valores = new Set(linhas.map((linha) => resolverCampo(campo, linha)))
    return String(valores.size)
  }

  const countColuna = expr.match(/^COUNT\((\w+\.\w+)\)$/)
  if (countColuna) {
    const campo = countColuna[1] as string
    return String(linhas.filter((linha) => resolverCampo(campo, linha) !== null && resolverCampo(campo, linha) !== undefined).length)
  }

  const media = expr.match(/^AVG\(EXTRACT\(EPOCH FROM \((\w+\.\w+) - (\w+\.\w+)\)\) \/ 3600\)$/)
  if (media) {
    if (linhas.length === 0) return null
    const [, campoFim, campoInicio] = media as [string, string, string]
    const horas = linhas.map((linha) => {
      const fim = new Date(resolverCampo(campoFim, linha) as Date | string).getTime()
      const inicio = new Date(resolverCampo(campoInicio, linha) as Date | string).getTime()
      return (fim - inicio) / 1000 / 3600
    })
    const soma = horas.reduce((acc, h) => acc + h, 0)
    return String(soma / horas.length)
  }

  throw new Error(`FakeQueryBuilder: expressão de SELECT/agregação não suportada: "${expr}"`)
}

export class FakeQueryBuilder {
  private selects: { expr: string; alias: string }[] = []
  private joins: JoinInfo[] = []
  private condicoes: string[] = []
  private params: Params = {}
  private groupBys: string[] = []
  private orderBys: string[] = []

  constructor(
    private readonly linhasBase: unknown[],
    private readonly aliasBase: string,
    private readonly resolverLinhasDaEntidade: (entidade: Function) => unknown[],
  ) {}

  select(expr: string, alias?: string): this {
    this.selects = [{ expr, alias: alias ?? expr }]
    return this
  }

  addSelect(expr: string, alias?: string): this {
    this.selects.push({ expr, alias: alias ?? expr })
    return this
  }

  where(condicao: string, params?: Params): this {
    this.condicoes = [condicao]
    if (params) Object.assign(this.params, params)
    return this
  }

  andWhere(condicao: string, params?: Params): this {
    this.condicoes.push(condicao)
    if (params) Object.assign(this.params, params)
    return this
  }

  innerJoin(entidade: Function, alias: string, condicao: string, params?: Params): this {
    this.joins.push({ entidade, alias, condicao })
    if (params) Object.assign(this.params, params)
    return this
  }

  groupBy(expr: string): this {
    this.groupBys = [expr]
    return this
  }

  addGroupBy(expr: string): this {
    this.groupBys.push(expr)
    return this
  }

  orderBy(expr: string): this {
    this.orderBys = [expr]
    return this
  }

  addOrderBy(expr: string): this {
    this.orderBys.push(expr)
    return this
  }

  private montarLinhasJuntadas(): Linha[] {
    let linhas: Linha[] = this.linhasBase.map((linha) => ({ [this.aliasBase]: linha }))
    for (const join of this.joins) {
      const candidatas = this.resolverLinhasDaEntidade(join.entidade)
      const novas: Linha[] = []
      for (const linha of linhas) {
        for (const candidata of candidatas) {
          const combinada = { ...linha, [join.alias]: candidata }
          if (avaliarExpressao(join.condicao, this.params, combinada)) novas.push(combinada)
        }
      }
      linhas = novas
    }
    return linhas
  }

  private linhasFiltradas(): Linha[] {
    const juntadas = this.montarLinhasJuntadas()
    const filtradas = juntadas.filter((linha) => this.condicoes.every((condicao) => avaliarExpressao(condicao, this.params, linha)))
    if (this.orderBys.length === 0) return filtradas
    return [...filtradas].sort((a, b) => {
      for (const campo of this.orderBys) {
        const va = String(resolverCampoOuJson(campo, a) ?? '')
        const vb = String(resolverCampoOuJson(campo, b) ?? '')
        const cmp = va.localeCompare(vb)
        if (cmp !== 0) return cmp
      }
      return 0
    })
  }

  async getCount(): Promise<number> {
    return this.linhasFiltradas().length
  }

  async getRawMany<T = Linha>(): Promise<T[]> {
    const linhas = this.linhasFiltradas()

    if (this.groupBys.length === 0) {
      return linhas.map((linha) => {
        const resultado: Linha = {}
        for (const s of this.selects) resultado[s.alias] = resolverValorSelect(s.expr, linha)
        return resultado
      }) as T[]
    }

    const grupos = new Map<string, Linha[]>()
    for (const linha of linhas) {
      const chave = this.groupBys.map((g) => JSON.stringify(resolverCampoOuJson(g, linha))).join('|')
      const arr = grupos.get(chave) ?? []
      arr.push(linha)
      grupos.set(chave, arr)
    }

    const resultado: Linha[] = []
    for (const linhasDoGrupo of grupos.values()) {
      const linhaResultado: Linha = {}
      for (const s of this.selects) {
        linhaResultado[s.alias] = ehExpressaoAgregada(s.expr)
          ? calcularAgregado(s.expr, linhasDoGrupo)
          : resolverValorSelect(s.expr, linhasDoGrupo[0] as Linha)
      }
      resultado.push(linhaResultado)
    }
    return resultado as T[]
  }

  async getRawOne<T = Linha>(): Promise<T> {
    const linhas = this.linhasFiltradas()
    const resultado: Linha = {}
    for (const s of this.selects) resultado[s.alias] = calcularAgregado(s.expr, linhas)
    return resultado as T
  }
}
