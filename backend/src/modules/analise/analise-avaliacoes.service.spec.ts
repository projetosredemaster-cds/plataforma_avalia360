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
  criarEnvioPesquisaFixture,
  criarItemRespostaClimaFixture,
  criarItemRespostaFixture,
  criarPerguntaFixture,
  criarPesquisaFixture,
  criarRelacionamentoFixture,
  criarRespostaClimaFixture,
  criarRespostaFixture,
} from '../../test/analiseFixtures'
import * as analiseAvaliacoesService from './analise-avaliacoes.service'

// Silencia console.error esperado (tratadorErros loga qualquer 500 antes de
// responder) — não deve poluir a saída do teste nem esconder falhas reais.
vi.spyOn(console, 'error').mockImplementation(() => undefined)

function ator(papel: ColaboradorAutenticado['papel']): ColaboradorAutenticado {
  return { id: randomUUID(), papel, nomeCompleto: 'Ator Teste', email: `ator-${randomUUID()}@exemplo.com` }
}

/** Varredura recursiva de chaves de um objeto/array — mesmo padrão já usado em `analise.service.spec.ts`. */
function coletarChaves(valor: unknown, chaves: Set<string>): void {
  if (valor === null || typeof valor !== 'object') return
  for (const [chave, sub] of Object.entries(valor as Record<string, unknown>)) {
    chaves.add(chave)
    coletarChaves(sub, chaves)
  }
}

/**
 * Monta, num único ciclo `avaliacao_360` já dentro do período `periodoConsulta`,
 * um grupo `pares`/`subordinado` com `quantidade` respondentes distintos, cada
 * um com uma resposta `texto_aberto` registrada dentro do período. Retorna o
 * `avaliadoId`/`cicloId` para asserções.
 */
function semearGrupoParesSubordinado(
  repos: ReturnType<typeof construirRepositoriosAnaliseFalsos>,
  opcoes: {
    cicloId: string
    tipoRelacionamento: 'pares' | 'subordinado'
    avaliadoId?: string
    quantidade: number
    respondidoEm: Date
    pergunta?: ReturnType<typeof criarPerguntaFixture>
    textoPrefixo?: string
  },
): { avaliadoId: string; pergunta: ReturnType<typeof criarPerguntaFixture> } {
  const avaliadoId = opcoes.avaliadoId ?? randomUUID()
  const pergunta = opcoes.pergunta ?? criarPerguntaFixture()
  repos.perguntasRepo.semear([...repos.perguntasRepo.todas(), pergunta])

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
      perguntaId: pergunta.id,
      valor: { texto: `${opcoes.textoPrefixo ?? 'Texto'} #${i + 1}` },
    })
    repos.relacionamentosRepo.semear([...repos.relacionamentosRepo.todas(), rel])
    repos.enviosRepo.semear([...repos.enviosRepo.todas(), envio])
    repos.respostasRepo.semear([...repos.respostasRepo.todas(), resposta])
    repos.itensRespostaRepo.semear([...repos.itensRespostaRepo.todas(), item])
  }

  return { avaliadoId, pergunta }
}

describe('analise-avaliacoes.service — buscarAvaliacoes', () => {
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
        analiseAvaliacoesService.buscarAvaliacoes(colaborador, { de: '2026-01-01', ate: '2026-01-31' }),
      ).rejects.toMatchObject({ status: 403, codigo: 'PAPEL_NAO_AUTORIZADO' })

      expect(repos.ciclosRepo.todas()).toHaveLength(0)
    })

    it('admin e gestor_rh têm acesso (payload zerado, sem ciclos seedados)', async () => {
      await expect(
        analiseAvaliacoesService.buscarAvaliacoes(admin, { de: '2026-01-01', ate: '2026-01-31' }),
      ).resolves.toMatchObject({
        avaliacao360: { identificadas: [], paresSubordinado: [] },
        climaGeral: [],
      })
      await expect(
        analiseAvaliacoesService.buscarAvaliacoes(gestorRh, { de: '2026-01-01', ate: '2026-01-31' }),
      ).resolves.toMatchObject({
        avaliacao360: { identificadas: [], paresSubordinado: [] },
        climaGeral: [],
      })
    })
  })

  describe('validação de "de"/"ate"/"cicloId"', () => {
    it.each([
      ['de ausente', { de: undefined, ate: '2026-01-31' }],
      ['ate ausente', { de: '2026-01-01', ate: undefined }],
      ['de fora do formato YYYY-MM-DD', { de: '01/01/2026', ate: '2026-01-31' }],
      ['data de calendário inexistente', { de: '2026-02-30', ate: '2026-03-01' }],
    ])('%s → 422 CAMPO_INVALIDO', async (_descricao, dto) => {
      await expect(analiseAvaliacoesService.buscarAvaliacoes(admin, dto)).rejects.toMatchObject({
        status: 422,
        codigo: 'CAMPO_INVALIDO',
      })
    })

    it('ate < de → 422 PERIODO_INVALIDO', async () => {
      await expect(
        analiseAvaliacoesService.buscarAvaliacoes(admin, { de: '2026-02-01', ate: '2026-01-01' }),
      ).rejects.toMatchObject({ status: 422, codigo: 'PERIODO_INVALIDO' })
    })

    it('cicloId malformado (não-uuid) → 422 CAMPO_INVALIDO', async () => {
      await expect(
        analiseAvaliacoesService.buscarAvaliacoes(admin, {
          de: '2026-01-01',
          ate: '2026-01-31',
          cicloId: 'nao-e-um-uuid',
        }),
      ).rejects.toMatchObject({ status: 422, codigo: 'CAMPO_INVALIDO' })
    })

    it('cicloId com uuid válido mas inexistente → 404 CICLO_NAO_ENCONTRADO', async () => {
      await expect(
        analiseAvaliacoesService.buscarAvaliacoes(admin, {
          de: '2026-01-01',
          ate: '2026-01-31',
          cicloId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 404, codigo: 'CICLO_NAO_ENCONTRADO' })
    })
  })

  describe('nenhum ciclo no período — arrays vazios, 200 não erro', () => {
    it('retorna arrays vazios (não erro) quando nenhum ciclo do corte de período existe', async () => {
      const resultado = await analiseAvaliacoesService.buscarAvaliacoes(admin, {
        de: '2026-06-01',
        ate: '2026-06-30',
      })

      expect(resultado).toEqual({
        periodo: { de: '2026-06-01', ate: '2026-06-30' },
        cicloId: null,
        avaliacao360: { identificadas: [], paresSubordinado: [] },
        climaGeral: [],
      })
    })
  })

  describe('GUARD RAIL CRÍTICO Nº 1 — anonimato total, sem bypass, para ninguém', () => {
    it('admin e gestor_rh recebem EXATAMENTE o mesmo resultado — nenhuma distinção de papel no conteúdo retornado', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      // Grupo abaixo do mínimo (2 < 3) e grupo liberado (3 >= 3), mais um
      // identificado (autoavaliacao), para cobrir os três ramos do payload.
      semearGrupoParesSubordinado(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'pares',
        quantidade: 2,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
      })
      semearGrupoParesSubordinado(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'subordinado',
        quantidade: 3,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
      })

      const perguntaIdentificada = criarPerguntaFixture()
      repos.perguntasRepo.semear([...repos.perguntasRepo.todas(), perguntaIdentificada])
      const relAuto = criarRelacionamentoFixture({ cicloId: ciclo.id, tipoRelacionamento: 'autoavaliacao' })
      const envioAuto = criarEnvioPesquisaFixture({ relacionamentoId: relAuto.id })
      const respostaAuto = criarRespostaFixture({ envioId: envioAuto.id, respondidoEm: new Date('2026-01-05T00:00:00Z') })
      const itemAuto = criarItemRespostaFixture({
        respostaId: respostaAuto.id,
        perguntaId: perguntaIdentificada.id,
        valor: { texto: 'Autoavaliação texto' },
      })
      repos.relacionamentosRepo.semear([...repos.relacionamentosRepo.todas(), relAuto])
      repos.enviosRepo.semear([...repos.enviosRepo.todas(), envioAuto])
      repos.respostasRepo.semear([...repos.respostasRepo.todas(), respostaAuto])
      repos.itensRespostaRepo.semear([...repos.itensRespostaRepo.todas(), itemAuto])

      const colaboradoresEnvolvidos = [
        relAuto.avaliadoId,
        relAuto.avaliadorId,
        ...repos.relacionamentosRepo.todas().map((r) => r.avaliadoId),
        ...repos.relacionamentosRepo.todas().map((r) => r.avaliadorId),
      ].map((id) => criarColaboradorFixture({ id }))
      repos.colaboradoresRepo.semear(colaboradoresEnvolvidos)

      const resultadoAdmin = await analiseAvaliacoesService.buscarAvaliacoes(admin, periodoConsulta)
      const resultadoGestorRh = await analiseAvaliacoesService.buscarAvaliacoes(gestorRh, periodoConsulta)

      // Reembaralhamento é aleatório — normaliza a ordem de `textos` antes de
      // comparar, senão o teste ficaria instável mesmo estando correto.
      function normalizar(r: analiseAvaliacoesService.AvaliacoesAnalise) {
        return {
          ...r,
          avaliacao360: {
            ...r.avaliacao360,
            paresSubordinado: r.avaliacao360.paresSubordinado.map((g) => ({
              ...g,
              textos: g.textos ? [...g.textos].sort((a, b) => a.texto.localeCompare(b.texto)) : g.textos,
            })),
          },
        }
      }

      expect(normalizar(resultadoAdmin)).toEqual(normalizar(resultadoGestorRh))
    })

    it('grupo pares/subordinado ABAIXO do mínimo → liberado:false + motivo, SEM textos, mesmo para admin, mesmo com campos extras não documentados no DTO', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      semearGrupoParesSubordinado(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'pares',
        quantidade: 2, // abaixo do mínimo de 3
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
      })

      // Tenta bypass via campos extras não documentados no DTO — devem ser
      // completamente ignorados, nunca abrir uma brecha para o gate.
      const dtoComTentativaDeBypass = {
        de: periodoConsulta.de,
        ate: periodoConsulta.ate,
        ignorarLimiar: true,
        forcarExibir: true,
        modoTransparencia: true,
        verComoAdmin: true,
        bypass: true,
      } as unknown as analiseAvaliacoesService.BuscarAvaliacoesDto

      const resultado = await analiseAvaliacoesService.buscarAvaliacoes(admin, dtoComTentativaDeBypass)

      expect(resultado.avaliacao360.paresSubordinado).toHaveLength(1)
      const grupo = resultado.avaliacao360.paresSubordinado[0]!
      expect(grupo.liberado).toBe(false)
      expect(grupo.motivo).toBe('aguardando_minimo_respondentes')
      expect(grupo.totalRespondentes).toBe(2)
      expect(grupo.minimoNecessario).toBe(3)
      expect(grupo).not.toHaveProperty('textos')
      expect(JSON.stringify(grupo)).not.toContain('Texto #')
    })

    it('grupo pares/subordinado NO limiar exato (totalRespondentes === minimoNecessario) é liberado:true — limiar é inclusivo (>=)', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      semearGrupoParesSubordinado(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'pares',
        quantidade: 3, // exatamente no mínimo
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
      })

      const resultado = await analiseAvaliacoesService.buscarAvaliacoes(admin, periodoConsulta)

      expect(resultado.avaliacao360.paresSubordinado).toHaveLength(1)
      const grupo = resultado.avaliacao360.paresSubordinado[0]!
      expect(grupo.liberado).toBe(true)
      expect(grupo.totalRespondentes).toBe(3)
      expect(grupo.minimoNecessario).toBe(3)
      expect(grupo.textos).toHaveLength(3)
      expect(grupo.motivo).toBeUndefined()
    })
  })

  describe('GUARD RAIL CRÍTICO Nº 2 — identidade nunca junto de texto pares/subordinado', () => {
    it('grupo pares/subordinado LIBERADO nunca expõe avaliadorId/avaliador_id/nome do avaliador em nenhum lugar do grupo; identificadas (autoavaliacao/gestor/externo) SEMPRE expõem avaliadorId+avaliadorNome', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      // Grupo pares LIBERADO (4 >= 3, acima do mínimo).
      const { avaliadoId: avaliadoPares } = semearGrupoParesSubordinado(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'pares',
        quantidade: 4,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        textoPrefixo: 'ParesLiberado',
      })

      // Identificadas: autoavaliacao, gestor, externo — identidade esperada.
      const pergunta = criarPerguntaFixture()
      repos.perguntasRepo.semear([...repos.perguntasRepo.todas(), pergunta])
      const avaliadoColaborador = criarColaboradorFixture({ id: avaliadoPares, nomeCompleto: 'Avaliado Alvo' })

      const tiposIdentificados: Array<'autoavaliacao' | 'gestor' | 'externo'> = ['autoavaliacao', 'gestor', 'externo']
      const colaboradoresIdentificados: ReturnType<typeof criarColaboradorFixture>[] = [avaliadoColaborador]
      for (const tipo of tiposIdentificados) {
        const avaliadorColaborador = criarColaboradorFixture({ nomeCompleto: `Avaliador ${tipo}` })
        colaboradoresIdentificados.push(avaliadorColaborador)
        const rel = criarRelacionamentoFixture({
          cicloId: ciclo.id,
          avaliadoId: avaliadoPares,
          avaliadorId: avaliadorColaborador.id,
          tipoRelacionamento: tipo,
        })
        const envio = criarEnvioPesquisaFixture({ relacionamentoId: rel.id })
        const resposta = criarRespostaFixture({ envioId: envio.id, respondidoEm: new Date('2026-01-12T00:00:00Z') })
        const item = criarItemRespostaFixture({
          respostaId: resposta.id,
          perguntaId: pergunta.id,
          valor: { texto: `Texto identificado ${tipo}` },
        })
        repos.relacionamentosRepo.semear([...repos.relacionamentosRepo.todas(), rel])
        repos.enviosRepo.semear([...repos.enviosRepo.todas(), envio])
        repos.respostasRepo.semear([...repos.respostasRepo.todas(), resposta])
        repos.itensRespostaRepo.semear([...repos.itensRespostaRepo.todas(), item])
      }

      // Colaboradores dos respondentes `pares` também precisam existir (join
      // de buscarNomesColaboradores usa só avaliadoId, mas populamos por
      // completude/realismo).
      repos.colaboradoresRepo.semear([...repos.colaboradoresRepo.todas(), ...colaboradoresIdentificados])

      const resultado = await analiseAvaliacoesService.buscarAvaliacoes(admin, periodoConsulta)

      // --- Parte 1: grupo pares LIBERADO nunca expõe identidade. ---
      const grupoPares = resultado.avaliacao360.paresSubordinado.find((g) => g.tipoRelacionamento === 'pares')
      expect(grupoPares).toBeDefined()
      expect(grupoPares!.liberado).toBe(true)
      expect(grupoPares!.textos).toHaveLength(4)

      const chavesGrupoPares = new Set<string>()
      coletarChaves(grupoPares, chavesGrupoPares)
      for (const proibido of ['avaliadorId', 'avaliador_id', 'avaliadorNome', 'avaliador']) {
        expect(chavesGrupoPares.has(proibido)).toBe(false)
      }
      expect(JSON.stringify(grupoPares)).not.toContain('Avaliador')

      // --- Parte 2: identificadas SEMPRE expõem avaliadorId + avaliadorNome
      // (ausência ali seria bug, não anonimização). ---
      expect(resultado.avaliacao360.identificadas).toHaveLength(3)
      for (const item of resultado.avaliacao360.identificadas) {
        expect(item.avaliadorId).toBeTruthy()
        expect(item.avaliadorNome).toBeTruthy()
        expect(item.avaliadoId).toBe(avaliadoPares)
      }
      const tiposRetornados = resultado.avaliacao360.identificadas.map((i) => i.tipoRelacionamento).sort()
      expect(tiposRetornados).toEqual(['autoavaliacao', 'externo', 'gestor'])
    })
  })

  describe('GUARD RAIL — clima_geral: gate por ciclo inteiro, sem NENHUMA atribuição', () => {
    it('ciclo de clima abaixo do mínimo → bloqueio completo; ciclo acima do mínimo → liberado, textos sem nenhum campo de atribuição/índice de respondente', async () => {
      const periodoConsulta = { de: '2026-02-01', ate: '2026-02-28' }

      const cicloBloqueado = criarCicloAvaliacaoFixture({
        dataInicio: '2026-02-01',
        dataFim: '2026-02-28',
        minimoRespostasPares: 3,
      })
      const cicloLiberado = criarCicloAvaliacaoFixture({
        dataInicio: '2026-02-01',
        dataFim: '2026-02-28',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([cicloBloqueado, cicloLiberado])
      repos.pesquisasRepo.semear([
        criarPesquisaFixture({ tipo: 'clima_geral', cicloId: cicloBloqueado.id }),
        criarPesquisaFixture({ tipo: 'clima_geral', cicloId: cicloLiberado.id }),
      ])

      const perguntaClima = criarPerguntaFixture({ enunciado: 'Como você avalia o clima?' })
      repos.perguntasRepo.semear([perguntaClima])

      // Ciclo bloqueado: só 2 respostas (abaixo do mínimo de 3).
      const respostasClimaBloqueadas = Array.from({ length: 2 }, () =>
        criarRespostaClimaFixture({ cicloId: cicloBloqueado.id, respondidoEm: new Date('2026-02-10T00:00:00Z') }),
      )
      const itensClimaBloqueados = respostasClimaBloqueadas.map((r) =>
        criarItemRespostaClimaFixture({ respostaClimaId: r.id, perguntaId: perguntaClima.id, valor: { texto: 'Bloqueado' } }),
      )

      // Ciclo liberado: 3 respostas (no mínimo).
      const respostasClimaLiberadas = Array.from({ length: 3 }, (_v, i) =>
        criarRespostaClimaFixture({ cicloId: cicloLiberado.id, respondidoEm: new Date('2026-02-15T00:00:00Z') }),
      )
      const itensClimaLiberados = respostasClimaLiberadas.map((r, i) =>
        criarItemRespostaClimaFixture({
          respostaClimaId: r.id,
          perguntaId: perguntaClima.id,
          valor: { texto: `Texto clima liberado #${i + 1}` },
        }),
      )

      repos.respostasClimaRepo.semear([...respostasClimaBloqueadas, ...respostasClimaLiberadas])
      repos.itensRespostaClimaRepo.semear([...itensClimaBloqueados, ...itensClimaLiberados])

      const resultado = await analiseAvaliacoesService.buscarAvaliacoes(admin, periodoConsulta)

      expect(resultado.climaGeral).toHaveLength(2)

      const grupoBloqueado = resultado.climaGeral.find((g) => g.cicloId === cicloBloqueado.id)!
      expect(grupoBloqueado.liberado).toBe(false)
      expect(grupoBloqueado.motivo).toBe('aguardando_minimo_respondentes')
      expect(grupoBloqueado.totalRespondentes).toBe(2)
      expect(grupoBloqueado).not.toHaveProperty('textos')

      const grupoLiberado = resultado.climaGeral.find((g) => g.cicloId === cicloLiberado.id)!
      expect(grupoLiberado.liberado).toBe(true)
      expect(grupoLiberado.totalRespondentes).toBe(3)
      expect(grupoLiberado.textos).toHaveLength(3)

      // Nenhum campo de atribuição/índice de respondente em nenhum texto liberado.
      const chavesGrupoLiberado = new Set<string>()
      coletarChaves(grupoLiberado, chavesGrupoLiberado)
      for (const proibido of [
        'respondenteId',
        'respondenteIndice',
        'indiceRespondente',
        'colaboradorId',
        'respostaClimaId',
        'avaliadorId',
      ]) {
        expect(chavesGrupoLiberado.has(proibido)).toBe(false)
      }
      // Só os 3 campos documentados de TextoAbertoItem por item.
      for (const item of grupoLiberado.textos!) {
        expect(Object.keys(item).sort()).toEqual(['perguntaEnunciado', 'perguntaId', 'texto'])
      }
    })
  })

  describe('nomeCiclo — metadado de grupo/item novo, presente em liberado e bloqueado, sem troca entre ciclos', () => {
    it('identificadas: nomeCiclo bate com o nome do CicloAvaliacao correspondente, sem troca entre múltiplos ciclos no mesmo resultado', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const cicloAlpha = criarCicloAvaliacaoFixture({
        nome: 'Ciclo Alpha 2026.1',
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
      })
      const cicloBeta = criarCicloAvaliacaoFixture({
        nome: 'Ciclo Beta 2026.1',
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
      })
      repos.ciclosRepo.semear([cicloAlpha, cicloBeta])
      repos.pesquisasRepo.semear([
        criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: cicloAlpha.id }),
        criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: cicloBeta.id }),
      ])

      const pergunta = criarPerguntaFixture()
      repos.perguntasRepo.semear([pergunta])

      for (const ciclo of [cicloAlpha, cicloBeta]) {
        const rel = criarRelacionamentoFixture({ cicloId: ciclo.id, tipoRelacionamento: 'autoavaliacao' })
        const envio = criarEnvioPesquisaFixture({ relacionamentoId: rel.id })
        const resposta = criarRespostaFixture({ envioId: envio.id, respondidoEm: new Date('2026-01-10T00:00:00Z') })
        const item = criarItemRespostaFixture({
          respostaId: resposta.id,
          perguntaId: pergunta.id,
          valor: { texto: `Texto autoavaliação ${ciclo.nome}` },
        })
        repos.relacionamentosRepo.semear([...repos.relacionamentosRepo.todas(), rel])
        repos.enviosRepo.semear([...repos.enviosRepo.todas(), envio])
        repos.respostasRepo.semear([...repos.respostasRepo.todas(), resposta])
        repos.itensRespostaRepo.semear([...repos.itensRespostaRepo.todas(), item])
        repos.colaboradoresRepo.semear([
          ...repos.colaboradoresRepo.todas(),
          criarColaboradorFixture({ id: rel.avaliadoId }),
          criarColaboradorFixture({ id: rel.avaliadorId }),
        ])
      }

      const resultado = await analiseAvaliacoesService.buscarAvaliacoes(admin, periodoConsulta)

      expect(resultado.avaliacao360.identificadas).toHaveLength(2)
      const itemAlpha = resultado.avaliacao360.identificadas.find((i) => i.cicloId === cicloAlpha.id)!
      const itemBeta = resultado.avaliacao360.identificadas.find((i) => i.cicloId === cicloBeta.id)!
      expect(itemAlpha.nomeCiclo).toBe('Ciclo Alpha 2026.1')
      expect(itemBeta.nomeCiclo).toBe('Ciclo Beta 2026.1')

      // Shape completo de AvaliacaoIdentificada — nomeCiclo é campo
      // documentado, não um extra acidental nem um campo faltando.
      expect(Object.keys(itemAlpha).sort()).toEqual(
        [
          'tipoRelacionamento',
          'cicloId',
          'nomeCiclo',
          'avaliadoId',
          'avaliadoNome',
          'avaliadorId',
          'avaliadorNome',
          'perguntaId',
          'perguntaEnunciado',
          'texto',
        ].sort(),
      )
    })

    it('paresSubordinado: nomeCiclo presente e correto tanto em liberado:true quanto liberado:false, sem troca entre ciclos diferentes', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const cicloBloqueado = criarCicloAvaliacaoFixture({
        nome: 'Ciclo Bloqueado',
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
        minimoRespostasPares: 3,
      })
      const cicloLiberado = criarCicloAvaliacaoFixture({
        nome: 'Ciclo Liberado',
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([cicloBloqueado, cicloLiberado])
      repos.pesquisasRepo.semear([
        criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: cicloBloqueado.id }),
        criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: cicloLiberado.id }),
      ])

      semearGrupoParesSubordinado(repos, {
        cicloId: cicloBloqueado.id,
        tipoRelacionamento: 'pares',
        quantidade: 2, // abaixo do mínimo de 3
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
      })
      semearGrupoParesSubordinado(repos, {
        cicloId: cicloLiberado.id,
        tipoRelacionamento: 'pares',
        quantidade: 4, // acima do mínimo de 3
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
      })

      const resultado = await analiseAvaliacoesService.buscarAvaliacoes(admin, periodoConsulta)

      expect(resultado.avaliacao360.paresSubordinado).toHaveLength(2)
      const grupoBloqueado = resultado.avaliacao360.paresSubordinado.find((g) => g.cicloId === cicloBloqueado.id)!
      const grupoLiberado = resultado.avaliacao360.paresSubordinado.find((g) => g.cicloId === cicloLiberado.id)!

      // Presença + correção do campo, SEM troca entre ciclos.
      expect(grupoBloqueado.liberado).toBe(false)
      expect(grupoBloqueado.nomeCiclo).toBe('Ciclo Bloqueado')
      expect(grupoBloqueado).not.toHaveProperty('textos')

      expect(grupoLiberado.liberado).toBe(true)
      expect(grupoLiberado.nomeCiclo).toBe('Ciclo Liberado')
      expect(grupoLiberado.textos).toHaveLength(4)

      // nomeCiclo NÃO fica preso ao branch condicional de liberado — presente
      // no shape completo tanto no estado bloqueado quanto no liberado.
      expect(Object.keys(grupoBloqueado).sort()).toEqual(
        [
          'cicloId',
          'nomeCiclo',
          'avaliadoId',
          'avaliadoNome',
          'tipoRelacionamento',
          'totalRespondentes',
          'minimoNecessario',
          'liberado',
          'motivo',
        ].sort(),
      )
      expect(Object.keys(grupoLiberado).sort()).toEqual(
        [
          'cicloId',
          'nomeCiclo',
          'avaliadoId',
          'avaliadoNome',
          'tipoRelacionamento',
          'totalRespondentes',
          'minimoNecessario',
          'liberado',
          'textos',
        ].sort(),
      )

      // REFORÇO do guard rail crítico nº 2: mesmo com nomeCiclo adicionado,
      // nenhum grupo pares/subordinado (liberado OU bloqueado) expõe
      // identidade de avaliador.
      for (const grupo of [grupoBloqueado, grupoLiberado]) {
        const chaves = new Set<string>()
        coletarChaves(grupo, chaves)
        for (const proibido of ['avaliadorId', 'avaliador_id', 'avaliadorNome', 'avaliador']) {
          expect(chaves.has(proibido)).toBe(false)
        }
      }
    })

    it('climaGeral: nomeCiclo presente e correto tanto em liberado:true quanto liberado:false, sem troca entre ciclos diferentes', async () => {
      const periodoConsulta = { de: '2026-02-01', ate: '2026-02-28' }
      const cicloBloqueado = criarCicloAvaliacaoFixture({
        nome: 'Clima Bloqueado',
        dataInicio: '2026-02-01',
        dataFim: '2026-02-28',
        minimoRespostasPares: 3,
      })
      const cicloLiberado = criarCicloAvaliacaoFixture({
        nome: 'Clima Liberado',
        dataInicio: '2026-02-01',
        dataFim: '2026-02-28',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([cicloBloqueado, cicloLiberado])
      repos.pesquisasRepo.semear([
        criarPesquisaFixture({ tipo: 'clima_geral', cicloId: cicloBloqueado.id }),
        criarPesquisaFixture({ tipo: 'clima_geral', cicloId: cicloLiberado.id }),
      ])

      const perguntaClima = criarPerguntaFixture({ enunciado: 'Como você avalia o clima?' })
      repos.perguntasRepo.semear([perguntaClima])

      const respostasBloqueadas = Array.from({ length: 2 }, () =>
        criarRespostaClimaFixture({ cicloId: cicloBloqueado.id, respondidoEm: new Date('2026-02-10T00:00:00Z') }),
      )
      const itensBloqueados = respostasBloqueadas.map((r) =>
        criarItemRespostaClimaFixture({ respostaClimaId: r.id, perguntaId: perguntaClima.id, valor: { texto: 'Bloqueado' } }),
      )
      const respostasLiberadas = Array.from({ length: 3 }, () =>
        criarRespostaClimaFixture({ cicloId: cicloLiberado.id, respondidoEm: new Date('2026-02-15T00:00:00Z') }),
      )
      const itensLiberados = respostasLiberadas.map((r, i) =>
        criarItemRespostaClimaFixture({
          respostaClimaId: r.id,
          perguntaId: perguntaClima.id,
          valor: { texto: `Texto clima liberado #${i + 1}` },
        }),
      )

      repos.respostasClimaRepo.semear([...respostasBloqueadas, ...respostasLiberadas])
      repos.itensRespostaClimaRepo.semear([...itensBloqueados, ...itensLiberados])

      const resultado = await analiseAvaliacoesService.buscarAvaliacoes(admin, periodoConsulta)

      expect(resultado.climaGeral).toHaveLength(2)
      const grupoBloqueado = resultado.climaGeral.find((g) => g.cicloId === cicloBloqueado.id)!
      const grupoLiberado = resultado.climaGeral.find((g) => g.cicloId === cicloLiberado.id)!

      expect(grupoBloqueado.liberado).toBe(false)
      expect(grupoBloqueado.nomeCiclo).toBe('Clima Bloqueado')
      expect(grupoBloqueado).not.toHaveProperty('textos')

      expect(grupoLiberado.liberado).toBe(true)
      expect(grupoLiberado.nomeCiclo).toBe('Clima Liberado')
      expect(grupoLiberado.textos).toHaveLength(3)

      // nomeCiclo presente no shape completo tanto bloqueado quanto liberado.
      expect(Object.keys(grupoBloqueado).sort()).toEqual(
        ['cicloId', 'nomeCiclo', 'totalRespondentes', 'minimoNecessario', 'liberado', 'motivo'].sort(),
      )
      expect(Object.keys(grupoLiberado).sort()).toEqual(
        ['cicloId', 'nomeCiclo', 'totalRespondentes', 'minimoNecessario', 'liberado', 'textos'].sort(),
      )
    })

  })

  describe('corte de período aplicado também ao GATE, não só aos textos', () => {
    it('grupo com respondentes suficientes somando TODO o histórico do ciclo, mas insuficientes DENTRO do período filtrado → gate usa a contagem do período, fica liberado:false', async () => {
      const ciclo = criarCicloAvaliacaoFixture({
        dataInicio: '2026-01-01',
        dataFim: '2026-03-31',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      const avaliadoId = randomUUID()
      const pergunta = criarPerguntaFixture()
      repos.perguntasRepo.semear([pergunta])

      // 2 respondentes DENTRO do período filtrado (janeiro) — abaixo do mínimo.
      semearGrupoParesSubordinado(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'pares',
        avaliadoId,
        quantidade: 2,
        respondidoEm: new Date('2026-01-15T00:00:00Z'),
        pergunta,
      })
      // Mais 2 respondentes FORA do período filtrado (março) — somando os 4,
      // o ciclo inteiro teria respondentes suficientes, mas o período
      // filtrado (só janeiro) não.
      semearGrupoParesSubordinado(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'pares',
        avaliadoId,
        quantidade: 2,
        respondidoEm: new Date('2026-03-20T00:00:00Z'),
        pergunta,
      })

      const periodoFiltrado = { de: '2026-01-01', ate: '2026-01-31' }
      const resultadoFiltrado = await analiseAvaliacoesService.buscarAvaliacoes(admin, periodoFiltrado)

      expect(resultadoFiltrado.avaliacao360.paresSubordinado).toHaveLength(1)
      const grupoFiltrado = resultadoFiltrado.avaliacao360.paresSubordinado[0]!
      expect(grupoFiltrado.totalRespondentes).toBe(2)
      expect(grupoFiltrado.liberado).toBe(false)

      // Controle: olhando o ciclo inteiro (período amplo), os 4 respondentes
      // juntos passam no limiar — confirma que a diferença acima é
      // exatamente por causa do corte de período no gate, não de outro bug.
      const periodoAmplo = { de: '2026-01-01', ate: '2026-03-31' }
      const resultadoAmplo = await analiseAvaliacoesService.buscarAvaliacoes(admin, periodoAmplo)
      const grupoAmplo = resultadoAmplo.avaliacao360.paresSubordinado[0]!
      expect(grupoAmplo.totalRespondentes).toBe(4)
      expect(grupoAmplo.liberado).toBe(true)
    })
  })

  describe('reembaralhamento — permutação válida, sem ordem forçada', () => {
    it('array de textos liberado é uma permutação dos mesmos itens de entrada (mesmo conteúdo, mesmo tamanho)', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({
        dataInicio: '2026-01-01',
        dataFim: '2026-01-31',
        minimoRespostasPares: 3,
      })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      semearGrupoParesSubordinado(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'subordinado',
        quantidade: 5,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        textoPrefixo: 'Embaralhar',
      })

      const resultado = await analiseAvaliacoesService.buscarAvaliacoes(admin, periodoConsulta)
      const grupo = resultado.avaliacao360.paresSubordinado[0]!
      expect(grupo.liberado).toBe(true)

      const textosEsperados = ['Embaralhar #1', 'Embaralhar #2', 'Embaralhar #3', 'Embaralhar #4', 'Embaralhar #5']
      const textosRecebidos = grupo.textos!.map((t) => t.texto)

      expect(textosRecebidos).toHaveLength(textosEsperados.length)
      expect([...textosRecebidos].sort()).toEqual([...textosEsperados].sort())
    })
  })

  describe('cicloId opcional restringe o universo', () => {
    it('cicloId restringe o universo a um único ciclo, mesmo havendo outro ciclo elegível no período', async () => {
      const cicloAlvo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      const outroCiclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-05', dataFim: '2026-01-20' })
      repos.ciclosRepo.semear([cicloAlvo, outroCiclo])
      repos.pesquisasRepo.semear([
        criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: cicloAlvo.id }),
        criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: outroCiclo.id }),
      ])

      semearGrupoParesSubordinado(repos, {
        cicloId: cicloAlvo.id,
        tipoRelacionamento: 'pares',
        quantidade: 3,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
      })
      semearGrupoParesSubordinado(repos, {
        cicloId: outroCiclo.id,
        tipoRelacionamento: 'pares',
        quantidade: 3,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
      })

      const resultado = await analiseAvaliacoesService.buscarAvaliacoes(admin, {
        de: '2026-01-01',
        ate: '2026-01-31',
        cicloId: cicloAlvo.id,
      })

      expect(resultado.cicloId).toBe(cicloAlvo.id)
      expect(resultado.avaliacao360.paresSubordinado).toHaveLength(1)
      expect(resultado.avaliacao360.paresSubordinado[0]!.cicloId).toBe(cicloAlvo.id)
    })
  })
})

describe('GET /api/analise/avaliacoes — controle de acesso por papel (HTTP)', () => {
  let repos: ReturnType<typeof construirRepositoriosAnaliseFalsos>
  const admin = criarColaboradorFixture({ papel: 'admin', usuarioAuthId: 'auth-avaliacoes-admin' })
  const gestorRh = criarColaboradorFixture({ papel: 'gestor_rh', usuarioAuthId: 'auth-avaliacoes-gestor' })
  const colaboradorGuardRail = criarColaboradorFixture({
    papel: 'colaborador',
    usuarioAuthId: 'auth-avaliacoes-colaborador',
  })

  beforeEach(() => {
    repos = construirRepositoriosAnaliseFalsos()
    repos.colaboradoresRepo.semear([admin, gestorRh, colaboradorGuardRail])
    configurarSupabaseAdminPadrao()
    configurarGetUserPorToken({
      'token-admin': 'auth-avaliacoes-admin',
      'token-gestor_rh': 'auth-avaliacoes-gestor',
      'token-colaborador': 'auth-avaliacoes-colaborador',
    })
  })

  it('sem token → 401 TOKEN_AUSENTE', async () => {
    const resposta = await request(app).get('/api/analise/avaliacoes?de=2026-01-01&ate=2026-01-31')
    expect(resposta.status).toBe(401)
    expect(resposta.body.erro.codigo).toBe('TOKEN_AUSENTE')
  })

  it('token de papel colaborador → 403 PAPEL_NAO_AUTORIZADO', async () => {
    const resposta = await request(app)
      .get('/api/analise/avaliacoes?de=2026-01-01&ate=2026-01-31')
      .set('Authorization', 'Bearer token-colaborador')
    expect(resposta.status).toBe(403)
    expect(resposta.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO')
  })

  it.each(['token-admin', 'token-gestor_rh'] as const)('token de papel autorizado (%s) → 200, payload idêntico entre os dois papéis', async (token) => {
    const resposta = await request(app)
      .get('/api/analise/avaliacoes?de=2026-01-01&ate=2026-01-31')
      .set('Authorization', `Bearer ${token}`)
    expect(resposta.status).toBe(200)
    expect(resposta.body).toMatchObject({
      avaliacao360: { identificadas: [], paresSubordinado: [] },
      climaGeral: [],
    })
  })

  it('query "de"/"ate" ausentes via HTTP → 422 CAMPO_INVALIDO', async () => {
    const resposta = await request(app).get('/api/analise/avaliacoes').set('Authorization', 'Bearer token-admin')
    expect(resposta.status).toBe(422)
    expect(resposta.body.erro.codigo).toBe('CAMPO_INVALIDO')
  })
})
