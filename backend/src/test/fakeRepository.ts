import { randomUUID } from 'node:crypto'
import { FindOperator } from 'typeorm'
import { FakeQueryBuilder } from './fakeQueryBuilder'

type Relacoes = Record<string, boolean> | undefined

/** Resolve outro repositório fake a partir da classe de entidade — usado só por `createQueryBuilder` (joins). */
export type ResolverEntidadeFake = (entidade: Function) => { todas: () => unknown[] }

/**
 * Repositório TypeORM falso, em memória, cobrindo só o subconjunto de API
 * usado pelos services desta task (`find`, `findOne`, `findOneBy`, `count`,
 * `create`, `save`, `delete`, `createQueryBuilder`). Não há Postgres/Supabase
 * disponível nesta sessão — este fake substitui `AppDataSource.getRepository(...)`
 * via `vi.mock('.../data-source')` nos specs, mantendo o código de produção
 * (`colaboradores.service.ts`, `equipes.service.ts`, `analise.service.ts`,
 * middleware `autenticar`) rodando sem nenhuma alteração.
 *
 * `createQueryBuilder` (adicionado para o módulo `analise`, que agrega via
 * `QueryBuilder`/SQL cru em vez de `find`/`count` simples) só suporta o
 * subconjunto de sintaxe efetivamente usado por `analise.service.ts` — ver
 * `fakeQueryBuilder.ts` para o que é interpretado (`select`/`addSelect`,
 * `where`/`andWhere` com `<=`/`>=`/`=`/`IN (:...x)`/`BETWEEN ... AND
 * ...`/`IS [NOT] NULL`, `innerJoin` por igualdade de coluna, `AVG(EXTRACT(...))`/
 * `COUNT(*)` em `getRawOne`). Não é um interpretador SQL genérico.
 */
export class FakeRepository<T extends { id: string }> {
  private linhas: T[] = []

  /** Setado externamente (ver `test/analiseFixtures.ts`) para permitir que `createQueryBuilder` resolva JOINs contra outros repositórios fake. */
  resolverEntidade?: ResolverEntidadeFake

  constructor(private readonly resolverRelacoes?: (linha: T, relacoes: Relacoes) => T) {}

  /** Substitui todo o conteúdo do repositório — usar em beforeEach para isolar testes. */
  semear(linhas: T[]): void {
    this.linhas = [...linhas]
  }

  todas(): T[] {
    return [...this.linhas]
  }

  create = (parcial: Partial<T>): T => {
    const agora = new Date()
    return {
      id: randomUUID(),
      criadoEm: agora,
      atualizadoEm: agora,
      ...parcial,
    } as T
  }

  find = async (opcoes?: {
    where?: Partial<T>
    relations?: Relacoes
    order?: Record<string, 'ASC' | 'DESC'>
  }): Promise<T[]> => {
    let resultado = opcoes?.where
      ? this.linhas.filter((linha) => this.combina(linha, opcoes.where!))
      : [...this.linhas]
    if (opcoes?.order) {
      const entrada = Object.entries(opcoes.order)[0]
      if (entrada) {
        const [campo, direcao] = entrada
        resultado = resultado.sort((a, b) => {
          const diferenca = new Date((a as any)[campo]).getTime() - new Date((b as any)[campo]).getTime()
          return direcao === 'ASC' ? diferenca : -diferenca
        })
      }
    }
    return resultado.map((linha) => this.aplicarRelacoes(linha, opcoes?.relations))
  }

  findOne = async (opcoes: { where: Partial<T>; relations?: Relacoes }): Promise<T | null> => {
    const linha = this.encontrarPorWhere(opcoes.where)
    return linha ? this.aplicarRelacoes(linha, opcoes.relations) : null
  }

  findOneBy = async (where: Partial<T>): Promise<T | null> => {
    const linha = this.encontrarPorWhere(where)
    return linha ? this.aplicarRelacoes(linha, undefined) : null
  }

  count = async (opcoes?: { where?: Partial<T> }): Promise<number> => {
    if (!opcoes?.where) return this.linhas.length
    return this.linhas.filter((linha) => this.combina(linha, opcoes.where!)).length
  }

  save = async (entidade: T): Promise<T> => {
    const indiceExistente = this.linhas.findIndex((linha) => linha.id === entidade.id)
    const salvo: T = { ...entidade, atualizadoEm: new Date() }
    if (indiceExistente >= 0) {
      this.linhas[indiceExistente] = salvo
    } else {
      this.linhas.push(salvo)
    }
    return salvo
  }

  delete = async (where: Partial<T>): Promise<void> => {
    this.linhas = this.linhas.filter((linha) => !this.combina(linha, where))
  }

  /** Ver limitações de sintaxe suportada no comentário da classe/`fakeQueryBuilder.ts`. */
  createQueryBuilder = (alias: string): FakeQueryBuilder => {
    if (!this.resolverEntidade) {
      throw new Error('FakeRepository.resolverEntidade não configurado — ver test/analiseFixtures.ts')
    }
    const resolverEntidade = this.resolverEntidade
    return new FakeQueryBuilder(this.todas(), alias, (entidade) => resolverEntidade(entidade).todas())
  }

  private aplicarRelacoes(linha: T, relacoes: Relacoes): T {
    return this.resolverRelacoes ? this.resolverRelacoes({ ...linha }, relacoes) : linha
  }

  private encontrarPorWhere(where: Partial<T>): T | undefined {
    return this.linhas.find((linha) => this.combina(linha, where))
  }

  private combina(linha: T, where: Partial<T>): boolean {
    return Object.entries(where).every(([chave, valor]) => {
      if (valor instanceof FindOperator) {
        if (valor.type === 'in') return (valor.value as unknown[]).includes((linha as any)[chave])
        throw new Error(`FakeRepository: operador FindOperator "${valor.type}" não suportado`)
      }
      return (linha as any)[chave] === valor
    })
  }
}
