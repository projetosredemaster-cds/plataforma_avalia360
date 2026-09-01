import { randomUUID } from 'node:crypto'

type Relacoes = Record<string, boolean> | undefined

/**
 * Repositório TypeORM falso, em memória, cobrindo só o subconjunto de API
 * usado pelos services desta task (`find`, `findOne`, `findOneBy`, `create`,
 * `save`, `delete`). Não há Postgres/Supabase disponível nesta sessão — este
 * fake substitui `AppDataSource.getRepository(...)` via `vi.mock('.../data-source')`
 * nos specs, mantendo o código de produção (`colaboradores.service.ts`,
 * `equipes.service.ts`, middleware `autenticar`) rodando sem nenhuma
 * alteração.
 */
export class FakeRepository<T extends { id: string }> {
  private linhas: T[] = []

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

  find = async (opcoes?: { relations?: Relacoes; order?: Record<string, 'ASC' | 'DESC'> }): Promise<T[]> => {
    let resultado = [...this.linhas]
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

  private aplicarRelacoes(linha: T, relacoes: Relacoes): T {
    return this.resolverRelacoes ? this.resolverRelacoes({ ...linha }, relacoes) : linha
  }

  private encontrarPorWhere(where: Partial<T>): T | undefined {
    return this.linhas.find((linha) => this.combina(linha, where))
  }

  private combina(linha: T, where: Partial<T>): boolean {
    return Object.entries(where).every(([chave, valor]) => (linha as any)[chave] === valor)
  }
}
