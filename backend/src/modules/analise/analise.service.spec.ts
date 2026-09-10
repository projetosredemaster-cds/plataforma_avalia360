import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../../app'
import type { ColaboradorAutenticado } from '../../types/express'
import {
  atorDe,
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
import * as analiseService from './analise.service'

// Silencia console.error esperado (tratadorErros loga qualquer 500 antes de
// responder) — não deve poluir a saída do teste nem esconder falhas reais.
vi.spyOn(console, 'error').mockImplementation(() => undefined)

function ator(papel: ColaboradorAutenticado['papel']): ColaboradorAutenticado {
  return { id: randomUUID(), papel, nomeCompleto: 'Ator Teste', email: `ator-${randomUUID()}@exemplo.com` }
}

describe('analise.service — buscarVisaoGeral', () => {
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
        analiseService.buscarVisaoGeral(colaborador, { de: '2026-01-01', ate: '2026-01-31' }),
      ).rejects.toMatchObject({ status: 403, codigo: 'PAPEL_NAO_AUTORIZADO' })

      // Nenhuma query deve ter sido disparada — garantirPapel é a primeira linha.
      expect(repos.ciclosRepo.todas()).toHaveLength(0)
    })

    it('admin e gestor_rh têm acesso (payload zerado, sem ciclos seedados)', async () => {
      await expect(
        analiseService.buscarVisaoGeral(admin, { de: '2026-01-01', ate: '2026-01-31' }),
      ).resolves.toMatchObject({ totalCiclos: 0 })
      await expect(
        analiseService.buscarVisaoGeral(gestorRh, { de: '2026-01-01', ate: '2026-01-31' }),
      ).resolves.toMatchObject({ totalCiclos: 0 })
    })
  })

  describe('validação de "de"/"ate"', () => {
    it.each([
      ['de ausente', { de: undefined, ate: '2026-01-31' }],
      ['ate ausente', { de: '2026-01-01', ate: undefined }],
      ['de não-string', { de: 20260101, ate: '2026-01-31' }],
      ['de fora do formato YYYY-MM-DD (com barras)', { de: '01/01/2026', ate: '2026-01-31' }],
      ['de fora do formato YYYY-MM-DD (sem zero à esquerda)', { de: '2026-1-1', ate: '2026-01-31' }],
      ['ate string vazia', { de: '2026-01-01', ate: '' }],
    ])('%s → 422 CAMPO_INVALIDO', async (_descricao, dto) => {
      await expect(analiseService.buscarVisaoGeral(admin, dto)).rejects.toMatchObject({
        status: 422,
        codigo: 'CAMPO_INVALIDO',
      })
    })

    it('ate < de → 422 PERIODO_INVALIDO', async () => {
      await expect(
        analiseService.buscarVisaoGeral(admin, { de: '2026-02-01', ate: '2026-01-01' }),
      ).rejects.toMatchObject({ status: 422, codigo: 'PERIODO_INVALIDO' })
    })

    it('ate === de (período de um único dia) é aceito, não é PERIODO_INVALIDO', async () => {
      await expect(
        analiseService.buscarVisaoGeral(admin, { de: '2026-02-01', ate: '2026-02-01' }),
      ).resolves.toMatchObject({ periodo: { de: '2026-02-01', ate: '2026-02-01' } })
    })

    it('data de calendário inexistente ("2026-02-30", rollover silencioso do Date) → 422 CAMPO_INVALIDO', async () => {
      await expect(
        analiseService.buscarVisaoGeral(admin, { de: '2026-02-30', ate: '2026-03-01' }),
      ).rejects.toMatchObject({ status: 422, codigo: 'CAMPO_INVALIDO' })
    })
  })

  describe('validação de "cicloId"', () => {
    it('cicloId malformado (não-uuid) → 422 CAMPO_INVALIDO', async () => {
      await expect(
        analiseService.buscarVisaoGeral(admin, { de: '2026-01-01', ate: '2026-01-31', cicloId: 'nao-e-um-uuid' }),
      ).rejects.toMatchObject({ status: 422, codigo: 'CAMPO_INVALIDO' })
    })

    it('cicloId com uuid válido mas inexistente → 404 CICLO_NAO_ENCONTRADO', async () => {
      await expect(
        analiseService.buscarVisaoGeral(admin, { de: '2026-01-01', ate: '2026-01-31', cicloId: randomUUID() }),
      ).rejects.toMatchObject({ status: 404, codigo: 'CICLO_NAO_ENCONTRADO' })
    })

    it('cicloId restringe o universo a um único ciclo, mesmo havendo outros no período', async () => {
      const cicloAlvo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      const outroCiclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-05', dataFim: '2026-01-20' })
      repos.ciclosRepo.semear([cicloAlvo, outroCiclo])

      const resultado = await analiseService.buscarVisaoGeral(admin, {
        de: '2026-01-01',
        ate: '2026-01-31',
        cicloId: cicloAlvo.id,
      })

      expect(resultado.cicloId).toBe(cicloAlvo.id)
      expect(resultado.totalCiclos).toBe(1)
    })
  })

  describe('zero ciclos no período — payload zerado, não é erro', () => {
    it('retorna 200 com todas as métricas zeradas quando nenhum ciclo do corte de período existe', async () => {
      const resultado = await analiseService.buscarVisaoGeral(admin, { de: '2026-06-01', ate: '2026-06-30' })

      expect(resultado).toEqual({
        periodo: { de: '2026-06-01', ate: '2026-06-30' },
        cicloId: null,
        totalCiclos: 0,
        totalRespostas: 0,
        distribuicaoPorTipo: {
          avaliacao_360: { totalCiclos: 0, totalRespostas: 0 },
          clima_geral: { totalCiclos: 0, totalRespostas: 0 },
        },
        taxaRespostaMedia: 0,
        tempoMedioResposta: {
          geral: { horas: 0, amostras: 0 },
          avaliacao_360: { horas: 0, amostras: 0 },
          clima_geral: { horas: 0, amostras: 0 },
        },
      })
    })

    it('ciclo cuja vigência NÃO sobrepõe o período (corte de nível a) não entra em totalCiclos', async () => {
      const cicloForaDoPeriodo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-10' })
      repos.ciclosRepo.semear([cicloForaDoPeriodo])

      const resultado = await analiseService.buscarVisaoGeral(admin, { de: '2026-02-01', ate: '2026-02-28' })

      expect(resultado.totalCiclos).toBe(0)
    })
  })

  describe('ciclo sem pesquisa vinculada (decisão de modelagem 8)', () => {
    it('conta em totalCiclos, mas contribui 0 para distribuicaoPorTipo/taxaRespostaMedia/tempoMedioResposta', async () => {
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      repos.ciclosRepo.semear([ciclo])
      // Nenhuma pesquisa vinculada — repos.pesquisasRepo permanece vazio.

      const resultado = await analiseService.buscarVisaoGeral(admin, { de: '2026-01-01', ate: '2026-01-31' })

      expect(resultado.totalCiclos).toBe(1)
      expect(resultado.totalRespostas).toBe(0)
      expect(resultado.distribuicaoPorTipo).toEqual({
        avaliacao_360: { totalCiclos: 0, totalRespostas: 0 },
        clima_geral: { totalCiclos: 0, totalRespostas: 0 },
      })
      expect(resultado.taxaRespostaMedia).toBe(0)
    })
  })

  describe('corte de período em DOIS NÍVEIS (spec 2.3) — o teste mais importante de regra de negócio', () => {
    it('ciclo cuja vigência sobrepõe o período, mas cuja resposta cai FORA do período, não é contada — só a resposta DENTRO do período conta', async () => {
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-20' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      // Nível (a): a VIGÊNCIA do ciclo (01-01 a 01-20) sobrepõe o período de
      // consulta (01-15 a 01-31) — ciclo passa no corte de universo.
      const periodoConsulta = { de: '2026-01-15', ate: '2026-01-31' }

      // Relacionamento cuja resposta foi registrada ANTES do período de
      // consulta (fora da janela) — não deve contar, mesmo o ciclo tendo
      // passado no corte (a).
      const relForaDoPeriodo = criarRelacionamentoFixture({ cicloId: ciclo.id, tipoRelacionamento: 'pares' })
      const envioForaDoPeriodo = criarEnvioPesquisaFixture({ relacionamentoId: relForaDoPeriodo.id })
      const respostaForaDoPeriodo = criarRespostaFixture({
        envioId: envioForaDoPeriodo.id,
        respondidoEm: new Date('2026-01-05T12:00:00Z'), // fora de [01-15, 01-31]
      })

      // Relacionamento cuja resposta cai DENTRO do período de consulta.
      const relDentroDoPeriodo = criarRelacionamentoFixture({ cicloId: ciclo.id, tipoRelacionamento: 'gestor' })
      const envioDentroDoPeriodo = criarEnvioPesquisaFixture({ relacionamentoId: relDentroDoPeriodo.id })
      const respostaDentroDoPeriodo = criarRespostaFixture({
        envioId: envioDentroDoPeriodo.id,
        respondidoEm: new Date('2026-01-20T12:00:00Z'), // dentro de [01-15, 01-31]
      })

      repos.relacionamentosRepo.semear([relForaDoPeriodo, relDentroDoPeriodo])
      repos.enviosRepo.semear([envioForaDoPeriodo, envioDentroDoPeriodo])
      repos.respostasRepo.semear([respostaForaDoPeriodo, respostaDentroDoPeriodo])

      const resultado = await analiseService.buscarVisaoGeral(admin, periodoConsulta)

      // O ciclo É contado (passou no corte de nível a).
      expect(resultado.totalCiclos).toBe(1)
      expect(resultado.distribuicaoPorTipo.avaliacao_360.totalCiclos).toBe(1)
      // Mas só 1 das 2 respostas conta (corte de nível b, por carimbo de data).
      expect(resultado.totalRespostas).toBe(1)
      expect(resultado.distribuicaoPorTipo.avaliacao_360.totalRespostas).toBe(1)
    })
  })

  describe('taxaRespostaMedia — PONDERADA por volume, não média simples entre ciclos', () => {
    it('pondera pelo total de respondentes de cada ciclo, em vez de tirar a média simples dos percentuais', async () => {
      // Ciclo A: 2 relacionamentos, 2 concluídos (100%).
      const cicloA = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      // Ciclo B: 8 relacionamentos, 4 concluídos (50%).
      const cicloB = criarCicloAvaliacaoFixture({ dataInicio: '2026-02-01', dataFim: '2026-02-28' })
      repos.ciclosRepo.semear([cicloA, cicloB])
      repos.pesquisasRepo.semear([
        criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: cicloA.id }),
        criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: cicloB.id }),
      ])

      const periodoConsulta = { de: '2026-01-01', ate: '2026-12-31' }

      const relacionamentos = [
        ...Array.from({ length: 2 }, () => criarRelacionamentoFixture({ cicloId: cicloA.id })),
        ...Array.from({ length: 8 }, () => criarRelacionamentoFixture({ cicloId: cicloB.id })),
      ]
      repos.relacionamentosRepo.semear(relacionamentos)

      // Os 2 relacionamentos do ciclo A respondidos; só 4 dos 8 do ciclo B.
      const relacionamentosCicloA = relacionamentos.filter((r) => r.cicloId === cicloA.id)
      const relacionamentosCicloBRespondidos = relacionamentos.filter((r) => r.cicloId === cicloB.id).slice(0, 4)
      const relacionamentosComResposta = [...relacionamentosCicloA, ...relacionamentosCicloBRespondidos]

      const envios = relacionamentosComResposta.map((rel) =>
        criarEnvioPesquisaFixture({ relacionamentoId: rel.id }),
      )
      repos.enviosRepo.semear(envios)
      repos.respostasRepo.semear(
        envios.map((envio) =>
          criarRespostaFixture({ envioId: envio.id, respondidoEm: new Date('2026-01-15T00:00:00Z') }),
        ),
      )

      const resultado = await analiseService.buscarVisaoGeral(admin, periodoConsulta)

      // Ponderada: (2 + 4) / (2 + 8) * 100 = 60.0
      expect(resultado.taxaRespostaMedia).toBe(60)
      // Explicitamente NÃO é a média simples dos percentuais por ciclo: (100 + 50) / 2 = 75.
      expect(resultado.taxaRespostaMedia).not.toBe(75)
    })
  })

  describe('cenário completo — shape do contrato + guard rail de anonimização', () => {
    it('agrega 360 (por relacionamento) e clima (por participante) corretamente, sem nenhum campo de identidade em nenhum nível do payload', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-03-31' }

      // --- Ciclo de avaliação 360 ---
      const ciclo360 = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      const pesquisa360 = criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo360.id })

      const rel1 = criarRelacionamentoFixture({ cicloId: ciclo360.id, tipoRelacionamento: 'pares' })
      const envio1 = criarEnvioPesquisaFixture({
        relacionamentoId: rel1.id,
        enviadoEm: new Date('2026-01-05T00:00:00Z'),
        concluidoEm: new Date('2026-01-10T12:00:00Z'), // 132h depois
      })
      const resposta1 = criarRespostaFixture({ envioId: envio1.id, respondidoEm: new Date('2026-01-10T12:00:00Z') })

      const rel2 = criarRelacionamentoFixture({ cicloId: ciclo360.id, tipoRelacionamento: 'subordinado' })
      const envio2 = criarEnvioPesquisaFixture({
        relacionamentoId: rel2.id,
        enviadoEm: new Date('2026-01-08T00:00:00Z'),
        concluidoEm: new Date('2026-01-09T00:00:00Z'), // 24h depois
      })
      const resposta2 = criarRespostaFixture({ envioId: envio2.id, respondidoEm: new Date('2026-01-15T00:00:00Z') })

      // Relacionamento pendente (sem envio/resposta) — conta no denominador
      // (contarTotal360), não no numerador.
      const rel3 = criarRelacionamentoFixture({ cicloId: ciclo360.id, tipoRelacionamento: 'gestor' })

      // --- Ciclo de clima ---
      const cicloClima = criarCicloAvaliacaoFixture({ dataInicio: '2026-02-01', dataFim: '2026-02-28' })
      const pesquisaClima = criarPesquisaFixture({ tipo: 'clima_geral', cicloId: cicloClima.id })
      const envioClimaCampanha = criarEnvioPesquisaFixture({
        cicloId: cicloClima.id,
        relacionamentoId: null,
        enviadoEm: new Date('2026-02-01T00:00:00Z'),
      })

      const p1 = criarCicloParticipanteFixture({ cicloId: cicloClima.id, respondeuEm: new Date('2026-02-10T00:00:00Z') }) // 216h
      const p2 = criarCicloParticipanteFixture({ cicloId: cicloClima.id, respondeuEm: new Date('2026-02-15T00:00:00Z') }) // 336h
      const p3 = criarCicloParticipanteFixture({ cicloId: cicloClima.id, respondeuEm: null }) // pendente
      const p4 = criarCicloParticipanteFixture({ cicloId: cicloClima.id, respondeuEm: new Date('2026-02-20T00:00:00Z') }) // 456h

      const respostasClima = [p1, p2, p4].map((p) =>
        criarRespostaClimaFixture({ cicloId: cicloClima.id, respondidoEm: p.respondeuEm! }),
      )

      repos.ciclosRepo.semear([ciclo360, cicloClima])
      repos.pesquisasRepo.semear([pesquisa360, pesquisaClima])
      repos.relacionamentosRepo.semear([rel1, rel2, rel3])
      repos.enviosRepo.semear([envio1, envio2, envioClimaCampanha])
      repos.respostasRepo.semear([resposta1, resposta2])
      repos.participantesRepo.semear([p1, p2, p3, p4])
      repos.respostasClimaRepo.semear(respostasClima)

      const resultado = await analiseService.buscarVisaoGeral(admin, periodoConsulta)

      expect(resultado).toEqual({
        periodo: { de: '2026-01-01', ate: '2026-03-31' },
        cicloId: null,
        totalCiclos: 2,
        totalRespostas: 5, // 2 (360) + 3 (clima)
        distribuicaoPorTipo: {
          avaliacao_360: { totalCiclos: 1, totalRespostas: 2 },
          clima_geral: { totalCiclos: 1, totalRespostas: 3 },
        },
        // ponderada: (concluidos360=2 + concluidosClima=3) / (total360=3 + totalParticipantesClima=4) * 100 = 5/7*100 ≈ 71.4
        taxaRespostaMedia: 71.4,
        tempoMedioResposta: {
          // ponderado por amostras: (78*2 + 336*3) / 5 = 232.8
          geral: { horas: 232.8, amostras: 5 },
          avaliacao_360: { horas: 78, amostras: 2 }, // (132+24)/2
          clima_geral: { horas: 336, amostras: 3 }, // (216+336+456)/3
        },
      })

      // --- Guard rail de anonimização: nenhum campo de identidade em NENHUM
      // nível do payload, verificado explicitamente no shape da resposta
      // (não só confiado na implementação do service). ---
      const camposProibidos = [
        'avaliadorId',
        'avaliadoId',
        'tipoRelacionamento',
        'avaliador_id',
        'avaliado_id',
        'tipo_relacionamento',
        'colaboradorId',
        'itensResposta',
        'itemResposta',
      ]

      function coletarChaves(valor: unknown, chaves: Set<string>): void {
        if (valor === null || typeof valor !== 'object') return
        for (const [chave, sub] of Object.entries(valor as Record<string, unknown>)) {
          chaves.add(chave)
          coletarChaves(sub, chaves)
        }
      }

      const todasAsChaves = new Set<string>()
      coletarChaves(resultado, todasAsChaves)

      for (const proibido of camposProibidos) {
        expect(todasAsChaves.has(proibido)).toBe(false)
      }

      // Reforço: nenhuma das duas strings de identidade aparece em lugar
      // nenhum do JSON serializado (nem como chave, nem como valor).
      const jsonSerializado = JSON.stringify(resultado)
      expect(jsonSerializado).not.toContain('avaliador')
      expect(jsonSerializado).not.toContain('avaliado')
      expect(jsonSerializado).not.toContain('pares')
      expect(jsonSerializado).not.toContain('subordinado')
    })
  })
})

describe('GET /api/analise/visao-geral — controle de acesso por papel (HTTP, mesmo padrão de rotas-acesso.spec.ts)', () => {
  let repos: ReturnType<typeof construirRepositoriosAnaliseFalsos>
  const admin = criarColaboradorFixture({ papel: 'admin', usuarioAuthId: 'auth-analise-admin' })
  const gestorRh = criarColaboradorFixture({ papel: 'gestor_rh', usuarioAuthId: 'auth-analise-gestor' })
  const colaboradorGuardRail = criarColaboradorFixture({ papel: 'colaborador', usuarioAuthId: 'auth-analise-colaborador' })

  beforeEach(() => {
    repos = construirRepositoriosAnaliseFalsos()
    repos.colaboradoresRepo.semear([admin, gestorRh, colaboradorGuardRail])
    configurarSupabaseAdminPadrao()
    configurarGetUserPorToken({
      'token-admin': 'auth-analise-admin',
      'token-gestor_rh': 'auth-analise-gestor',
      'token-colaborador': 'auth-analise-colaborador',
    })
  })

  it('sem token → 401 TOKEN_AUSENTE', async () => {
    const resposta = await request(app).get('/api/analise/visao-geral?de=2026-01-01&ate=2026-01-31')
    expect(resposta.status).toBe(401)
    expect(resposta.body.erro.codigo).toBe('TOKEN_AUSENTE')
  })

  it('token de papel colaborador → 403 PAPEL_NAO_AUTORIZADO', async () => {
    const resposta = await request(app)
      .get('/api/analise/visao-geral?de=2026-01-01&ate=2026-01-31')
      .set('Authorization', 'Bearer token-colaborador')
    expect(resposta.status).toBe(403)
    expect(resposta.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO')
  })

  it.each(['token-admin', 'token-gestor_rh'] as const)('token de papel autorizado (%s) → 200', async (token) => {
    const resposta = await request(app)
      .get('/api/analise/visao-geral?de=2026-01-01&ate=2026-01-31')
      .set('Authorization', `Bearer ${token}`)
    expect(resposta.status).toBe(200)
    expect(resposta.body.totalCiclos).toBe(0)
  })

  it('query "de"/"ate" ausentes via HTTP → 422 CAMPO_INVALIDO', async () => {
    const resposta = await request(app).get('/api/analise/visao-geral').set('Authorization', 'Bearer token-admin')
    expect(resposta.status).toBe(422)
    expect(resposta.body.erro.codigo).toBe('CAMPO_INVALIDO')
  })
})
