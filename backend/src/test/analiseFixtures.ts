import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import { AppDataSource } from '../data-source'
import { Colaborador } from '../modules/colaboradores/colaborador.entity'
import { CicloAvaliacao } from '../modules/ciclos-avaliacao/ciclo-avaliacao.entity'
import { RelacionamentoAvaliacao } from '../modules/ciclos-avaliacao/relacionamento-avaliacao.entity'
import { CicloParticipante } from '../modules/ciclo-participantes/ciclo-participante.entity'
import { EnvioPesquisa } from '../modules/envios-pesquisa/envio-pesquisa.entity'
import { Pesquisa } from '../modules/pesquisas/pesquisa.entity'
import { Resposta } from '../modules/respostas/resposta.entity'
import { ItemResposta } from '../modules/respostas/item-resposta.entity'
import { RespostaClima } from '../modules/respostas-clima/resposta-clima.entity'
import { ItemRespostaClima } from '../modules/respostas-clima/item-resposta-clima.entity'
import { Pergunta } from '../modules/perguntas/pergunta.entity'
import { FakeRepository } from './fakeRepository'

/**
 * Constrói os fakes de repositório usados por `analise.service.ts` +
 * `analise-avaliacoes.service.ts` (e por `buscarCicloOuFalhar`, reaproveitado
 * de `ciclos-avaliacao.service.ts`) e conecta `AppDataSource.getRepository`
 * para devolvê-los conforme a entidade pedida — espelha
 * `construirRepositoriosFalsos()` de `test/fixtures.ts` (colaboradores/
 * equipes), mas para o grafo de entidades tocado pelo módulo `analise` (só
 * leitura). `itensRespostaRepo`/`itensRespostaClimaRepo`/`perguntasRepo`
 * foram acrescentados para "Avaliações" (`.claude/tasks/analise-avaliacoes/`)
 * — "Visão Geral" nunca toca `itens_resposta`/`perguntas` (guard rail
 * "nunca projetar identidade", só `COUNT`/`AVG`), mas "Avaliações" precisa
 * juntar `item.valor` (texto) com identidade para 3 dos 5 tipos de
 * relacionamento (ver task-backend.md, guard rail crítico nº 2). Cada
 * repositório também é ligado como alvo de JOIN dos outros via
 * `resolverEntidade` (ver `FakeRepository.createQueryBuilder`). Chamar em
 * beforeEach para isolar o estado entre testes.
 */
export function construirRepositoriosAnaliseFalsos() {
  const ciclosRepo = new FakeRepository<CicloAvaliacao>()
  const pesquisasRepo = new FakeRepository<Pesquisa>()
  const relacionamentosRepo = new FakeRepository<RelacionamentoAvaliacao>()
  const enviosRepo = new FakeRepository<EnvioPesquisa>()
  const respostasRepo = new FakeRepository<Resposta>()
  const itensRespostaRepo = new FakeRepository<ItemResposta>()
  const respostasClimaRepo = new FakeRepository<RespostaClima>()
  const itensRespostaClimaRepo = new FakeRepository<ItemRespostaClima>()
  const perguntasRepo = new FakeRepository<Pergunta>()
  const participantesRepo = new FakeRepository<CicloParticipante>()
  // colaboradoresRepo é tocado diretamente por "Avaliações"
  // (`buscarNomesColaboradores`/joins de `buscarIdentificadas360`) e também
  // existe para que o middleware `autenticar` funcione nos testes HTTP
  // (supertest), que resolvem `req.colaboradorAutenticado` via
  // `AppDataSource.getRepository(Colaborador)`.
  const colaboradoresRepo = new FakeRepository<Colaborador>()

  const mapa = new Map<Function, FakeRepository<any>>([
    [CicloAvaliacao, ciclosRepo],
    [Pesquisa, pesquisasRepo],
    [RelacionamentoAvaliacao, relacionamentosRepo],
    [EnvioPesquisa, enviosRepo],
    [Resposta, respostasRepo],
    [ItemResposta, itensRespostaRepo],
    [RespostaClima, respostasClimaRepo],
    [ItemRespostaClima, itensRespostaClimaRepo],
    [Pergunta, perguntasRepo],
    [CicloParticipante, participantesRepo],
    [Colaborador, colaboradoresRepo],
  ])

  const resolverEntidade = (entidade: Function): FakeRepository<any> => {
    const repo = mapa.get(entidade)
    if (!repo) throw new Error(`FakeRepository (analise) não configurado para a entidade: ${String(entidade)}`)
    return repo
  }

  for (const repo of mapa.values()) repo.resolverEntidade = resolverEntidade

  vi.mocked(AppDataSource.getRepository).mockImplementation((entidade: unknown) => resolverEntidade(entidade as Function) as never)

  return {
    ciclosRepo,
    pesquisasRepo,
    relacionamentosRepo,
    enviosRepo,
    respostasRepo,
    itensRespostaRepo,
    respostasClimaRepo,
    itensRespostaClimaRepo,
    perguntasRepo,
    participantesRepo,
    colaboradoresRepo,
  }
}

/** Datas fixas em UTC (`Z`) — evita flutuação por fuso horário local da máquina que roda o teste. */
export function dataUtc(iso: string): Date {
  return new Date(iso.includes('T') ? iso : `${iso}T00:00:00Z`)
}

export function criarCicloAvaliacaoFixture(parcial: Partial<CicloAvaliacao> = {}): CicloAvaliacao {
  const agora = new Date()
  return {
    id: randomUUID(),
    nome: 'Ciclo Teste',
    descricao: null,
    dataInicio: '2026-01-01',
    dataFim: '2026-03-31',
    status: 'ativo',
    anonimizarRespostasPares: true,
    minimoRespostasPares: 3,
    tiposRelacionamentoGerados: ['autoavaliacao', 'gestor', 'pares', 'subordinado'],
    criadoPor: null,
    criadoEm: agora,
    atualizadoEm: agora,
    ...parcial,
  } as CicloAvaliacao
}

export function criarPesquisaFixture(parcial: Partial<Pesquisa> = {}): Pesquisa {
  const agora = new Date()
  return {
    id: randomUUID(),
    titulo: 'Pesquisa Teste',
    mensagemBoasVindas: null,
    logoUrl: null,
    status: 'publicada',
    tipo: 'avaliacao_360',
    cicloId: null,
    criadoPor: null,
    criadoEm: agora,
    atualizadoEm: agora,
    ...parcial,
  } as Pesquisa
}

export function criarRelacionamentoFixture(parcial: Partial<RelacionamentoAvaliacao> = {}): RelacionamentoAvaliacao {
  return {
    id: randomUUID(),
    cicloId: randomUUID(),
    avaliadorId: randomUUID(),
    avaliadoId: randomUUID(),
    tipoRelacionamento: 'autoavaliacao',
    criadoEm: new Date(),
    ...parcial,
  } as RelacionamentoAvaliacao
}

export function criarEnvioPesquisaFixture(parcial: Partial<EnvioPesquisa> = {}): EnvioPesquisa {
  return {
    id: randomUUID(),
    pesquisaId: randomUUID(),
    relacionamentoId: null,
    cicloId: null,
    status: 'pendente',
    tokenAcesso: randomUUID(),
    enviadoEm: null,
    concluidoEm: null,
    quantidadeLembretes: 0,
    cpfConfirmadoEm: null,
    tentativasCpfInvalidas: 0,
    criadoEm: new Date(),
    ...parcial,
  } as EnvioPesquisa
}

export function criarRespostaFixture(parcial: Partial<Resposta> = {}): Resposta {
  return {
    id: randomUUID(),
    envioId: randomUUID(),
    respondidoEm: new Date(),
    ...parcial,
  } as Resposta
}

export function criarRespostaClimaFixture(parcial: Partial<RespostaClima> = {}): RespostaClima {
  return {
    id: randomUUID(),
    pesquisaId: randomUUID(),
    cicloId: randomUUID(),
    respondidoEm: new Date(),
    ...parcial,
  } as RespostaClima
}

export function criarCicloParticipanteFixture(parcial: Partial<CicloParticipante> = {}): CicloParticipante {
  return {
    id: randomUUID(),
    cicloId: randomUUID(),
    colaboradorId: randomUUID(),
    respondeuEm: null,
    criadoEm: new Date(),
    ...parcial,
  } as CicloParticipante
}

/** Fixture de `perguntas` — default `tipo: 'texto_aberto'` (o único tipo lido por "Avaliações"). */
export function criarPerguntaFixture(parcial: Partial<Pergunta> = {}): Pergunta {
  const agora = new Date()
  return {
    id: randomUUID(),
    paginaId: randomUUID(),
    tipo: 'texto_aberto',
    enunciado: 'O que você gostaria de destacar?',
    obrigatoria: false,
    configuracao: {},
    ordem: 1,
    criadoEm: agora,
    atualizadoEm: agora,
    ...parcial,
  } as Pergunta
}

/** Fixture de `itens_resposta` — shape `{ texto: '...' }` no `valor` jsonb, mesmo formato de `texto_aberto`. */
export function criarItemRespostaFixture(parcial: Partial<ItemResposta> = {}): ItemResposta {
  return {
    id: randomUUID(),
    respostaId: randomUUID(),
    perguntaId: randomUUID(),
    valor: { texto: 'Texto de resposta padrão do teste.' },
    criadoEm: new Date(),
    ...parcial,
  } as ItemResposta
}

/** Fixture de `itens_resposta_clima` — mesmo shape `{ texto: '...' }`, mas sem NENHUMA FK de identidade (estrutural). */
export function criarItemRespostaClimaFixture(parcial: Partial<ItemRespostaClima> = {}): ItemRespostaClima {
  return {
    id: randomUUID(),
    respostaClimaId: randomUUID(),
    perguntaId: randomUUID(),
    valor: { texto: 'Texto de clima padrão do teste.' },
    criadoEm: new Date(),
    ...parcial,
  } as ItemRespostaClima
}
