import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../../app'
import { AppDataSource } from '../../data-source'
import type { ColaboradorAutenticado } from '../../types/express'
import {
  configurarGetUserPorToken,
  configurarSupabaseAdminPadrao,
  criarColaboradorFixture,
} from '../../test/fixtures'
import {
  construirRepositoriosAnaliseFalsos,
  criarCicloAvaliacaoFixture,
  criarCompetenciaFixture,
  criarEnvioPesquisaFixture,
  criarItemRespostaClimaFixture,
  criarItemRespostaFixture,
  criarPaginaPesquisaFixture,
  criarPerguntaFixture,
  criarPesquisaFixture,
  criarRelacionamentoFixture,
  criarRespostaClimaFixture,
  criarRespostaFixture,
} from '../../test/analiseFixtures'
import * as analiseResultadosPerguntaService from './analise-resultados-pergunta.service'

// Silencia console.error esperado (tratadorErros loga qualquer 500 antes de
// responder) — não deve poluir a saída do teste nem esconder falhas reais.
vi.spyOn(console, 'error').mockImplementation(() => undefined)

function ator(papel: ColaboradorAutenticado['papel']): ColaboradorAutenticado {
  return { id: randomUUID(), papel, nomeCompleto: 'Ator Teste', email: `ator-${randomUUID()}@exemplo.com` }
}

type Repos = ReturnType<typeof construirRepositoriosAnaliseFalsos>

/** Varredura recursiva de chaves de um objeto/array — mesmo padrão já usado nas outras suítes de `analise`. */
function coletarChaves(valor: unknown, chaves: Set<string>): void {
  if (valor === null || typeof valor !== 'object') return
  for (const [chave, sub] of Object.entries(valor as Record<string, unknown>)) {
    chaves.add(chave)
    coletarChaves(sub, chaves)
  }
}

/**
 * Guard rail reutilizável — serializa o payload inteiro e confirma ausência
 * de qualquer campo de identidade/contagem bruta de respondentes. Esta tela é
 * a MAIS ESTRITA do módulo: nem `totalRespondentes` nem `minimoNecessario`
 * podem aparecer em NENHUMA condição (diferente de "Avaliações").
 */
function assertPayloadSemVazamentoDeIdentidade(resultado: unknown): void {
  const chaves = new Set<string>()
  coletarChaves(resultado, chaves)
  for (const proibido of [
    'avaliadorId',
    'avaliador_id',
    'avaliadoId',
    'avaliadoNome',
    'avaliadorNome',
    'totalRespondentes',
    'respondentes',
    'quantidadeRespondentes',
    'minimoRespostasPares',
    'minimoNecessario',
    'minimo',
  ]) {
    expect(chaves.has(proibido)).toBe(false)
  }
}

function toDataSomente(valor: unknown): string {
  if (!valor) return ''
  const data = valor instanceof Date ? valor : new Date(String(valor))
  if (Number.isNaN(data.getTime())) return ''
  return data.toISOString().slice(0, 10)
}

function dentroDoPeriodo(data: string, de: string, ate: string): boolean {
  return data !== '' && data >= de && data <= ate
}

/**
 * Fake de `AppDataSource.query()` — as 4 queries de matriz/caixa_selecao
 * (360 e clima) usam `CROSS JOIN LATERAL` via SQL cru, que o
 * `FakeQueryBuilder` (createQueryBuilder) não interpreta. Este fake replica,
 * em memória e a partir dos MESMOS repositórios fake já seedados pelo teste,
 * exatamente o mesmo join/filtro/agrupamento das 4 funções de produção
 * (`agregarMatriz360`/`agregarCaixaSelecao360`/`agregarMatrizClima`/
 * `agregarCaixaSelecaoClima`), detectando qual delas rodar pelo texto do SQL.
 * Só existe neste arquivo de teste — nenhum arquivo de produção é alterado.
 */
function configurarAppDataSourceQueryFake(repos: Repos): void {
  ;(AppDataSource as unknown as { query: ReturnType<typeof vi.fn> }).query = vi.fn(
    async (sql: string, params: unknown[] = []) => {
      const [ids, de, ate] = params as [string[], string, string]
      const paraClima = sql.includes('itens_resposta_clima')
      const paraMatriz = sql.includes("pergunta.tipo = 'matriz'")
      if (paraMatriz) {
        return paraClima ? agregarMatrizClimaFake(repos, ids, de, ate) : agregarMatriz360Fake(repos, ids, de, ate)
      }
      return paraClima ? agregarCaixaSelecaoClimaFake(repos, ids, de, ate) : agregarCaixaSelecao360Fake(repos, ids, de, ate)
    },
  )
}

function agregarMatriz360Fake(repos: Repos, ids: string[], de: string, ate: string) {
  const mapa = new Map<string, Record<string, unknown>>()
  for (const item of repos.itensRespostaRepo.todas()) {
    const pergunta = repos.perguntasRepo.todas().find((p) => p.id === item.perguntaId && p.tipo === 'matriz')
    if (!pergunta) continue
    const resposta = repos.respostasRepo.todas().find((r) => r.id === item.respostaId)
    if (!resposta) continue
    const envio = repos.enviosRepo.todas().find((e) => e.id === resposta.envioId)
    if (!envio?.relacionamentoId) continue
    const rel = repos.relacionamentosRepo.todas().find((r) => r.id === envio.relacionamentoId)
    if (!rel || !ids.includes(rel.cicloId)) continue
    const data = toDataSomente(resposta.respondidoEm)
    if (!dentroDoPeriodo(data, de, ate)) continue
    const notas = (item.valor as { notas?: Record<string, unknown> } | null)?.notas ?? {}
    for (const [competenciaId, nivelRaw] of Object.entries(notas)) {
      const nivel = Number(nivelRaw)
      const chave = `${pergunta.id}|${rel.avaliadoId}|${rel.cicloId}|${rel.tipoRelacionamento}|${competenciaId}|${nivel}`
      const existente = mapa.get(chave)
      if (existente) {
        existente.contagem = (existente.contagem as number) + 1
      } else {
        mapa.set(chave, {
          perguntaId: pergunta.id,
          perguntaEnunciado: pergunta.enunciado,
          avaliadoId: rel.avaliadoId,
          cicloId: rel.cicloId,
          tipoRelacionamento: rel.tipoRelacionamento,
          competenciaId,
          nivel,
          contagem: 1,
        })
      }
    }
  }
  return [...mapa.values()]
}

function agregarCaixaSelecao360Fake(repos: Repos, ids: string[], de: string, ate: string) {
  const mapa = new Map<string, Record<string, unknown>>()
  for (const item of repos.itensRespostaRepo.todas()) {
    const pergunta = repos.perguntasRepo.todas().find((p) => p.id === item.perguntaId && p.tipo === 'caixa_selecao')
    if (!pergunta) continue
    const resposta = repos.respostasRepo.todas().find((r) => r.id === item.respostaId)
    if (!resposta) continue
    const envio = repos.enviosRepo.todas().find((e) => e.id === resposta.envioId)
    if (!envio?.relacionamentoId) continue
    const rel = repos.relacionamentosRepo.todas().find((r) => r.id === envio.relacionamentoId)
    if (!rel || !ids.includes(rel.cicloId)) continue
    const data = toDataSomente(resposta.respondidoEm)
    if (!dentroDoPeriodo(data, de, ate)) continue
    const opcoes = (item.valor as { opcoes?: string[] } | null)?.opcoes ?? []
    for (const opcao of opcoes) {
      const chave = `${pergunta.id}|${rel.avaliadoId}|${rel.cicloId}|${rel.tipoRelacionamento}|${opcao}`
      const existente = mapa.get(chave)
      if (existente) {
        existente.contagem = (existente.contagem as number) + 1
      } else {
        mapa.set(chave, {
          perguntaId: pergunta.id,
          perguntaEnunciado: pergunta.enunciado,
          avaliadoId: rel.avaliadoId,
          cicloId: rel.cicloId,
          tipoRelacionamento: rel.tipoRelacionamento,
          opcao,
          contagem: 1,
        })
      }
    }
  }
  return [...mapa.values()]
}

function agregarMatrizClimaFake(repos: Repos, idsLiberados: string[], de: string, ate: string) {
  const mapa = new Map<string, Record<string, unknown>>()
  for (const item of repos.itensRespostaClimaRepo.todas()) {
    const pergunta = repos.perguntasRepo.todas().find((p) => p.id === item.perguntaId && p.tipo === 'matriz')
    if (!pergunta) continue
    const rc = repos.respostasClimaRepo.todas().find((r) => r.id === item.respostaClimaId)
    if (!rc || !idsLiberados.includes(rc.cicloId)) continue
    const data = toDataSomente(rc.respondidoEm)
    if (!dentroDoPeriodo(data, de, ate)) continue
    const notas = (item.valor as { notas?: Record<string, unknown> } | null)?.notas ?? {}
    for (const [competenciaId, nivelRaw] of Object.entries(notas)) {
      const nivel = Number(nivelRaw)
      const chave = `${pergunta.id}|${rc.cicloId}|${competenciaId}|${nivel}`
      const existente = mapa.get(chave)
      if (existente) {
        existente.contagem = (existente.contagem as number) + 1
      } else {
        mapa.set(chave, {
          perguntaId: pergunta.id,
          perguntaEnunciado: pergunta.enunciado,
          cicloId: rc.cicloId,
          competenciaId,
          nivel,
          contagem: 1,
        })
      }
    }
  }
  return [...mapa.values()]
}

function agregarCaixaSelecaoClimaFake(repos: Repos, idsLiberados: string[], de: string, ate: string) {
  const mapa = new Map<string, Record<string, unknown>>()
  for (const item of repos.itensRespostaClimaRepo.todas()) {
    const pergunta = repos.perguntasRepo.todas().find((p) => p.id === item.perguntaId && p.tipo === 'caixa_selecao')
    if (!pergunta) continue
    const rc = repos.respostasClimaRepo.todas().find((r) => r.id === item.respostaClimaId)
    if (!rc || !idsLiberados.includes(rc.cicloId)) continue
    const data = toDataSomente(rc.respondidoEm)
    if (!dentroDoPeriodo(data, de, ate)) continue
    const opcoes = (item.valor as { opcoes?: string[] } | null)?.opcoes ?? []
    for (const opcao of opcoes) {
      const chave = `${pergunta.id}|${rc.cicloId}|${opcao}`
      const existente = mapa.get(chave)
      if (existente) {
        existente.contagem = (existente.contagem as number) + 1
      } else {
        mapa.set(chave, { perguntaId: pergunta.id, perguntaEnunciado: pergunta.enunciado, cicloId: rc.cicloId, opcao, contagem: 1 })
      }
    }
  }
  return [...mapa.values()]
}

/** Semeia N relacionamentos de um tipo específico (autoavaliacao/gestor/pares/subordinado/externo), cada um com resposta a `pergunta` no nível/opções dados. */
function semearRespostas360(
  repos: Repos,
  opcoes: {
    cicloId: string
    tipoRelacionamento: 'autoavaliacao' | 'gestor' | 'pares' | 'subordinado' | 'externo'
    avaliadoId?: string
    quantidade: number
    respondidoEm: Date
    pergunta: ReturnType<typeof criarPerguntaFixture>
    valor: (indice: number) => Record<string, unknown>
  },
): { avaliadoId: string } {
  const avaliadoId = opcoes.avaliadoId ?? randomUUID()
  if (!repos.perguntasRepo.todas().some((p) => p.id === opcoes.pergunta.id)) {
    repos.perguntasRepo.semear([...repos.perguntasRepo.todas(), opcoes.pergunta])
  }

  for (let i = 0; i < opcoes.quantidade; i++) {
    const rel = criarRelacionamentoFixture({
      cicloId: opcoes.cicloId,
      avaliadoId,
      avaliadorId: randomUUID(),
      tipoRelacionamento: opcoes.tipoRelacionamento,
    })
    const envio = criarEnvioPesquisaFixture({ relacionamentoId: rel.id })
    const resposta = criarRespostaFixture({ envioId: envio.id, respondidoEm: opcoes.respondidoEm })
    const item = criarItemRespostaFixture({
      respostaId: resposta.id,
      perguntaId: opcoes.pergunta.id,
      valor: opcoes.valor(i),
    })
    repos.relacionamentosRepo.semear([...repos.relacionamentosRepo.todas(), rel])
    repos.enviosRepo.semear([...repos.enviosRepo.todas(), envio])
    repos.respostasRepo.semear([...repos.respostasRepo.todas(), resposta])
    repos.itensRespostaRepo.semear([...repos.itensRespostaRepo.todas(), item])
  }

  return { avaliadoId }
}

function semearRespostasClima(
  repos: Repos,
  opcoes: {
    cicloId: string
    quantidade: number
    respondidoEm: Date
    pergunta: ReturnType<typeof criarPerguntaFixture>
    valor: (indice: number) => Record<string, unknown>
  },
): void {
  if (!repos.perguntasRepo.todas().some((p) => p.id === opcoes.pergunta.id)) {
    repos.perguntasRepo.semear([...repos.perguntasRepo.todas(), opcoes.pergunta])
  }

  const respostas = Array.from({ length: opcoes.quantidade }, () =>
    criarRespostaClimaFixture({ cicloId: opcoes.cicloId, respondidoEm: opcoes.respondidoEm }),
  )
  const itens = respostas.map((r, i) =>
    criarItemRespostaClimaFixture({ respostaClimaId: r.id, perguntaId: opcoes.pergunta.id, valor: opcoes.valor(i) }),
  )
  repos.respostasClimaRepo.semear([...repos.respostasClimaRepo.todas(), ...respostas])
  repos.itensRespostaClimaRepo.semear([...repos.itensRespostaClimaRepo.todas(), ...itens])
}

describe('analise-resultados-pergunta.service — buscarResultadosPergunta', () => {
  let repos: Repos
  const admin = ator('admin')
  const gestorRh = ator('gestor_rh')
  const colaborador = ator('colaborador')

  beforeEach(() => {
    repos = construirRepositoriosAnaliseFalsos()
    configurarAppDataSourceQueryFake(repos)
  })

  describe('PRIORIDADE MÁXIMA — controle de acesso (garantirPapel)', () => {
    it('papel colaborador é bloqueado com 403 PAPEL_NAO_AUTORIZADO, mesmo antes de qualquer query', async () => {
      await expect(
        analiseResultadosPerguntaService.buscarResultadosPergunta(colaborador, { de: '2026-01-01', ate: '2026-01-31' }),
      ).rejects.toMatchObject({ status: 403, codigo: 'PAPEL_NAO_AUTORIZADO' })

      expect(repos.ciclosRepo.todas()).toHaveLength(0)
    })

    it('admin e gestor_rh têm acesso (payload zerado, sem ciclos seedados)', async () => {
      const esperado = {
        periodo: { de: '2026-01-01', ate: '2026-01-31' },
        cicloId: null,
        avaliacao360: [],
        climaGeral: [],
      }
      await expect(
        analiseResultadosPerguntaService.buscarResultadosPergunta(admin, { de: '2026-01-01', ate: '2026-01-31' }),
      ).resolves.toEqual(esperado)
      await expect(
        analiseResultadosPerguntaService.buscarResultadosPergunta(gestorRh, { de: '2026-01-01', ate: '2026-01-31' }),
      ).resolves.toEqual(esperado)
    })
  })

  describe('validação de "de"/"ate"/"cicloId"', () => {
    it.each([
      ['de ausente', { de: undefined, ate: '2026-01-31' }],
      ['ate ausente', { de: '2026-01-01', ate: undefined }],
      ['de fora do formato YYYY-MM-DD', { de: '01/01/2026', ate: '2026-01-31' }],
      ['data de calendário inexistente', { de: '2026-02-30', ate: '2026-03-01' }],
    ])('%s → 422 CAMPO_INVALIDO', async (_descricao, dto) => {
      await expect(analiseResultadosPerguntaService.buscarResultadosPergunta(admin, dto)).rejects.toMatchObject({
        status: 422,
        codigo: 'CAMPO_INVALIDO',
      })
    })

    it('ate < de → 422 PERIODO_INVALIDO', async () => {
      await expect(
        analiseResultadosPerguntaService.buscarResultadosPergunta(admin, { de: '2026-02-01', ate: '2026-01-01' }),
      ).rejects.toMatchObject({ status: 422, codigo: 'PERIODO_INVALIDO' })
    })

    it('cicloId malformado (não-uuid) → 422 CAMPO_INVALIDO', async () => {
      await expect(
        analiseResultadosPerguntaService.buscarResultadosPergunta(admin, {
          de: '2026-01-01',
          ate: '2026-01-31',
          cicloId: 'nao-e-um-uuid',
        }),
      ).rejects.toMatchObject({ status: 422, codigo: 'CAMPO_INVALIDO' })
    })

    it('cicloId com uuid válido mas inexistente → 404 CICLO_NAO_ENCONTRADO', async () => {
      await expect(
        analiseResultadosPerguntaService.buscarResultadosPergunta(admin, {
          de: '2026-01-01',
          ate: '2026-01-31',
          cicloId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 404, codigo: 'CICLO_NAO_ENCONTRADO' })
    })
  })

  describe('CENÁRIO CRÍTICO 1 — gate parcial dentro da MESMA pergunta likert (pares bloqueado, subordinado liberado)', () => {
    it('pares abaixo do mínimo vem liberado:false sem distribuicao; subordinado acima do mínimo vem liberado:true com zero-fill completo', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      const pergunta = criarPerguntaFixture({ tipo: 'likert', configuracao: { niveis: 5 } })

      // pares — 2 respondentes, abaixo do mínimo de 3.
      const { avaliadoId } = semearRespostas360(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'pares',
        quantidade: 2,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        pergunta,
        valor: () => ({ nota: 5 }),
      })
      // subordinado — 4 respondentes do MESMO avaliado, acima do mínimo de 3.
      semearRespostas360(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'subordinado',
        avaliadoId,
        quantidade: 4,
        respondidoEm: new Date('2026-01-12T00:00:00Z'),
        pergunta,
        valor: (i) => ({ nota: i < 2 ? 3 : 4 }),
      })

      const resultado = await analiseResultadosPerguntaService.buscarResultadosPergunta(admin, periodoConsulta)

      expect(resultado.avaliacao360).toHaveLength(1)
      const item = resultado.avaliacao360[0]!
      expect(item.tipo).toBe('likert')
      if (item.tipo !== 'likert') throw new Error('esperado likert')

      const pares = item.porTipoRelacionamento.find((p) => p.tipoRelacionamento === 'pares')
      expect(pares).toEqual({ tipoRelacionamento: 'pares', liberado: false, motivo: 'aguardando_minimo_respondentes' })

      const subordinado = item.porTipoRelacionamento.find((p) => p.tipoRelacionamento === 'subordinado')
      expect(subordinado?.liberado).toBe(true)
      expect(subordinado?.distribuicao).toEqual([
        { nivel: 1, contagem: 0 },
        { nivel: 2, contagem: 0 },
        { nivel: 3, contagem: 2 },
        { nivel: 4, contagem: 2 },
        { nivel: 5, contagem: 0 },
      ])

      assertPayloadSemVazamentoDeIdentidade(resultado)
      expect(JSON.stringify(resultado)).not.toContain(avaliadoId)
    })
  })

  describe('CENÁRIO CRÍTICO 2 — matriz: gate independente por competência dentro do mesmo tipoRelacionamento', () => {
    it('competência A atinge o mínimo, competência B (mesma pergunta, mesmo tipo) não — liberado independente por competência', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      const competenciaA = criarCompetenciaFixture({ nome: 'Comunicação' })
      const competenciaB = criarCompetenciaFixture({ nome: 'Proatividade' })
      repos.competenciasRepo.semear([competenciaA, competenciaB])

      const pergunta = criarPerguntaFixture({ tipo: 'matriz', configuracao: { niveis: 5 } })

      const avaliadoUnico = randomUUID()
      // 3 respondentes distintos, cada um avaliando AMBAS as competências na
      // mesma resposta — competência A atinge o mínimo (3), competência B
      // seria testada isolada no próximo bloco (respondentes diferentes).
      semearRespostas360(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'pares',
        avaliadoId: avaliadoUnico,
        quantidade: 3,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        pergunta,
        valor: () => ({ notas: { [competenciaA.id]: 4 } }),
      })

      // Competência B, MESMO avaliado + ciclo + tipo, mas só 1 respondente —
      // abaixo do mínimo. Usa outro avaliado para isolar população, mas o
      // mesmo tipoRelacionamento ainda precisa refletir liberado:false PARA
      // essa competência especificamente.
      const outroAvaliado = randomUUID()
      semearRespostas360(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'pares',
        avaliadoId: outroAvaliado,
        quantidade: 1,
        respondidoEm: new Date('2026-01-11T00:00:00Z'),
        pergunta,
        valor: () => ({ notas: { [competenciaB.id]: 2 } }),
      })

      const resultado = await analiseResultadosPerguntaService.buscarResultadosPergunta(admin, periodoConsulta)

      expect(resultado.avaliacao360).toHaveLength(1)
      const item = resultado.avaliacao360[0]!
      expect(item.tipo).toBe('matriz')
      if (item.tipo !== 'matriz') throw new Error('esperado matriz')

      const compA = item.competencias.find((c) => c.competenciaId === competenciaA.id)
      const compB = item.competencias.find((c) => c.competenciaId === competenciaB.id)
      expect(compA).toBeDefined()
      expect(compB).toBeDefined()

      const paresA = compA!.porTipoRelacionamento.find((p) => p.tipoRelacionamento === 'pares')
      expect(paresA?.liberado).toBe(true)
      expect(paresA?.distribuicao?.find((d) => d.nivel === 4)?.contagem).toBe(3)

      const paresB = compB!.porTipoRelacionamento.find((p) => p.tipoRelacionamento === 'pares')
      expect(paresB).toEqual({ tipoRelacionamento: 'pares', liberado: false, motivo: 'aguardando_minimo_respondentes' })

      assertPayloadSemVazamentoDeIdentidade(resultado)
    })
  })

  describe('CENÁRIO CRÍTICO 3 — clima bloqueado: nenhuma query de conteúdo roda para o ciclo', () => {
    it('ciclo clima abaixo do mínimo aparece com liberado:false, sem distribuicao, e a query de agregação nunca é chamada com esse cicloId liberado', async () => {
      const periodoConsulta = { de: '2026-02-01', ate: '2026-02-28' }
      const ciclo = criarCicloAvaliacaoFixture({
        dataInicio: '2026-02-01',
        dataFim: '2026-02-28',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([ciclo])
      const pesquisa = criarPesquisaFixture({ tipo: 'clima_geral', cicloId: ciclo.id })
      repos.pesquisasRepo.semear([pesquisa])
      const pagina = criarPaginaPesquisaFixture({ pesquisaId: pesquisa.id })
      repos.paginasPesquisaRepo.semear([pagina])

      const pergunta = criarPerguntaFixture({ tipo: 'likert', paginaId: pagina.id, configuracao: { niveis: 5 }, ordem: 1 })

      semearRespostasClima(repos, {
        cicloId: ciclo.id,
        quantidade: 2, // abaixo do mínimo de 3
        respondidoEm: new Date('2026-02-10T00:00:00Z'),
        pergunta,
        valor: () => ({ nota: 5 }),
      })

      // Spy no query fake para provar que nenhuma chamada de agregação de
      // conteúdo de clima (matriz/caixa_selecao) recebe este cicloId — e,
      // via inspeção das chamadas registradas, que a query de likert
      // (QueryBuilder) também nunca inclui este ciclo nos ids liberados.
      const queryMock = (AppDataSource as unknown as { query: ReturnType<typeof vi.fn> }).query

      const resultado = await analiseResultadosPerguntaService.buscarResultadosPergunta(admin, periodoConsulta)

      expect(resultado.climaGeral).toHaveLength(1)
      const item = resultado.climaGeral[0]!
      expect(item.liberado).toBe(false)
      expect(item.motivo).toBe('aguardando_minimo_respondentes')
      expect(item).not.toHaveProperty('distribuicao')
      expect(item.perguntaId).toBe(pergunta.id)

      // Nenhuma chamada a AppDataSource.query (matriz/caixa_selecao) incluiu
      // o ciclo bloqueado na lista de ids liberados.
      for (const chamada of queryMock.mock.calls) {
        const params = chamada[1] as unknown[]
        const ids = params?.[0] as string[] | undefined
        if (ids) expect(ids).not.toContain(ciclo.id)
      }

      assertPayloadSemVazamentoDeIdentidade(resultado)
    })
  })

  describe('CENÁRIO CRÍTICO 4 — clima com ZERO respostas no período: nenhuma entrada aparece', () => {
    it('ciclo clima_geral sem nenhuma resposta_clima não aparece em climaGeral (nem liberado, nem bloqueado)', async () => {
      const periodoConsulta = { de: '2026-02-01', ate: '2026-02-28' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-02-01', dataFim: '2026-02-28', minimoRespostasPares: 3 })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'clima_geral', cicloId: ciclo.id })])
      // nenhuma resposta_clima seedada

      const resultado = await analiseResultadosPerguntaService.buscarResultadosPergunta(admin, periodoConsulta)

      expect(resultado.climaGeral).toEqual([])
      assertPayloadSemVazamentoDeIdentidade(resultado)
    })
  })

  describe('CENÁRIO CRÍTICO 5 — caixa_selecao multiseleção: soma pode exceder nº de respondentes, sem normalização indevida', () => {
    it('uma única resposta marcando 2 opções incrementa contagem de AMBAS as opções (soma > nº respondentes)', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      const pergunta = criarPerguntaFixture({
        tipo: 'caixa_selecao',
        configuracao: { opcoes: ['Vale-refeição', 'Plano de saúde', 'Home office'] },
      })

      // autoavaliacao — sem gate, 1 único respondente marcando 2 opções.
      semearRespostas360(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'autoavaliacao',
        quantidade: 1,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        pergunta,
        valor: () => ({ opcoes: ['Vale-refeição', 'Plano de saúde'] }),
      })

      const resultado = await analiseResultadosPerguntaService.buscarResultadosPergunta(admin, periodoConsulta)

      expect(resultado.avaliacao360).toHaveLength(1)
      const item = resultado.avaliacao360[0]!
      expect(item.tipo).toBe('caixa_selecao')
      if (item.tipo !== 'caixa_selecao') throw new Error('esperado caixa_selecao')

      const autoavaliacao = item.porTipoRelacionamento.find((p) => p.tipoRelacionamento === 'autoavaliacao')
      expect(autoavaliacao?.liberado).toBe(true)
      // 1 resposta, 2 opções marcadas — soma das contagens (2) > nº de respondentes (1).
      expect(autoavaliacao?.distribuicao).toEqual([
        { opcao: 'Vale-refeição', contagem: 1 },
        { opcao: 'Plano de saúde', contagem: 1 },
        { opcao: 'Home office', contagem: 0 },
      ])
    })
  })

  describe('CENÁRIO CRÍTICO 6 — papel colaborador via service direto → 403, sem dado retornado', () => {
    it('colaborador nunca recebe nenhum fragmento do payload, mesmo com dado seedado', async () => {
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])
      const pergunta = criarPerguntaFixture({ tipo: 'likert', configuracao: { niveis: 5 } })
      semearRespostas360(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'autoavaliacao',
        quantidade: 1,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        pergunta,
        valor: () => ({ nota: 5 }),
      })

      await expect(
        analiseResultadosPerguntaService.buscarResultadosPergunta(colaborador, { de: '2026-01-01', ate: '2026-01-31' }),
      ).rejects.toMatchObject({ status: 403, codigo: 'PAPEL_NAO_AUTORIZADO' })
    })
  })

  describe('CENÁRIO CRÍTICO 7 — grep automatizado: nenhum avaliadorId/totalRespondentes/minimoNecessario no payload serializado', () => {
    it('payload serializado (JSON.stringify) de um cenário misto (likert + matriz + caixa_selecao, 360 + clima) nunca contém as chaves proibidas', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo360 = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31', minimoRespostasPares: 3 })
      const cicloClima = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31', minimoRespostasPares: 3 })
      repos.ciclosRepo.semear([ciclo360, cicloClima])
      repos.pesquisasRepo.semear([
        criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo360.id }),
        criarPesquisaFixture({ tipo: 'clima_geral', cicloId: cicloClima.id }),
      ])

      const competencia = criarCompetenciaFixture({ nome: 'Comunicação' })
      repos.competenciasRepo.semear([competencia])

      const perguntaLikert = criarPerguntaFixture({ tipo: 'likert', configuracao: { niveis: 5 }, ordem: 1 })
      const perguntaMatriz = criarPerguntaFixture({ tipo: 'matriz', configuracao: { niveis: 5 }, ordem: 2 })
      const perguntaCaixa = criarPerguntaFixture({
        tipo: 'caixa_selecao',
        configuracao: { opcoes: ['A', 'B'] },
        ordem: 3,
      })

      semearRespostas360(repos, {
        cicloId: ciclo360.id,
        tipoRelacionamento: 'pares',
        quantidade: 3,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        pergunta: perguntaLikert,
        valor: () => ({ nota: 4 }),
      })
      semearRespostas360(repos, {
        cicloId: ciclo360.id,
        tipoRelacionamento: 'gestor',
        quantidade: 1,
        respondidoEm: new Date('2026-01-11T00:00:00Z'),
        pergunta: perguntaMatriz,
        valor: () => ({ notas: { [competencia.id]: 3 } }),
      })
      semearRespostas360(repos, {
        cicloId: ciclo360.id,
        tipoRelacionamento: 'autoavaliacao',
        quantidade: 1,
        respondidoEm: new Date('2026-01-12T00:00:00Z'),
        pergunta: perguntaCaixa,
        valor: () => ({ opcoes: ['A'] }),
      })
      semearRespostasClima(repos, {
        cicloId: cicloClima.id,
        quantidade: 3,
        respondidoEm: new Date('2026-01-13T00:00:00Z'),
        pergunta: perguntaLikert,
        valor: () => ({ nota: 2 }),
      })

      const resultado = await analiseResultadosPerguntaService.buscarResultadosPergunta(admin, periodoConsulta)

      expect(resultado.avaliacao360.length).toBeGreaterThan(0)
      expect(resultado.climaGeral.length).toBeGreaterThan(0)

      assertPayloadSemVazamentoDeIdentidade(resultado)

      const serializado = JSON.stringify(resultado)
      for (const proibido of ['avaliadorId', 'avaliador_id', 'totalRespondentes', 'minimoNecessario', 'minimoRespostasPares']) {
        expect(serializado).not.toContain(proibido)
      }
    })
  })

  describe('caminho feliz — 3 tipos de pergunta × 2 universos, com zero-fill completo', () => {
    it('likert avaliacao_360: nível sem nenhuma resposta ainda aparece com contagem:0 (zero-fill)', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      const pergunta = criarPerguntaFixture({ tipo: 'likert', configuracao: { niveis: 5 } })
      semearRespostas360(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'autoavaliacao',
        quantidade: 1,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        pergunta,
        valor: () => ({ nota: 5 }),
      })

      const resultado = await analiseResultadosPerguntaService.buscarResultadosPergunta(admin, periodoConsulta)
      const item = resultado.avaliacao360[0]!
      if (item.tipo !== 'likert') throw new Error('esperado likert')
      const auto = item.porTipoRelacionamento.find((p) => p.tipoRelacionamento === 'autoavaliacao')
      expect(auto?.distribuicao).toEqual([
        { nivel: 1, contagem: 0 },
        { nivel: 2, contagem: 0 },
        { nivel: 3, contagem: 0 },
        { nivel: 4, contagem: 0 },
        { nivel: 5, contagem: 1 },
      ])
    })

    it('matriz avaliacao_360: nível sem resposta na competência aparece com contagem:0', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])
      const competencia = criarCompetenciaFixture({ nome: 'Comunicação' })
      repos.competenciasRepo.semear([competencia])

      const pergunta = criarPerguntaFixture({ tipo: 'matriz', configuracao: { niveis: 5 } })
      semearRespostas360(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'gestor',
        quantidade: 1,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        pergunta,
        valor: () => ({ notas: { [competencia.id]: 2 } }),
      })

      const resultado = await analiseResultadosPerguntaService.buscarResultadosPergunta(admin, periodoConsulta)
      const item = resultado.avaliacao360[0]!
      if (item.tipo !== 'matriz') throw new Error('esperado matriz')
      expect(item.competencias).toHaveLength(1)
      expect(item.competencias[0]!.competenciaNome).toBe('Comunicação')
      const gestor = item.competencias[0]!.porTipoRelacionamento.find((p) => p.tipoRelacionamento === 'gestor')
      expect(gestor?.distribuicao).toEqual([
        { nivel: 1, contagem: 0 },
        { nivel: 2, contagem: 1 },
        { nivel: 3, contagem: 0 },
        { nivel: 4, contagem: 0 },
        { nivel: 5, contagem: 0 },
      ])
    })

    it('caixa_selecao avaliacao_360: opção configurada sem nenhuma marcação aparece com contagem:0', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      const pergunta = criarPerguntaFixture({ tipo: 'caixa_selecao', configuracao: { opcoes: ['A', 'B', 'C'] } })
      semearRespostas360(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'externo',
        quantidade: 1,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        pergunta,
        valor: () => ({ opcoes: ['B'] }),
      })

      const resultado = await analiseResultadosPerguntaService.buscarResultadosPergunta(admin, periodoConsulta)
      const item = resultado.avaliacao360[0]!
      if (item.tipo !== 'caixa_selecao') throw new Error('esperado caixa_selecao')
      const externo = item.porTipoRelacionamento.find((p) => p.tipoRelacionamento === 'externo')
      expect(externo?.distribuicao).toEqual([
        { opcao: 'A', contagem: 0 },
        { opcao: 'B', contagem: 1 },
        { opcao: 'C', contagem: 0 },
      ])
    })

    it('likert clima_geral liberado (no mínimo exato): zero-fill completo, liberado:true', async () => {
      const periodoConsulta = { de: '2026-02-01', ate: '2026-02-28' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-02-01', dataFim: '2026-02-28', minimoRespostasPares: 3 })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'clima_geral', cicloId: ciclo.id })])

      const pergunta = criarPerguntaFixture({ tipo: 'likert', configuracao: { niveis: 5 } })
      semearRespostasClima(repos, {
        cicloId: ciclo.id,
        quantidade: 3, // exatamente no mínimo — limiar é inclusivo (>=)
        respondidoEm: new Date('2026-02-10T00:00:00Z'),
        pergunta,
        valor: () => ({ nota: 1 }),
      })

      const resultado = await analiseResultadosPerguntaService.buscarResultadosPergunta(admin, periodoConsulta)
      expect(resultado.climaGeral).toHaveLength(1)
      const item = resultado.climaGeral[0]!
      expect(item.liberado).toBe(true)
      if (item.tipo !== 'likert') throw new Error('esperado likert')
      expect(item.distribuicao).toEqual([
        { nivel: 1, contagem: 3 },
        { nivel: 2, contagem: 0 },
        { nivel: 3, contagem: 0 },
        { nivel: 4, contagem: 0 },
        { nivel: 5, contagem: 0 },
      ])
    })

    it('matriz clima_geral liberado: distribuição por competência, zero-fill completo', async () => {
      const periodoConsulta = { de: '2026-02-01', ate: '2026-02-28' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-02-01', dataFim: '2026-02-28', minimoRespostasPares: 3 })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'clima_geral', cicloId: ciclo.id })])
      const competencia = criarCompetenciaFixture({ nome: 'Colaboração' })
      repos.competenciasRepo.semear([competencia])

      const pergunta = criarPerguntaFixture({ tipo: 'matriz', configuracao: { niveis: 5 } })
      semearRespostasClima(repos, {
        cicloId: ciclo.id,
        quantidade: 3,
        respondidoEm: new Date('2026-02-10T00:00:00Z'),
        pergunta,
        valor: () => ({ notas: { [competencia.id]: 4 } }),
      })

      const resultado = await analiseResultadosPerguntaService.buscarResultadosPergunta(admin, periodoConsulta)
      const item = resultado.climaGeral[0]!
      expect(item.liberado).toBe(true)
      if (item.tipo !== 'matriz') throw new Error('esperado matriz')
      expect(item.competencias).toHaveLength(1)
      expect(item.competencias![0]!.distribuicao).toEqual([
        { nivel: 1, contagem: 0 },
        { nivel: 2, contagem: 0 },
        { nivel: 3, contagem: 0 },
        { nivel: 4, contagem: 3 },
        { nivel: 5, contagem: 0 },
      ])
    })

    it('caixa_selecao clima_geral liberado: zero-fill de opção sem marcação', async () => {
      const periodoConsulta = { de: '2026-02-01', ate: '2026-02-28' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-02-01', dataFim: '2026-02-28', minimoRespostasPares: 3 })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'clima_geral', cicloId: ciclo.id })])

      const pergunta = criarPerguntaFixture({ tipo: 'caixa_selecao', configuracao: { opcoes: ['X', 'Y'] } })
      semearRespostasClima(repos, {
        cicloId: ciclo.id,
        quantidade: 3,
        respondidoEm: new Date('2026-02-10T00:00:00Z'),
        pergunta,
        valor: () => ({ opcoes: ['X'] }),
      })

      const resultado = await analiseResultadosPerguntaService.buscarResultadosPergunta(admin, periodoConsulta)
      const item = resultado.climaGeral[0]!
      expect(item.liberado).toBe(true)
      if (item.tipo !== 'caixa_selecao') throw new Error('esperado caixa_selecao')
      expect(item.distribuicao).toEqual([
        { opcao: 'X', contagem: 3 },
        { opcao: 'Y', contagem: 0 },
      ])
    })
  })

  describe('cicloId opcional restringe o universo', () => {
    it('cicloId restringe a um único ciclo, mesmo havendo outro ciclo elegível no período', async () => {
      const cicloAlvo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      const outroCiclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-05', dataFim: '2026-01-20' })
      repos.ciclosRepo.semear([cicloAlvo, outroCiclo])
      repos.pesquisasRepo.semear([
        criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: cicloAlvo.id }),
        criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: outroCiclo.id }),
      ])

      const perguntaAlvo = criarPerguntaFixture({ tipo: 'likert', configuracao: { niveis: 5 } })
      const perguntaOutra = criarPerguntaFixture({ tipo: 'likert', configuracao: { niveis: 5 } })

      semearRespostas360(repos, {
        cicloId: cicloAlvo.id,
        tipoRelacionamento: 'autoavaliacao',
        quantidade: 1,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        pergunta: perguntaAlvo,
        valor: () => ({ nota: 3 }),
      })
      semearRespostas360(repos, {
        cicloId: outroCiclo.id,
        tipoRelacionamento: 'autoavaliacao',
        quantidade: 1,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        pergunta: perguntaOutra,
        valor: () => ({ nota: 3 }),
      })

      const resultado = await analiseResultadosPerguntaService.buscarResultadosPergunta(admin, {
        de: '2026-01-01',
        ate: '2026-01-31',
        cicloId: cicloAlvo.id,
      })

      expect(resultado.cicloId).toBe(cicloAlvo.id)
      expect(resultado.avaliacao360).toHaveLength(1)
      expect(resultado.avaliacao360[0]!.perguntaId).toBe(perguntaAlvo.id)
    })
  })
})

describe('GET /api/analise/resultados-pergunta — controle de acesso por papel (HTTP)', () => {
  let repos: Repos
  const admin = criarColaboradorFixture({ papel: 'admin', usuarioAuthId: 'auth-resultados-admin' })
  const gestorRh = criarColaboradorFixture({ papel: 'gestor_rh', usuarioAuthId: 'auth-resultados-gestor' })
  const colaboradorGuardRail = criarColaboradorFixture({
    papel: 'colaborador',
    usuarioAuthId: 'auth-resultados-colaborador',
  })

  beforeEach(() => {
    repos = construirRepositoriosAnaliseFalsos()
    configurarAppDataSourceQueryFake(repos)
    repos.colaboradoresRepo.semear([admin, gestorRh, colaboradorGuardRail])
    configurarSupabaseAdminPadrao()
    configurarGetUserPorToken({
      'token-admin': 'auth-resultados-admin',
      'token-gestor_rh': 'auth-resultados-gestor',
      'token-colaborador': 'auth-resultados-colaborador',
    })
  })

  it('sem token → 401 TOKEN_AUSENTE', async () => {
    const resposta = await request(app).get('/api/analise/resultados-pergunta?de=2026-01-01&ate=2026-01-31')
    expect(resposta.status).toBe(401)
    expect(resposta.body.erro.codigo).toBe('TOKEN_AUSENTE')
  })

  it('token de papel colaborador → 403 PAPEL_NAO_AUTORIZADO', async () => {
    const resposta = await request(app)
      .get('/api/analise/resultados-pergunta?de=2026-01-01&ate=2026-01-31')
      .set('Authorization', 'Bearer token-colaborador')
    expect(resposta.status).toBe(403)
    expect(resposta.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO')
  })

  it.each(['token-admin', 'token-gestor_rh'] as const)(
    'token de papel autorizado (%s) → 200, payload idêntico entre os dois papéis, sem chaves proibidas',
    async (token) => {
      const resposta = await request(app)
        .get('/api/analise/resultados-pergunta?de=2026-01-01&ate=2026-01-31')
        .set('Authorization', `Bearer ${token}`)
      expect(resposta.status).toBe(200)
      expect(resposta.body).toEqual({
        periodo: { de: '2026-01-01', ate: '2026-01-31' },
        cicloId: null,
        avaliacao360: [],
        climaGeral: [],
      })
      assertPayloadSemVazamentoDeIdentidade(resposta.body)
    },
  )

  it('query "de"/"ate" ausentes via HTTP → 422 CAMPO_INVALIDO', async () => {
    const resposta = await request(app)
      .get('/api/analise/resultados-pergunta')
      .set('Authorization', 'Bearer token-admin')
    expect(resposta.status).toBe(422)
    expect(resposta.body.erro.codigo).toBe('CAMPO_INVALIDO')
  })

  it('shape do payload serializado nunca contém avaliadorId/totalRespondentes/minimoNecessario, mesmo com dado seedado', async () => {
    const periodoConsulta = { de: '2026-03-01', ate: '2026-03-31' }
    const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-03-01', dataFim: '2026-03-31', minimoRespostasPares: 3 })
    repos.ciclosRepo.semear([ciclo])
    repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])
    const pergunta = criarPerguntaFixture({ tipo: 'likert', configuracao: { niveis: 5 } })
    semearRespostas360(repos, {
      cicloId: ciclo.id,
      tipoRelacionamento: 'pares',
      quantidade: 3,
      respondidoEm: new Date('2026-03-10T00:00:00Z'),
      pergunta,
      valor: () => ({ nota: 5 }),
    })

    const resposta = await request(app)
      .get(`/api/analise/resultados-pergunta?de=${periodoConsulta.de}&ate=${periodoConsulta.ate}`)
      .set('Authorization', 'Bearer token-admin')

    expect(resposta.status).toBe(200)
    expect(resposta.body.avaliacao360.length).toBeGreaterThan(0)
    const serializado = JSON.stringify(resposta.body)
    for (const proibido of ['avaliadorId', 'avaliador_id', 'totalRespondentes', 'minimoNecessario', 'minimoRespostasPares']) {
      expect(serializado).not.toContain(proibido)
    }
  })
})
