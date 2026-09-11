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
import * as analiseNuvemPalavrasService from './analise-nuvem-palavras.service'

// Silencia console.error esperado (tratadorErros loga qualquer 500 antes de
// responder) — não deve poluir a saída do teste nem esconder falhas reais.
vi.spyOn(console, 'error').mockImplementation(() => undefined)

function ator(papel: ColaboradorAutenticado['papel']): ColaboradorAutenticado {
  return { id: randomUUID(), papel, nomeCompleto: 'Ator Teste', email: `ator-${randomUUID()}@exemplo.com` }
}

/** Varredura recursiva de chaves de um objeto/array — mesmo padrão já usado nas outras suítes de `analise`. */
function coletarChaves(valor: unknown, chaves: Set<string>): void {
  if (valor === null || typeof valor !== 'object') return
  for (const [chave, sub] of Object.entries(valor as Record<string, unknown>)) {
    chaves.add(chave)
    coletarChaves(sub, chaves)
  }
}

/**
 * Monta, num único ciclo `avaliacao_360` já dentro do período informado, um
 * grupo `pares`/`subordinado` com `quantidade` respondentes distintos, cada
 * um com uma resposta `texto_aberto` registrada dentro do período — mesmo
 * padrão de `analise-avaliacoes.service.spec.ts`.
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
    texto: (indice: number) => string
  },
): { avaliadoId: string } {
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
      valor: { texto: opcoes.texto(i) },
    })
    repos.relacionamentosRepo.semear([...repos.relacionamentosRepo.todas(), rel])
    repos.enviosRepo.semear([...repos.enviosRepo.todas(), envio])
    repos.respostasRepo.semear([...repos.respostasRepo.todas(), resposta])
    repos.itensRespostaRepo.semear([...repos.itensRespostaRepo.todas(), item])
  }

  return { avaliadoId }
}

function semearIdentificada(
  repos: ReturnType<typeof construirRepositoriosAnaliseFalsos>,
  opcoes: {
    cicloId: string
    tipoRelacionamento: 'autoavaliacao' | 'gestor' | 'externo'
    respondidoEm: Date
    texto: string
    pergunta?: ReturnType<typeof criarPerguntaFixture>
  },
): void {
  const pergunta = opcoes.pergunta ?? criarPerguntaFixture()
  repos.perguntasRepo.semear([...repos.perguntasRepo.todas(), pergunta])
  const rel = criarRelacionamentoFixture({ cicloId: opcoes.cicloId, tipoRelacionamento: opcoes.tipoRelacionamento })
  const envio = criarEnvioPesquisaFixture({ relacionamentoId: rel.id })
  const resposta = criarRespostaFixture({ envioId: envio.id, respondidoEm: opcoes.respondidoEm })
  const item = criarItemRespostaFixture({
    respostaId: resposta.id,
    perguntaId: pergunta.id,
    valor: { texto: opcoes.texto },
  })
  repos.relacionamentosRepo.semear([...repos.relacionamentosRepo.todas(), rel])
  repos.enviosRepo.semear([...repos.enviosRepo.todas(), envio])
  repos.respostasRepo.semear([...repos.respostasRepo.todas(), resposta])
  repos.itensRespostaRepo.semear([...repos.itensRespostaRepo.todas(), item])
}

function semearClima(
  repos: ReturnType<typeof construirRepositoriosAnaliseFalsos>,
  opcoes: {
    cicloId: string
    quantidade: number
    respondidoEm: Date
    pergunta?: ReturnType<typeof criarPerguntaFixture>
    texto: (indice: number) => string
  },
): void {
  const pergunta = opcoes.pergunta ?? criarPerguntaFixture()
  repos.perguntasRepo.semear([...repos.perguntasRepo.todas(), pergunta])

  const respostas = Array.from({ length: opcoes.quantidade }, () =>
    criarRespostaClimaFixture({ cicloId: opcoes.cicloId, respondidoEm: opcoes.respondidoEm }),
  )
  const itens = respostas.map((r, i) =>
    criarItemRespostaClimaFixture({ respostaClimaId: r.id, perguntaId: pergunta.id, valor: { texto: opcoes.texto(i) } }),
  )
  repos.respostasClimaRepo.semear([...repos.respostasClimaRepo.todas(), ...respostas])
  repos.itensRespostaClimaRepo.semear([...repos.itensRespostaClimaRepo.todas(), ...itens])
}

describe('analise-nuvem-palavras.service — buscarNuvemPalavras', () => {
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
        analiseNuvemPalavrasService.buscarNuvemPalavras(colaborador, { de: '2026-01-01', ate: '2026-01-31' }),
      ).rejects.toMatchObject({ status: 403, codigo: 'PAPEL_NAO_AUTORIZADO' })

      expect(repos.ciclosRepo.todas()).toHaveLength(0)
    })

    it('admin e gestor_rh têm acesso (payload zerado, sem ciclos seedados)', async () => {
      const esperado = {
        periodo: { de: '2026-01-01', ate: '2026-01-31' },
        cicloId: null,
        palavras: [],
        metricas: { totalEnvios: 0, totalRespostas: 0, tempoMedioResposta: { horas: 0, amostras: 0 } },
      }
      await expect(
        analiseNuvemPalavrasService.buscarNuvemPalavras(admin, { de: '2026-01-01', ate: '2026-01-31' }),
      ).resolves.toEqual(esperado)
      await expect(
        analiseNuvemPalavrasService.buscarNuvemPalavras(gestorRh, { de: '2026-01-01', ate: '2026-01-31' }),
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
      await expect(analiseNuvemPalavrasService.buscarNuvemPalavras(admin, dto)).rejects.toMatchObject({
        status: 422,
        codigo: 'CAMPO_INVALIDO',
      })
    })

    it('ate < de → 422 PERIODO_INVALIDO', async () => {
      await expect(
        analiseNuvemPalavrasService.buscarNuvemPalavras(admin, { de: '2026-02-01', ate: '2026-01-01' }),
      ).rejects.toMatchObject({ status: 422, codigo: 'PERIODO_INVALIDO' })
    })

    it('cicloId malformado (não-uuid) → 422 CAMPO_INVALIDO', async () => {
      await expect(
        analiseNuvemPalavrasService.buscarNuvemPalavras(admin, {
          de: '2026-01-01',
          ate: '2026-01-31',
          cicloId: 'nao-e-um-uuid',
        }),
      ).rejects.toMatchObject({ status: 422, codigo: 'CAMPO_INVALIDO' })
    })

    it('cicloId com uuid válido mas inexistente → 404 CICLO_NAO_ENCONTRADO', async () => {
      await expect(
        analiseNuvemPalavrasService.buscarNuvemPalavras(admin, {
          de: '2026-01-01',
          ate: '2026-01-31',
          cicloId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 404, codigo: 'CICLO_NAO_ENCONTRADO' })
    })
  })

  describe('GUARD RAIL CRÍTICO — pares/subordinado: nunca buscar-depois-filtrar', () => {
    it('grupo ABAIXO do mínimo: palavra-marcador exclusiva do grupo NUNCA aparece na lista, mesmo tentando bypass via campos extras não documentados', async () => {
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
        texto: () => 'A palavra marcadora xicara123 aparece aqui varias vezes xicara123 xicara123',
      })

      const dtoComTentativaDeBypass = {
        de: periodoConsulta.de,
        ate: periodoConsulta.ate,
        ignorarLimiar: true,
        forcarExibir: true,
        modoTransparencia: true,
        verComoAdmin: true,
      } as unknown as analiseNuvemPalavrasService.BuscarNuvemPalavrasDto

      const resultado = await analiseNuvemPalavrasService.buscarNuvemPalavras(admin, dtoComTentativaDeBypass)

      expect(resultado.palavras.find((p) => p.palavra === 'xicara123')).toBeUndefined()
      expect(JSON.stringify(resultado)).not.toContain('xicara123')
      expect(resultado.palavras).toEqual([])
    })

    it('grupo NO limiar exato (totalRespondentes === minimoNecessario) contribui palavras — limiar é inclusivo (>=)', async () => {
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
        texto: () => 'liberadopalavra aparece no limiar exato',
      })

      const resultado = await analiseNuvemPalavrasService.buscarNuvemPalavras(admin, periodoConsulta)

      const item = resultado.palavras.find((p) => p.palavra === 'liberadopalavra')
      expect(item).toBeDefined()
      expect(item!.frequencia).toBe(3) // 1 ocorrência por resposta, 3 respostas
    })

    it('grupo subordinado ACIMA do mínimo também contribui (mesmo tratamento de pares)', async () => {
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
        texto: () => 'subordinadopalavra contribuiu normalmente',
      })

      const resultado = await analiseNuvemPalavrasService.buscarNuvemPalavras(admin, periodoConsulta)

      const item = resultado.palavras.find((p) => p.palavra === 'subordinadopalavra')
      expect(item).toBeDefined()
      expect(item!.frequencia).toBe(5)
    })
  })

  describe('GUARD RAIL CRÍTICO — clima_geral: gate por ciclo inteiro', () => {
    it('ciclo de clima ABAIXO do mínimo → palavra-marcadora nunca aparece; ciclo ACIMA do mínimo → palavras contribuem', async () => {
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

      semearClima(repos, {
        cicloId: cicloBloqueado.id,
        quantidade: 2, // abaixo do mínimo de 3
        respondidoEm: new Date('2026-02-10T00:00:00Z'),
        texto: () => 'climabloqueadomarcador nao deveria aparecer',
      })
      semearClima(repos, {
        cicloId: cicloLiberado.id,
        quantidade: 3, // no mínimo
        respondidoEm: new Date('2026-02-15T00:00:00Z'),
        texto: () => 'climaliberadomarcador deveria aparecer normalmente',
      })

      const resultado = await analiseNuvemPalavrasService.buscarNuvemPalavras(admin, periodoConsulta)

      expect(resultado.palavras.find((p) => p.palavra === 'climabloqueadomarcador')).toBeUndefined()
      expect(JSON.stringify(resultado)).not.toContain('climabloqueadomarcador')

      const itemLiberado = resultado.palavras.find((p) => p.palavra === 'climaliberadomarcador')
      expect(itemLiberado).toBeDefined()
      expect(itemLiberado!.frequencia).toBe(3)
    })
  })

  describe('autoavaliacao/gestor/externo — sempre liberados, sem gate (1:1)', () => {
    it.each(['autoavaliacao', 'gestor', 'externo'] as const)(
      'relação %s contribui palavras mesmo com uma única resposta (sem terceiro a proteger)',
      async (tipo) => {
        const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
        const ciclo = criarCicloAvaliacaoFixture({
          dataInicio: '2026-01-01',
          dataFim: '2026-01-31',
          minimoRespostasPares: 3,
        })
        repos.ciclosRepo.semear([ciclo])
        repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

        semearIdentificada(repos, {
          cicloId: ciclo.id,
          tipoRelacionamento: tipo,
          respondidoEm: new Date('2026-01-10T00:00:00Z'),
          texto: `palavraidentificada${tipo} única ocorrência`,
        })

        const resultado = await analiseNuvemPalavrasService.buscarNuvemPalavras(admin, periodoConsulta)

        const item = resultado.palavras.find((p) => p.palavra === `palavraidentificada${tipo}`)
        expect(item).toBeDefined()
        expect(item!.frequencia).toBe(1)
      },
    )
  })

  describe('GUARD RAIL CRÍTICO — payload nunca expõe identidade/origem por palavra', () => {
    it('nenhum campo de identidade (avaliadorId, avaliadoId, cicloId por palavra, tipoRelacionamento) aparece em nenhum item de `palavras`', async () => {
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
        quantidade: 3,
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        texto: () => 'feedback excelente sobre comunicacao',
      })
      semearIdentificada(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'autoavaliacao',
        respondidoEm: new Date('2026-01-12T00:00:00Z'),
        texto: 'feedback identificado tambem',
      })

      const resultado = await analiseNuvemPalavrasService.buscarNuvemPalavras(admin, periodoConsulta)

      expect(resultado.palavras.length).toBeGreaterThan(0)
      for (const item of resultado.palavras) {
        expect(Object.keys(item).sort()).toEqual(['frequencia', 'palavra'])
      }

      const chaves = new Set<string>()
      coletarChaves(resultado, chaves)
      for (const proibido of [
        'avaliadorId',
        'avaliador_id',
        'avaliadoId',
        'avaliadorNome',
        'avaliadoNome',
        'tipoRelacionamento',
        'texto',
      ]) {
        expect(chaves.has(proibido)).toBe(false)
      }

      // Shape de topo do payload — só os 4 campos documentados no contrato.
      expect(Object.keys(resultado).sort()).toEqual(['cicloId', 'metricas', 'palavras', 'periodo'].sort())
    })
  })

  describe('tokenização — stopwords, lowercase, tamanho mínimo, ordenação, corte em 50', () => {
    it('lowercase aplicado: "Feedback" e "feedback" contam como a mesma palavra', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      semearIdentificada(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'autoavaliacao',
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        texto: 'Feedback muito bom, feedback excelente!',
      })

      const resultado = await analiseNuvemPalavrasService.buscarNuvemPalavras(admin, periodoConsulta)

      const item = resultado.palavras.find((p) => p.palavra === 'feedback')
      expect(item).toBeDefined()
      expect(item!.frequencia).toBe(2)
      expect(resultado.palavras.find((p) => p.palavra === 'Feedback')).toBeUndefined()
    })

    it('stopwords em português são removidas (ex.: "de", "a", "o", "que", "para", "com")', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      semearIdentificada(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'autoavaliacao',
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        texto: 'de a o que para com essa pessoa comunicacao',
      })

      const resultado = await analiseNuvemPalavrasService.buscarNuvemPalavras(admin, periodoConsulta)

      const palavrasRetornadas = resultado.palavras.map((p) => p.palavra)
      for (const stopword of ['de', 'a', 'o', 'que', 'para', 'com', 'essa']) {
        expect(palavrasRetornadas).not.toContain(stopword)
      }
      expect(palavrasRetornadas).toContain('pessoa')
      expect(palavrasRetornadas).toContain('comunicacao')
    })

    it('palavras com menos de 3 caracteres são excluídas mesmo não sendo stopword', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      semearIdentificada(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'autoavaliacao',
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        texto: 'vc tá ok né bom trabalho realizado',
      })

      const resultado = await analiseNuvemPalavrasService.buscarNuvemPalavras(admin, periodoConsulta)

      const palavrasRetornadas = resultado.palavras.map((p) => p.palavra)
      for (const curta of ['vc', 'tá', 'ok', 'né']) {
        expect(palavrasRetornadas).not.toContain(curta)
      }
      expect(palavrasRetornadas).toContain('bom')
      expect(palavrasRetornadas).toContain('trabalho')
      expect(palavrasRetornadas).toContain('realizado')
    })

    it('pontuação é removida/normalizada: "ótimo!" e "ótimo" contam como a mesma palavra', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      semearIdentificada(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'autoavaliacao',
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        texto: 'ótimo! simplesmente ótimo, muito ótimo.',
      })

      const resultado = await analiseNuvemPalavrasService.buscarNuvemPalavras(admin, periodoConsulta)

      const item = resultado.palavras.find((p) => p.palavra === 'ótimo')
      expect(item).toBeDefined()
      expect(item!.frequencia).toBe(3)
    })

    it('ordenação decrescente por frequência, com corte em 50 (51 palavras únicas geram exatamente 50 no resultado)', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      // 51 palavras distintas, cada uma repetida um número de vezes igual a
      // seu índice (garante frequências distintas e ordenáveis de forma
      // determinística: palavraunicaXX aparece N vezes, N = índice). Sufixo
      // em letras (não dígitos) — o tokenizador usa `\p{L}+`, que descarta
      // dígitos como separador, então um sufixo numérico colapsaria todas as
      // 51 variações no mesmo token "palavraunica".
      const alfabeto = 'abcdefghijklmnopqrstuvwxyz'
      const palavrasBase = Array.from({ length: 51 }, (_v, i) => `palavraunica${alfabeto[Math.floor(i / 26)]}${alfabeto[i % 26]}`)
      const texto = palavrasBase.map((p, i) => Array(i + 1).fill(p).join(' ')).join(' ')

      semearIdentificada(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'autoavaliacao',
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        texto,
      })

      const resultado = await analiseNuvemPalavrasService.buscarNuvemPalavras(admin, periodoConsulta)

      expect(resultado.palavras).toHaveLength(50)

      // Ordenação decrescente confirmada ao longo de toda a lista.
      for (let i = 1; i < resultado.palavras.length; i++) {
        expect(resultado.palavras[i - 1]!.frequencia).toBeGreaterThanOrEqual(resultado.palavras[i]!.frequencia)
      }

      // A palavra de menor frequência (palavraunicaaa, frequência 1) foi
      // cortada do top 50; a de maior frequência (palavraunicaby, frequência
      // 51 — índice 50, sufixo "by" em base26) está presente e em primeiro
      // lugar.
      expect(resultado.palavras.find((p) => p.palavra === 'palavraunicaaa')).toBeUndefined()
      expect(resultado.palavras[0]).toEqual({ palavra: 'palavraunicaby', frequencia: 51 })
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

      semearIdentificada(repos, {
        cicloId: cicloAlvo.id,
        tipoRelacionamento: 'autoavaliacao',
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        texto: 'palavraalvo apareceu no ciclo certo',
      })
      semearIdentificada(repos, {
        cicloId: outroCiclo.id,
        tipoRelacionamento: 'autoavaliacao',
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        texto: 'palavraoutrociclo nao deveria aparecer',
      })

      const resultado = await analiseNuvemPalavrasService.buscarNuvemPalavras(admin, {
        de: '2026-01-01',
        ate: '2026-01-31',
        cicloId: cicloAlvo.id,
      })

      expect(resultado.cicloId).toBe(cicloAlvo.id)
      expect(resultado.palavras.find((p) => p.palavra === 'palavraalvo')).toBeDefined()
      expect(resultado.palavras.find((p) => p.palavra === 'palavraoutrociclo')).toBeUndefined()
    })
  })

  describe('métricas complementares — reaproveitadas, sem quebra por avaliador/avaliado', () => {
    it('metricas.totalRespostas/totalEnvios refletem o universo do período, sem nenhuma quebra por grupo', async () => {
      const periodoConsulta = { de: '2026-01-01', ate: '2026-01-31' }
      const ciclo = criarCicloAvaliacaoFixture({ dataInicio: '2026-01-01', dataFim: '2026-01-31' })
      repos.ciclosRepo.semear([ciclo])
      repos.pesquisasRepo.semear([criarPesquisaFixture({ tipo: 'avaliacao_360', cicloId: ciclo.id })])

      semearIdentificada(repos, {
        cicloId: ciclo.id,
        tipoRelacionamento: 'autoavaliacao',
        respondidoEm: new Date('2026-01-10T00:00:00Z'),
        texto: 'resposta unica registrada',
      })

      const resultado = await analiseNuvemPalavrasService.buscarNuvemPalavras(admin, periodoConsulta)

      expect(resultado.metricas.totalRespostas).toBe(1)
      expect(resultado.metricas.totalEnvios).toBeGreaterThanOrEqual(1)
      expect(Object.keys(resultado.metricas).sort()).toEqual(
        ['totalEnvios', 'totalRespostas', 'tempoMedioResposta'].sort(),
      )
      expect(Object.keys(resultado.metricas.tempoMedioResposta).sort()).toEqual(['horas', 'amostras'].sort())
    })
  })
})

describe('GET /api/analise/nuvem-palavras — controle de acesso por papel (HTTP)', () => {
  let repos: ReturnType<typeof construirRepositoriosAnaliseFalsos>
  const admin = criarColaboradorFixture({ papel: 'admin', usuarioAuthId: 'auth-nuvem-admin' })
  const gestorRh = criarColaboradorFixture({ papel: 'gestor_rh', usuarioAuthId: 'auth-nuvem-gestor' })
  const colaboradorGuardRail = criarColaboradorFixture({
    papel: 'colaborador',
    usuarioAuthId: 'auth-nuvem-colaborador',
  })

  beforeEach(() => {
    repos = construirRepositoriosAnaliseFalsos()
    repos.colaboradoresRepo.semear([admin, gestorRh, colaboradorGuardRail])
    configurarSupabaseAdminPadrao()
    configurarGetUserPorToken({
      'token-admin': 'auth-nuvem-admin',
      'token-gestor_rh': 'auth-nuvem-gestor',
      'token-colaborador': 'auth-nuvem-colaborador',
    })
  })

  it('sem token → 401 TOKEN_AUSENTE', async () => {
    const resposta = await request(app).get('/api/analise/nuvem-palavras?de=2026-01-01&ate=2026-01-31')
    expect(resposta.status).toBe(401)
    expect(resposta.body.erro.codigo).toBe('TOKEN_AUSENTE')
  })

  it('token de papel colaborador → 403 PAPEL_NAO_AUTORIZADO', async () => {
    const resposta = await request(app)
      .get('/api/analise/nuvem-palavras?de=2026-01-01&ate=2026-01-31')
      .set('Authorization', 'Bearer token-colaborador')
    expect(resposta.status).toBe(403)
    expect(resposta.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO')
  })

  it.each(['token-admin', 'token-gestor_rh'] as const)(
    'token de papel autorizado (%s) → 200, payload idêntico entre os dois papéis',
    async (token) => {
      const resposta = await request(app)
        .get('/api/analise/nuvem-palavras?de=2026-01-01&ate=2026-01-31')
        .set('Authorization', `Bearer ${token}`)
      expect(resposta.status).toBe(200)
      expect(resposta.body).toEqual({
        periodo: { de: '2026-01-01', ate: '2026-01-31' },
        cicloId: null,
        palavras: [],
        metricas: { totalEnvios: 0, totalRespostas: 0, tempoMedioResposta: { horas: 0, amostras: 0 } },
      })
    },
  )

  it('query "de"/"ate" ausentes via HTTP → 422 CAMPO_INVALIDO', async () => {
    const resposta = await request(app).get('/api/analise/nuvem-palavras').set('Authorization', 'Bearer token-admin')
    expect(resposta.status).toBe(422)
    expect(resposta.body.erro.codigo).toBe('CAMPO_INVALIDO')
  })
})
