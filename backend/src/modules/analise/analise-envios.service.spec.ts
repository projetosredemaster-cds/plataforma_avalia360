import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../../app'
import type { ColaboradorAutenticado } from '../../types/express'
import {
  configurarGetUserPorToken,
  configurarSupabaseAdminPadrao,
  criarColaboradorFixture,
} from '../../test/fixtures'
import {
  construirRepositoriosAnaliseFalsos,
  criarCicloAvaliacaoFixture,
  criarCicloParticipanteFixture,
  criarEnvioPesquisaFixture,
  criarPesquisaFixture,
  criarRelacionamentoFixture,
  criarRespostaClimaFixture,
  criarRespostaFixture,
} from '../../test/analiseFixtures'
import * as analiseEnviosService from './analise-envios.service'
import * as ciclosAvaliacaoService from '../ciclos-avaliacao/ciclos-avaliacao.service'

// Silencia console.error esperado (tratadorErros loga qualquer 500 antes de
// responder) — não deve poluir a saída do teste nem esconder falhas reais.
vi.spyOn(console, 'error').mockImplementation(() => undefined)

function ator(papel: ColaboradorAutenticado['papel']): ColaboradorAutenticado {
  return { id: randomUUID(), papel, nomeCompleto: 'Ator Teste', email: `ator-${randomUUID()}@exemplo.com` }
}

/** Varredura recursiva de chaves de um objeto/array — mesmo padrão de `analise.service.spec.ts`/`analise-avaliacoes.service.spec.ts`. */
function coletarChaves(valor: unknown, chaves: Set<string>): void {
  if (valor === null || typeof valor !== 'object') return
  for (const [chave, sub] of Object.entries(valor as Record<string, unknown>)) {
    chaves.add(chave)
    coletarChaves(sub, chaves)
  }
}

/**
 * Semeia `quantidade` relacionamentos de um `tipoRelacionamento` (pares/
 * subordinado) para o mesmo avaliado, todos com envio+resposta concluída —
 * usado para exercitar o cenário "abaixo do mínimo"/"no mínimo exato" sem
 * nunca precisar (nem poder) ler `avaliador_id` de volta do payload desta
 * tela (que não tem gate de `minimo_respostas_pares`, spec seção 6).
 */
function semearRelacionamentosConcluidos(
  repos: ReturnType<typeof construirRepositoriosAnaliseFalsos>,
  opcoes: { cicloId: string; tipoRelacionamento: 'pares' | 'subordinado' | 'gestor' | 'autoavaliacao' | 'externo'; quantidade: number },
): void {
  for (let i = 0; i < opcoes.quantidade; i++) {
    const rel = criarRelacionamentoFixture({
      cicloId: opcoes.cicloId,
      tipoRelacionamento: opcoes.tipoRelacionamento,
    })
    const envio = criarEnvioPesquisaFixture({ relacionamentoId: rel.id })
    const resposta = criarRespostaFixture({ envioId: envio.id, respondidoEm: new Date('2026-01-15T00:00:00Z') })
    repos.relacionamentosRepo.semear([...repos.relacionamentosRepo.todas(), rel])
    repos.enviosRepo.semear([...repos.enviosRepo.todas(), envio])
    repos.respostasRepo.semear([...repos.respostasRepo.todas(), resposta])
  }
}

describe('analise-envios.service — buscarEnviosAnalise', () => {
  let repos: ReturnType<typeof construirRepositoriosAnaliseFalsos>
  const admin = ator('admin')
  const gestorRh = ator('gestor_rh')
  const colaborador = ator('colaborador')

  beforeEach(() => {
    repos = construirRepositoriosAnaliseFalsos()
  })

  describe('PRIORIDADE MÁXIMA — controle de acesso (garantirPapel)', () => {
    it('papel colaborador é bloqueado com 403 PAPEL_NAO_AUTORIZADO, mesmo antes de qualquer query', async () => {
      await expect(
        analiseEnviosService.buscarEnviosAnalise(colaborador, { de: '2026-01-01', ate: '2026-01-31' }),
      ).rejects.toMatchObject({ status: 403, codigo: 'PAPEL_NAO_AUTORIZADO' })

      // Nenhuma query deve ter sido disparada — garantirPapel é a primeira linha.
      expect(repos.ciclosRepo.todas()).toHaveLength(0)
    })

    it('admin e gestor_rh têm acesso (payload com lista vazia, sem ciclos seedados)', async () => {
      await expect(
        analiseEnviosService.buscarEnviosAnalise(admin, { de: '2026-01-01', ate: '2026-01-31' }),
      ).resolves.toMatchObject({ ciclos: [] })
      await expect(
        analiseEnviosService.buscarEnviosAnalise(gestorRh, { de: '2026-01-01', ate: '2026-01-31' }),
      ).resolves.toMatchObject({ ciclos: [] })
    })
  })

  describe('validação de "de"/"ate"', () => {
    it.each([
      ['de ausente', { de: undefined, ate: '2026-01-31' }],
      ['ate ausente', { de: '2026-01-01', ate: undefined }],
      ['de não-string', { de: 20260101, ate: '2026-01-31' }],
      ['de fora do formato YYYY-MM-DD (com barras)', { de: '01/01/2026', ate: '2026-01-31' }],
    ])('%s → 422 CAMPO_INVALIDO', async (_descricao, dto) => {
      await expect(analiseEnviosService.buscarEnviosAnalise(admin, dto)).rejects.toMatchObject({
        status: 422,
        codigo: 'CAMPO_INVALIDO',
      })
    })

    it('ate < de → 422 PERIODO_INVALIDO', async () => {
      await expect(
        analiseEnviosService.buscarEnviosAnalise(admin, { de: '2026-02-01', ate: '2026-01-01' }),
      ).rejects.toMatchObject({ status: 422, codigo: 'PERIODO_INVALIDO' })
    })

    it('ate === de (período de um único dia) é aceito', async () => {
      await expect(
        analiseEnviosService.buscarEnviosAnalise(admin, { de: '2026-02-01', ate: '2026-02-01' }),
      ).resolves.toMatchObject({ periodo: { de: '2026-02-01', ate: '2026-02-01' } })
    })
  })

  describe('validação de "cicloId"', () => {
    it('cicloId malformado (não-uuid) → 422 CAMPO_INVALIDO', async () => {
      await expect(
        analiseEnviosService.buscarEnviosAnalise(admin, {
          de: '2026-01-01',
          ate: '2026-01-31',
          cicloId: 'nao-e-um-uuid',
        }),
      ).rejects.toMatchObject({ status: 422, codigo: 'CAMPO_INVALIDO' })
    })

    it('cicloId com uuid válido mas inexistente → 404 CICLO_NAO_ENCONTRADO', async () => {
      await expect(
        analiseEnviosService.buscarEnviosAnalise(admin, {
          de: '2026-01-01',
          ate: '2026-01-31',
          cicloId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 404, codigo: 'CICLO_NAO_ENCONTRADO' })
    })

    it('cicloId restringe a um único ciclo, mesmo havendo outros no período', async () => {
      const cicloAlvo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      const outroCiclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-05', dataFim: '2026-01-20' })
      repos.ciclosRepo.semear([cicloAlvo, outroCiclo])

      const resultado = await analiseEnviosService.buscarEnviosAnalise(admin, {
        de: '2026-01-01',
        ate: '2026-01-31',
        cicloId: cicloAlvo.id,
      })

      expect(resultado.cicloId).toBe(cicloAlvo.id)
      expect(resultado.ciclos).toHaveLength(1)
      expect(resultado.ciclos[0].cicloId).toBe(cicloAlvo.id)
    })
  })

  describe('guard rail de anonimização — nenhum campo de identidade em nenhum nível do payload (spec seção 6)', () => {
    const camposProibidos = [
      'avaliadorId',
      'avaliadoId',
      'tipoRelacionamento',
      'avaliador_id',
      'avaliado_id',
      'tipo_relacionamento',
      'colaboradorId',
      'colaborador_id',
      'itensResposta',
      'itemResposta',
    ]

    it('abaixo do mínimo de respondentes (1 < minimoRespostasPares=3): totais são expostos agregados, sem identidade — esta tela não aplica o gate', async () => {
      const ciclo = criarCicloAvaliacaoFixture({
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])
      semearRelacionamentosConcluidos(repos, { cicloId: ciclo.id, tipoRelacionamento: 'pares', quantidade: 1 })

      const resultado = await analiseEnviosService.buscarEnviosAnalise(admin, { de: '2026-01-01', ate: '2026-01-31' })

      const linha = resultado.ciclos[0]
      expect(linha.totalRespondido).toBe(1)
      expect(linha.totalEnvios).toBe(1)

      const chaves = new Set<string>()
      coletarChaves(resultado, chaves)
      for (const proibido of camposProibidos) expect(chaves.has(proibido)).toBe(false)

      const json = JSON.stringify(resultado)
      expect(json).not.toContain('avaliador')
      expect(json).not.toContain('avaliado')
      expect(json).not.toContain('"pares"')
      expect(json).not.toContain('subordinado')
    })

    it('no mínimo exato de respondentes (3 === minimoRespostasPares=3): mesmo comportamento agregado, sem identidade', async () => {
      const ciclo = criarCicloAvaliacaoFixture({
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])
      semearRelacionamentosConcluidos(repos, { cicloId: ciclo.id, tipoRelacionamento: 'subordinado', quantidade: 3 })

      const resultado = await analiseEnviosService.buscarEnviosAnalise(admin, { de: '2026-01-01', ate: '2026-01-31' })

      const linha = resultado.ciclos[0]
      expect(linha.totalRespondido).toBe(3)
      expect(linha.totalEnvios).toBe(3)
      expect(linha.percentualRespondido).toBe(100)

      const chaves = new Set<string>()
      coletarChaves(resultado, chaves)
      for (const proibido of camposProibidos) expect(chaves.has(proibido)).toBe(false)

      const json = JSON.stringify(resultado)
      expect(json).not.toContain('avaliador')
      expect(json).not.toContain('avaliado')
      expect(json).not.toContain('subordinado')
    })

    it('shape do contrato inclui só os campos definidos na spec (nenhum campo extra, como minimoRespostasPares/criadoPor, vaza pela tabela ciclos_avaliacao)', async () => {
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      const resultado = await analiseEnviosService.buscarEnviosAnalise(admin, { de: '2026-01-01', ate: '2026-01-31' })

      expect(Object.keys(resultado.ciclos[0]).sort()).toEqual(
        [
          'cicloId',
          'nome',
          'tipoPesquisa',
          'status',
          'dataInicio',
          'dataFim',
          'totalEnvios',
          'totalPendente',
          'totalRespondido',
          'percentualRespondido',
        ].sort(),
      )
    })
  })

  describe('paridade numérica com GET /api/ciclos/:id — campo "progresso" (spec seção 10, guard rail explícito)', () => {
    it('avaliacao_360: totalEnvios/totalRespondido/percentualRespondido batem exatamente com ciclosAvaliacaoService.buscarPorId(...).progresso', async () => {
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31', status: 'ativo' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      const relacionamentosConcluidos = Array.from({ length: 3 }, () =>
        criarRelacionamentoFixture({ cicloId: ciclo.id }),
      )
      const relacionamentosPendentes = Array.from({ length: 2 }, () =>
        criarRelacionamentoFixture({ cicloId: ciclo.id }),
      )
      repos.relacionamentosRepo.semear([...relacionamentosConcluidos, ...relacionamentosPendentes])

      const envios = relacionamentosConcluidos.map((rel) => criarEnvioPesquisaFixture({ relacionamentoId: rel.id }))
      repos.enviosRepo.semear(envios)
      repos.respostasRepo.semear(
        envios.map((envio) => criarRespostaFixture({ envioId: envio.id, respondidoEm: new Date('2026-01-15T00:00:00Z') })),
      )

      const resultadoEnvios = await analiseEnviosService.buscarEnviosAnalise(admin, {
        de: '2026-01-01',
        ate: '2026-01-31',
      })
      const resultadoCiclo = await ciclosAvaliacaoService.buscarPorId(admin, ciclo.id)

      const linha = resultadoEnvios.ciclos[0]
      expect(linha.totalEnvios).toBe(resultadoCiclo.progresso.total)
      expect(linha.totalRespondido).toBe(resultadoCiclo.progresso.concluidos)
      expect(linha.percentualRespondido).toBe(resultadoCiclo.progresso.percentual)
      // Valores concretos, não só igualdade entre os dois lados.
      expect(linha.totalEnvios).toBe(5)
      expect(linha.totalRespondido).toBe(3)
      expect(linha.percentualRespondido).toBe(60)
      expect(linha.totalPendente).toBe(2)
    })

    it('clima_geral: totalEnvios/totalRespondido/percentualRespondido batem exatamente com ciclosAvaliacaoService.buscarPorId(...).progresso', async () => {
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-02-01', dataFim: '2026-02-28', status: 'ativo' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'clima_geral', cicloId: ciclo.id })])

      const participantesRespondidos = Array.from({ length: 4 }, () =>
        criarCicloParticipanteFixture({ cicloId: ciclo.id, respondeuEm: new Date('2026-02-10T00:00:00Z') }),
      )
      const participantesPendentes = Array.from({ length: 3 }, () =>
        criarCicloParticipanteFixture({ cicloId: ciclo.id, respondeuEm: null }),
      )
      repos.participantesRepo.semear([...participantesRespondidos, ...participantesPendentes])

      const resultadoEnvios = await analiseEnviosService.buscarEnviosAnalise(admin, {
        de: '2026-02-01',
        ate: '2026-02-28',
      })
      const resultadoCiclo = await ciclosAvaliacaoService.buscarPorId(admin, ciclo.id)

      const linha = resultadoEnvios.ciclos[0]
      expect(linha.totalEnvios).toBe(resultadoCiclo.progresso.total)
      expect(linha.totalRespondido).toBe(resultadoCiclo.progresso.concluidos)
      expect(linha.percentualRespondido).toBe(resultadoCiclo.progresso.percentual)
      expect(linha.totalEnvios).toBe(7)
      expect(linha.totalRespondido).toBe(4)
      expect(linha.percentualRespondido).toBe(57) // Math.round(4/7*100) = 57
      expect(linha.totalPendente).toBe(3)
    })
  })

  describe('filtros de período — corte por vigência do ciclo (mesmo critério de buscarUniversoCiclos)', () => {
    it('ciclo cuja vigência NÃO sobrepõe o período não aparece na lista', async () => {
      const cicloForaDoPeriodo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-10' })
      repos.ciclosRepo.semear([cicloForaDoPeriodo])

      const resultado = await analiseEnviosService.buscarEnviosAnalise(admin, { de: '2026-02-01', ate: '2026-02-28' })

      expect(resultado.ciclos).toHaveLength(0)
    })

    it('ciclo cuja vigência sobrepõe parcialmente o período aparece na lista', async () => {
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-25', dataFim: '2026-02-05' })
      repos.ciclosRepo.semear([ciclo])

      const resultado = await analiseEnviosService.buscarEnviosAnalise(admin, { de: '2026-02-01', ate: '2026-02-28' })

      expect(resultado.ciclos).toHaveLength(1)
      expect(resultado.ciclos[0].cicloId).toBe(ciclo.id)
    })
  })

  describe('casos de borda — ciclo sem pesquisa vinculada vs. ciclo em rascunho (spec seções 4/7)', () => {
    it('ciclo sem pesquisa vinculada: tipoPesquisa null, todas as 4 contagens zeradas, mas NÃO é excluído da lista', async () => {
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31', status: 'ativo' })
      repos.ciclosRepo.semear([ciclo])
      // Nenhuma pesquisa vinculada — repos.pesquisasRepo permanece vazio.

      const resultado = await analiseEnviosService.buscarEnviosAnalise(admin, { de: '2026-01-01', ate: '2026-01-31' })

      expect(resultado.ciclos).toHaveLength(1)
      const linha = resultado.ciclos[0]
      expect(linha.tipoPesquisa).toBeNull()
      expect(linha.totalEnvios).toBe(0)
      expect(linha.totalPendente).toBe(0)
      expect(linha.totalRespondido).toBe(0)
      expect(linha.percentualRespondido).toBe(0)
    })

    it('ciclo em rascunho com pesquisa vinculada mas ainda sem envios gerados: totalEnvios 0 e status "rascunho" — diferenciável de "sem pesquisa vinculada" via tipoPesquisa não-nulo', async () => {
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31', status: 'rascunho' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])
      // Nenhum relacionamento_avaliacao gerado ainda — só acontece ao ativar.

      const resultado = await analiseEnviosService.buscarEnviosAnalise(admin, { de: '2026-01-01', ate: '2026-01-31' })

      expect(resultado.ciclos).toHaveLength(1)
      const linha = resultado.ciclos[0]
      expect(linha.status).toBe('rascunho')
      expect(linha.tipoPesquisa).toBe('avaliacao_360')
      expect(linha.totalEnvios).toBe(0)
      expect(linha.totalRespondido).toBe(0)
      expect(linha.percentualRespondido).toBe(0)
    })
  })

  describe('ordenação padrão — dataInicio DESC (spec seção 5)', () => {
    it('ciclos são retornados do mais recente para o mais antigo por dataInicio, independentemente da ordem de seed', async () => {
      const cicloAntigo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      const cicloRecente = criarCicloAvaliacaoFixture({ dataInicio: '2026-03-01', dataFim: '2026-03-31' })
      const cicloIntermediario = criarCicloAvaliacaoFixture({ dataInicio: '2026-02-01', dataFim: '2026-02-28' })
      // Seed em ordem embaralhada de propósito.
      repos.ciclosRepo.semear([cicloIntermediario, cicloAntigo, cicloRecente])

      const resultado = await analiseEnviosService.buscarEnviosAnalise(admin, { de: '2026-01-01', ate: '2026-03-31' })

      expect(resultado.ciclos.map((c) => c.cicloId)).toEqual([cicloRecente.id, cicloIntermediario.id, cicloAntigo.id])
    })
  })
})

describe('GET /api/analise/envios — controle de acesso por papel (HTTP, mesmo padrão de rotas-acesso.spec.ts)', () => {
  let repos: ReturnType<typeof construirRepositoriosAnaliseFalsos>
  const admin = criarColaboradorFixture({ papel: 'admin', usuarioAuthId: 'auth-envios-admin' })
  const gestorRh = criarColaboradorFixture({ papel: 'gestor_rh', usuarioAuthId: 'auth-envios-gestor' })
  const colaboradorGuardRail = criarColaboradorFixture({ papel: 'colaborador', usuarioAuthId: 'auth-envios-colaborador' })

  beforeEach(() => {
    repos = construirRepositoriosAnaliseFalsos()
    repos.colaboradoresRepo.semear([admin, gestorRh, colaboradorGuardRail])
    configurarSupabaseAdminPadrao()
    configurarGetUserPorToken({
      'token-admin': 'auth-envios-admin',
      'token-gestor_rh': 'auth-envios-gestor',
      'token-colaborador': 'auth-envios-colaborador',
    })
  })

  it('sem token → 401 TOKEN_AUSENTE', async () => {
    const resposta = await request(app).get('/api/analise/envios?de=2026-01-01&ate=2026-01-31')
    expect(resposta.status).toBe(401)
    expect(resposta.body.erro.codigo).toBe('TOKEN_AUSENTE')
  })

  it('token de papel colaborador → 403 PAPEL_NAO_AUTORIZADO', async () => {
    const resposta = await request(app)
      .get('/api/analise/envios?de=2026-01-01&ate=2026-01-31')
      .set('Authorization', 'Bearer token-colaborador')
    expect(resposta.status).toBe(403)
    expect(resposta.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO')
  })

  it.each(['token-admin', 'token-gestor_rh'] as const)('token de papel autorizado (%s) → 200', async (token) => {
    const resposta = await request(app)
      .get('/api/analise/envios?de=2026-01-01&ate=2026-01-31')
      .set('Authorization', `Bearer ${token}`)
    expect(resposta.status).toBe(200)
    expect(resposta.body.ciclos).toEqual([])
  })

  it('query "de"/"ate" ausentes via HTTP → 422 CAMPO_INVALIDO', async () => {
    const resposta = await request(app).get('/api/analise/envios').set('Authorization', 'Bearer token-admin')
    expect(resposta.status).toBe(422)
    expect(resposta.body.erro.codigo).toBe('CAMPO_INVALIDO')
  })

  it('ate < de via HTTP → 422 PERIODO_INVALIDO', async () => {
    const resposta = await request(app)
      .get('/api/analise/envios?de=2026-02-01&ate=2026-01-01')
      .set('Authorization', 'Bearer token-admin')
    expect(resposta.status).toBe(422)
    expect(resposta.body.erro.codigo).toBe('PERIODO_INVALIDO')
  })
})
