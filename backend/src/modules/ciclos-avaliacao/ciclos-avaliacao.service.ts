import { In, type EntityManager } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import {
  STATUS_CICLO_VALORES,
  TIPO_RELACIONAMENTO_GERACAO_VALORES,
  type StatusCiclo,
  type TipoRelacionamento,
} from '../../common/enums'
import { ErroHttp } from '../../common/erro-http'
import { validarEnum, validarListaEnum, validarTextoObrigatorio } from '../../common/validacao'
import type { ColaboradorAutenticado } from '../../types/express'
import { Colaborador } from '../colaboradores/colaborador.entity'
import { CicloParticipante } from '../ciclo-participantes/ciclo-participante.entity'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'
import { gerarEnviosClima, gerarEnviosPesquisa } from '../envios-pesquisa/envios-pesquisa.service'
import { Pesquisa } from '../pesquisas/pesquisa.entity'
import { Resposta } from '../respostas/resposta.entity'
import type { AtualizarCicloDto } from './dto/atualizar-ciclo.dto'
import type { AtualizarStatusCicloDto } from './dto/atualizar-status-ciclo.dto'
import type { CriarCicloDto } from './dto/criar-ciclo.dto'
import { CicloAvaliacao } from './ciclo-avaliacao.entity'
import { RelacionamentoAvaliacao } from './relacionamento-avaliacao.entity'

const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/

// Só avanço, nunca regressão, nunca pular etapa (mesmo padrão de pesquisas).
const TRANSICOES_VALIDAS: Record<StatusCiclo, StatusCiclo[]> = {
  rascunho: ['ativo'],
  ativo: ['encerrado'],
  encerrado: [],
}

type CodigoBloqueioAtivacao =
  | 'CICLO_SEM_PARTICIPANTES'
  | 'CICLO_SEM_PESQUISA_PUBLICADA'
  | 'CICLO_SEM_TIPO_RELACIONAMENTO'

export interface ElegibilidadeAtivacao {
  elegivel: boolean
  motivoBloqueio: string | null
  codigoBloqueio: CodigoBloqueioAtivacao | null
}

export interface ProgressoCiclo {
  total: number
  concluidos: number
  percentual: number
}

export interface CicloResposta {
  id: string
  nome: string
  descricao: string | null
  dataInicio: string
  dataFim: string
  status: StatusCiclo
  anonimizarRespostasPares: boolean
  minimoRespostasPares: number
  tiposRelacionamentoGerados: TipoRelacionamento[]
  elegibilidadeAtivacao: ElegibilidadeAtivacao
  progresso: ProgressoCiclo
  criadoPor: string | null
  criadoEm: string
  atualizadoEm: string
}

export interface RelacionamentoResposta {
  id: string
  avaliadorId: string
  avaliadorNome: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: TipoRelacionamento
  criadoEm: string
}

function repositorio() {
  return AppDataSource.getRepository(CicloAvaliacao)
}

/**
 * Regra pura de "pode ativar" — extraída de `atualizarStatus` para ser
 * reaproveitada por `listar`/`buscarPorId` (campo computado
 * `elegibilidadeAtivacao`) sem duplicar mensagens/códigos de erro. Só avalia
 * ciclos em rascunho; para os demais, `elegivel: false` sem motivo (não há
 * transição de ativação a considerar).
 */
export function avaliarElegibilidadeAtivacao(
  ciclo: CicloAvaliacao,
  totalParticipantes: number,
  pesquisaPublicada: Pesquisa | null,
): ElegibilidadeAtivacao {
  if (ciclo.status !== 'rascunho') {
    return { elegivel: false, motivoBloqueio: null, codigoBloqueio: null }
  }

  if (totalParticipantes === 0) {
    return {
      elegivel: false,
      motivoBloqueio: 'O ciclo precisa de pelo menos um participante para ser ativado.',
      codigoBloqueio: 'CICLO_SEM_PARTICIPANTES',
    }
  }

  if (!pesquisaPublicada) {
    return {
      elegivel: false,
      motivoBloqueio: 'O ciclo precisa de uma pesquisa publicada vinculada para ser ativado.',
      codigoBloqueio: 'CICLO_SEM_PESQUISA_PUBLICADA',
    }
  }

  // Só se aplica a avaliacao_360 — clima_geral nunca gera
  // relacionamentos_avaliacao, então este campo é irrelevante para ele.
  if (pesquisaPublicada.tipo === 'avaliacao_360' && ciclo.tiposRelacionamentoGerados.length === 0) {
    return {
      elegivel: false,
      motivoBloqueio: 'O ciclo precisa de pelo menos um tipo de relacionamento selecionado para ser ativado.',
      codigoBloqueio: 'CICLO_SEM_TIPO_RELACIONAMENTO',
    }
  }

  return { elegivel: true, motivoBloqueio: null, codigoBloqueio: null }
}

function calcularPercentual(total: number, concluidos: number): number {
  return total === 0 ? 0 : Math.round((concluidos / total) * 100)
}

/**
 * Progresso de conclusão de um ÚNICO ciclo (usado por `criar`/`atualizar`/
 * `buscarPorId`/`atualizarStatus` — endpoints de ciclo isolado, sem risco de
 * N+1). Para bulk (`listar`), a mesma lógica é replicada com queries
 * agrupadas — ver comentário lá.
 *
 * `pesquisaVinculada` é a pesquisa do ciclo de QUALQUER status (usada só
 * para descobrir o tipo avaliacao_360/clima_geral) — conceito diferente de
 * "pesquisa publicada", que é o que `avaliarElegibilidadeAtivacao` precisa.
 */
async function calcularProgressoCiclo(
  cicloId: string,
  pesquisaVinculada: Pesquisa | null,
): Promise<ProgressoCiclo> {
  if (!pesquisaVinculada) return { total: 0, concluidos: 0, percentual: 0 }

  if (pesquisaVinculada.tipo === 'avaliacao_360') {
    const total = await AppDataSource.getRepository(RelacionamentoAvaliacao).count({
      where: { cicloId },
    })

    // Contagem de relacionamentos com resposta registrada — SÓ CONTAGEM,
    // nunca seleciona avaliador_id/avaliado_id/tipo_relacionamento (guard
    // rail de anonimização, ver skill backend-anonimizacao-respostas).
    const concluidos = await AppDataSource.getRepository(RelacionamentoAvaliacao)
      .createQueryBuilder('r')
      .innerJoin(EnvioPesquisa, 'envio', 'envio.relacionamento_id = r.id')
      .innerJoin(Resposta, 'resposta', 'resposta.envio_id = envio.id')
      .where('r.ciclo_id = :cicloId', { cicloId })
      .getCount()

    return { total, concluidos, percentual: calcularPercentual(total, concluidos) }
  }

  // clima_geral
  const total = await AppDataSource.getRepository(CicloParticipante).count({ where: { cicloId } })
  const concluidos = await AppDataSource.getRepository(CicloParticipante)
    .createQueryBuilder('cp')
    .where('cp.ciclo_id = :cicloId', { cicloId })
    .andWhere('cp.respondeu_em IS NOT NULL')
    .getCount()

  return { total, concluidos, percentual: calcularPercentual(total, concluidos) }
}

/**
 * Pesquisa vinculada ao ciclo, de QUALQUER status — usada só para descobrir o
 * tipo (avaliacao_360/clima_geral) ao calcular progresso. Não há unique
 * constraint em `pesquisas.ciclo_id`, então mais de uma pesquisa pode apontar
 * para o mesmo ciclo — `order: { criadoEm: 'DESC' }` garante escolha
 * determinística da mais recente. Compartilhado por `montarCicloResposta` e
 * `buscarProgresso`.
 */
async function buscarPesquisaVinculada(cicloId: string): Promise<Pesquisa | null> {
  return AppDataSource.getRepository(Pesquisa).findOne({
    where: { cicloId },
    order: { criadoEm: 'DESC' },
  })
}

/**
 * Monta a resposta completa (campos computados incluídos) de um ÚNICO
 * ciclo — usado por `criar`/`atualizar`/`buscarPorId`/`atualizarStatus`.
 */
async function montarCicloResposta(ciclo: CicloAvaliacao): Promise<CicloResposta> {
  let totalParticipantes = 0
  let pesquisaPublicada: Pesquisa | null = null

  // Só ciclos em rascunho podem ser elegíveis a ativar — evita query à toa
  // para os demais (a função de elegibilidade nem olha esses parâmetros).
  if (ciclo.status === 'rascunho') {
    ;[totalParticipantes, pesquisaPublicada] = await Promise.all([
      AppDataSource.getRepository(CicloParticipante).count({ where: { cicloId: ciclo.id } }),
      AppDataSource.getRepository(Pesquisa).findOneBy({ cicloId: ciclo.id, status: 'publicada' }),
    ])
  }

  const elegibilidadeAtivacao = avaliarElegibilidadeAtivacao(ciclo, totalParticipantes, pesquisaPublicada)

  const pesquisaVinculada = await buscarPesquisaVinculada(ciclo.id)
  const progresso = await calcularProgressoCiclo(ciclo.id, pesquisaVinculada)

  return mapearCiclo(ciclo, elegibilidadeAtivacao, progresso)
}

function mapearCiclo(
  ciclo: CicloAvaliacao,
  elegibilidadeAtivacao: ElegibilidadeAtivacao,
  progresso: ProgressoCiclo,
): CicloResposta {
  return {
    id: ciclo.id,
    nome: ciclo.nome,
    descricao: ciclo.descricao,
    dataInicio: ciclo.dataInicio,
    dataFim: ciclo.dataFim,
    status: ciclo.status,
    anonimizarRespostasPares: ciclo.anonimizarRespostasPares,
    minimoRespostasPares: ciclo.minimoRespostasPares,
    tiposRelacionamentoGerados: ciclo.tiposRelacionamentoGerados,
    elegibilidadeAtivacao,
    progresso,
    criadoPor: ciclo.criadoPor,
    criadoEm: ciclo.criadoEm.toISOString(),
    atualizadoEm: ciclo.atualizadoEm.toISOString(),
  }
}

function validarData(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !REGEX_DATA.test(valor.trim())) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', `Campo "${campo}" deve ser uma data "YYYY-MM-DD".`)
  }

  const texto = valor.trim()
  const data = new Date(`${texto}T00:00:00Z`)

  if (Number.isNaN(data.getTime())) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', `Campo "${campo}" não é uma data de calendário válida.`)
  }

  return texto
}

function validarMinimoRespostasPares(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1) {
    throw new ErroHttp(
      422,
      'CAMPO_INVALIDO',
      'Campo "minimoRespostasPares" deve ser um número inteiro maior ou igual a 1.',
    )
  }
  return valor
}

/**
 * Busca crua (sem `garantirPapel`) — helper interno reaproveitado por
 * `ciclo-participantes.service.ts`, que já checa o papel antes de chamar.
 */
export async function buscarCicloOuFalhar(id: string): Promise<CicloAvaliacao> {
  const ciclo = await repositorio().findOneBy({ id })
  if (!ciclo) {
    throw new ErroHttp(404, 'CICLO_NAO_ENCONTRADO', 'Ciclo de avaliação não encontrado.')
  }
  return ciclo
}

/** Reaproveitado por `ciclo-participantes.service.ts`. */
export function garantirCicloEditavel(ciclo: CicloAvaliacao): void {
  if (ciclo.status !== 'rascunho') {
    throw new ErroHttp(
      409,
      'CICLO_NAO_EDITAVEL',
      'Só é possível alterar um ciclo (ou seus participantes) em rascunho.',
    )
  }
}

export async function criar(
  ator: ColaboradorAutenticado,
  dto: CriarCicloDto,
): Promise<CicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const nome = validarTextoObrigatorio(dto.nome, { campo: 'nome', min: 2, max: 255 })

  const descricao =
    dto.descricao !== undefined
      ? validarTextoObrigatorio(dto.descricao, { campo: 'descricao', min: 1, max: 2000 })
      : null

  const dataInicio = validarData(dto.dataInicio, 'dataInicio')
  const dataFim = validarData(dto.dataFim, 'dataFim')

  if (dataFim < dataInicio) {
    throw new ErroHttp(
      422,
      'DATAS_CICLO_INVALIDAS',
      'Campo "dataFim" deve ser maior ou igual a "dataInicio".',
    )
  }

  const anonimizarRespostasPares =
    dto.anonimizarRespostasPares !== undefined ? Boolean(dto.anonimizarRespostasPares) : true

  const minimoRespostasPares =
    dto.minimoRespostasPares !== undefined ? validarMinimoRespostasPares(dto.minimoRespostasPares) : 3

  const tiposRelacionamentoGerados =
    dto.tiposRelacionamentoGerados !== undefined
      ? validarListaEnum(
          dto.tiposRelacionamentoGerados,
          TIPO_RELACIONAMENTO_GERACAO_VALORES,
          'tiposRelacionamentoGerados',
        )
      : [...TIPO_RELACIONAMENTO_GERACAO_VALORES]

  const novo = repositorio().create({
    nome,
    descricao,
    dataInicio,
    dataFim,
    status: 'rascunho',
    anonimizarRespostasPares,
    minimoRespostasPares,
    tiposRelacionamentoGerados,
    criadoPor: ator.id,
  })

  const salvo = await repositorio().save(novo)

  return montarCicloResposta(salvo)
}

export async function listar(ator: ColaboradorAutenticado): Promise<CicloResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ciclos = await repositorio().find({ order: { criadoEm: 'DESC' } })

  if (ciclos.length === 0) return []

  const todosIds = ciclos.map((c) => c.id)
  const idsRascunho = ciclos.filter((c) => c.status === 'rascunho').map((c) => c.id)

  // --- Elegibilidade de ativação — só ciclos em rascunho precisam de dado
  // real (os demais retornam elegivel:false direto, sem consultar os mapas).
  const totalParticipantesPorCiclo = new Map<string, number>()
  const pesquisaPublicadaPorCiclo = new Map<string, Pesquisa>()

  if (idsRascunho.length > 0) {
    const linhasParticipantes = await AppDataSource.getRepository(CicloParticipante)
      .createQueryBuilder('cp')
      .select('cp.ciclo_id', 'cicloId')
      .addSelect('COUNT(*)', 'total')
      .where('cp.ciclo_id IN (:...ids)', { ids: idsRascunho })
      .groupBy('cp.ciclo_id')
      .getRawMany<{ cicloId: string; total: string }>()

    for (const linha of linhasParticipantes) {
      totalParticipantesPorCiclo.set(linha.cicloId, Number(linha.total))
    }

    const pesquisasPublicadas = await AppDataSource.getRepository(Pesquisa).find({
      where: { cicloId: In(idsRascunho), status: 'publicada' },
    })

    for (const pesquisa of pesquisasPublicadas) {
      if (pesquisa.cicloId) pesquisaPublicadaPorCiclo.set(pesquisa.cicloId, pesquisa)
    }
  }

  // --- Progresso — calculado para TODOS os ciclos, independente de status.
  // Pesquisa vinculada de QUALQUER status (conceito diferente de
  // `pesquisaPublicadaPorCiclo` acima, que é só para elegibilidade de
  // ativação) — usada só para descobrir o tipo (avaliacao_360/clima_geral).
  // Não há unique constraint em `pesquisas.ciclo_id`, então mais de uma
  // pesquisa pode apontar para o mesmo ciclo — `order: { criadoEm: 'DESC' }`
  // garante que a lista venha ordenada da mais recente para a mais antiga
  // por ciclo; o "só sobrescreve se ainda não tiver essa chave" abaixo então
  // mantém sempre a mais recente (mesmo critério do single-item em
  // `montarCicloResposta`).
  const pesquisasVinculadas = await AppDataSource.getRepository(Pesquisa).find({
    where: { cicloId: In(todosIds) },
    order: { criadoEm: 'DESC' },
  })

  const pesquisaVinculadaPorCiclo = new Map<string, Pesquisa>()
  for (const pesquisa of pesquisasVinculadas) {
    if (pesquisa.cicloId && !pesquisaVinculadaPorCiclo.has(pesquisa.cicloId)) {
      pesquisaVinculadaPorCiclo.set(pesquisa.cicloId, pesquisa)
    }
  }

  const idsAval360 = todosIds.filter((id) => pesquisaVinculadaPorCiclo.get(id)?.tipo === 'avaliacao_360')
  const idsClima = todosIds.filter((id) => pesquisaVinculadaPorCiclo.get(id)?.tipo === 'clima_geral')

  const progressoPorCiclo = new Map<string, ProgressoCiclo>()

  if (idsAval360.length > 0) {
    const totalPorCiclo = new Map<string, number>()
    const concluidosPorCiclo = new Map<string, number>()

    const linhasTotal = await AppDataSource.getRepository(RelacionamentoAvaliacao)
      .createQueryBuilder('r')
      .select('r.ciclo_id', 'cicloId')
      .addSelect('COUNT(*)', 'total')
      .where('r.ciclo_id IN (:...ids)', { ids: idsAval360 })
      .groupBy('r.ciclo_id')
      .getRawMany<{ cicloId: string; total: string }>()

    for (const linha of linhasTotal) totalPorCiclo.set(linha.cicloId, Number(linha.total))

    // Só contagem — nunca seleciona avaliador_id/avaliado_id/
    // tipo_relacionamento (guard rail de anonimização, ver skill
    // backend-anonimizacao-respostas).
    const linhasConcluidos = await AppDataSource.getRepository(RelacionamentoAvaliacao)
      .createQueryBuilder('r')
      .innerJoin(EnvioPesquisa, 'envio', 'envio.relacionamento_id = r.id')
      .innerJoin(Resposta, 'resposta', 'resposta.envio_id = envio.id')
      .select('r.ciclo_id', 'cicloId')
      .addSelect('COUNT(*)', 'total')
      .where('r.ciclo_id IN (:...ids)', { ids: idsAval360 })
      .groupBy('r.ciclo_id')
      .getRawMany<{ cicloId: string; total: string }>()

    for (const linha of linhasConcluidos) concluidosPorCiclo.set(linha.cicloId, Number(linha.total))

    for (const id of idsAval360) {
      const total = totalPorCiclo.get(id) ?? 0
      const concluidos = concluidosPorCiclo.get(id) ?? 0
      progressoPorCiclo.set(id, { total, concluidos, percentual: calcularPercentual(total, concluidos) })
    }
  }

  if (idsClima.length > 0) {
    const linhas = await AppDataSource.getRepository(CicloParticipante)
      .createQueryBuilder('cp')
      .select('cp.ciclo_id', 'cicloId')
      .addSelect('COUNT(*)', 'total')
      .addSelect('COUNT(cp.respondeu_em)', 'concluidos')
      .where('cp.ciclo_id IN (:...ids)', { ids: idsClima })
      .groupBy('cp.ciclo_id')
      .getRawMany<{ cicloId: string; total: string; concluidos: string }>()

    for (const linha of linhas) {
      const total = Number(linha.total)
      const concluidos = Number(linha.concluidos)
      progressoPorCiclo.set(linha.cicloId, {
        total,
        concluidos,
        percentual: calcularPercentual(total, concluidos),
      })
    }
  }

  return ciclos.map((ciclo) => {
    const elegibilidadeAtivacao = avaliarElegibilidadeAtivacao(
      ciclo,
      totalParticipantesPorCiclo.get(ciclo.id) ?? 0,
      pesquisaPublicadaPorCiclo.get(ciclo.id) ?? null,
    )
    const progresso = progressoPorCiclo.get(ciclo.id) ?? { total: 0, concluidos: 0, percentual: 0 }
    return mapearCiclo(ciclo, elegibilidadeAtivacao, progresso)
  })
}

export async function buscarPorId(
  ator: ColaboradorAutenticado,
  id: string,
): Promise<CicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ciclo = await buscarCicloOuFalhar(id)

  return montarCicloResposta(ciclo)
}

/**
 * Versão leve de `buscarPorId` — só o progresso, para polling do frontend
 * (ex.: a cada 30s) sem pagar o custo de montar `CicloResposta` completa
 * (elegibilidade de ativação etc). Reaproveita `calcularProgressoCiclo`, a
 * mesma função usada por `montarCicloResposta`/`listar()` — sem duplicar a
 * lógica de contagem.
 */
export async function buscarProgresso(
  ator: ColaboradorAutenticado,
  id: string,
): Promise<ProgressoCiclo> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(id)

  const pesquisaVinculada = await buscarPesquisaVinculada(id)
  return calcularProgressoCiclo(id, pesquisaVinculada)
}

export async function atualizar(
  ator: ColaboradorAutenticado,
  id: string,
  dto: AtualizarCicloDto,
): Promise<CicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ciclo = await buscarCicloOuFalhar(id)
  garantirCicloEditavel(ciclo)

  if (dto.nome !== undefined) {
    ciclo.nome = validarTextoObrigatorio(dto.nome, { campo: 'nome', min: 2, max: 255 })
  }

  if ('descricao' in dto) {
    ciclo.descricao =
      dto.descricao === null
        ? null
        : validarTextoObrigatorio(dto.descricao, { campo: 'descricao', min: 1, max: 2000 })
  }

  if (dto.dataInicio !== undefined) {
    ciclo.dataInicio = validarData(dto.dataInicio, 'dataInicio')
  }

  if (dto.dataFim !== undefined) {
    ciclo.dataFim = validarData(dto.dataFim, 'dataFim')
  }

  if (ciclo.dataFim < ciclo.dataInicio) {
    throw new ErroHttp(
      422,
      'DATAS_CICLO_INVALIDAS',
      'Campo "dataFim" deve ser maior ou igual a "dataInicio".',
    )
  }

  if (dto.anonimizarRespostasPares !== undefined) {
    ciclo.anonimizarRespostasPares = Boolean(dto.anonimizarRespostasPares)
  }

  if (dto.minimoRespostasPares !== undefined) {
    ciclo.minimoRespostasPares = validarMinimoRespostasPares(dto.minimoRespostasPares)
  }

  if (dto.tiposRelacionamentoGerados !== undefined) {
    ciclo.tiposRelacionamentoGerados = validarListaEnum(
      dto.tiposRelacionamentoGerados,
      TIPO_RELACIONAMENTO_GERACAO_VALORES,
      'tiposRelacionamentoGerados',
    )
  }

  const salvo = await repositorio().save(ciclo)

  return montarCicloResposta(salvo)
}

export async function remover(ator: ColaboradorAutenticado, id: string): Promise<void> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ciclo = await buscarCicloOuFalhar(id)

  if (ciclo.status !== 'rascunho') {
    throw new ErroHttp(409, 'CICLO_NAO_REMOVIVEL', 'Só é possível remover ciclos em rascunho.')
  }

  // DELETE físico: ON DELETE CASCADE cobre ciclo_participantes/
  // relacionamentos_avaliacao; pesquisas.ciclo_id vai a NULL (ON DELETE SET NULL).
  await repositorio().delete({ id })
}

/**
 * Gera `relacionamentos_avaliacao` a partir dos participantes do ciclo,
 * respeitando `tiposHabilitados` (`ciclo.tiposRelacionamentoGerados`) — só
 * insere linhas dos tipos presentes na lista. Função interna — nunca exposta
 * como rota própria, só usada por `atualizarStatus` dentro da transação de
 * ativação. Nunca gera `tipo_relacionamento = 'externo'` (reservado para
 * avaliador convidado manualmente, fora do escopo deste motor).
 */
async function gerarRelacionamentos(
  manager: EntityManager,
  cicloId: string,
  tiposHabilitados: TipoRelacionamento[],
): Promise<void> {
  const participantes = await manager.getRepository(CicloParticipante).find({ where: { cicloId } })
  const participanteIds = participantes.map((p) => p.colaboradorId)

  if (participanteIds.length === 0) return

  const colaboradores = await manager.getRepository(Colaborador).find({
    where: { id: In(participanteIds) },
  })

  // Participantes agrupados por gestorId — usado para "subordinado".
  const participantesPorGestor = new Map<string, Colaborador[]>()
  for (const c of colaboradores) {
    if (!c.gestorId) continue
    const lista = participantesPorGestor.get(c.gestorId) ?? []
    lista.push(c)
    participantesPorGestor.set(c.gestorId, lista)
  }

  // Participantes agrupados por equipeId — usado para "pares".
  const participantesPorEquipe = new Map<string, Colaborador[]>()
  for (const c of colaboradores) {
    if (!c.equipeId) continue
    const lista = participantesPorEquipe.get(c.equipeId) ?? []
    lista.push(c)
    participantesPorEquipe.set(c.equipeId, lista)
  }

  const linhas: { avaliadorId: string; avaliadoId: string; tipoRelacionamento: TipoRelacionamento }[] =
    []

  for (const p of colaboradores) {
    // autoavaliacao: sempre, se habilitada para este ciclo.
    if (tiposHabilitados.includes('autoavaliacao')) {
      linhas.push({ avaliadorId: p.id, avaliadoId: p.id, tipoRelacionamento: 'autoavaliacao' })
    }

    // gestor: o gestor de p avalia p, MESMO que o gestor não seja participante
    // (gestorId, se preenchido, sempre existe em `colaboradores` — FK garante).
    if (tiposHabilitados.includes('gestor') && p.gestorId) {
      linhas.push({ avaliadorId: p.gestorId, avaliadoId: p.id, tipoRelacionamento: 'gestor' })
    }

    // subordinado: participantes cujo gestorId === p.id avaliam p.
    if (tiposHabilitados.includes('subordinado')) {
      for (const subordinado of participantesPorGestor.get(p.id) ?? []) {
        linhas.push({ avaliadorId: subordinado.id, avaliadoId: p.id, tipoRelacionamento: 'subordinado' })
      }
    }

    // pares: participantes com o MESMO equipeId de p (excluindo p) avaliam p.
    // Participante sem equipeId simplesmente não entra aqui (skip silencioso).
    if (tiposHabilitados.includes('pares') && p.equipeId) {
      for (const par of participantesPorEquipe.get(p.equipeId) ?? []) {
        if (par.id !== p.id) {
          linhas.push({ avaliadorId: par.id, avaliadoId: p.id, tipoRelacionamento: 'pares' })
        }
      }
    }
  }

  if (linhas.length === 0) return

  await manager
    .createQueryBuilder()
    .insert()
    .into(RelacionamentoAvaliacao)
    .values(linhas.map((l) => ({ cicloId, ...l })))
    .orIgnore() // idempotência — nunca duplica sob retry/corrida.
    .execute()
}

export async function atualizarStatus(
  ator: ColaboradorAutenticado,
  id: string,
  dto: AtualizarStatusCicloDto,
): Promise<CicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ciclo = await buscarCicloOuFalhar(id)
  const novoStatus = validarEnum(dto.status, STATUS_CICLO_VALORES, 'status')

  const transicoesPermitidas = TRANSICOES_VALIDAS[ciclo.status]
  if (!transicoesPermitidas.includes(novoStatus)) {
    throw new ErroHttp(
      409,
      'TRANSICAO_STATUS_INVALIDA',
      `Não é possível transicionar de "${ciclo.status}" para "${novoStatus}".`,
    )
  }

  if (ciclo.status === 'rascunho' && novoStatus === 'ativo') {
    const totalParticipantes = await AppDataSource.getRepository(CicloParticipante).count({
      where: { cicloId: ciclo.id },
    })

    const pesquisaPublicada = await AppDataSource.getRepository(Pesquisa).findOneBy({
      cicloId: ciclo.id,
      status: 'publicada',
    })

    const elegibilidade = avaliarElegibilidadeAtivacao(ciclo, totalParticipantes, pesquisaPublicada)
    if (!elegibilidade.elegivel) {
      throw new ErroHttp(422, elegibilidade.codigoBloqueio!, elegibilidade.motivoBloqueio!)
    }

    // pesquisaPublicada é garantidamente não-nulo aqui — do contrário
    // `elegibilidade.elegivel` teria sido `false` acima.
    const pesquisaAtiva = pesquisaPublicada!

    const salvo = await AppDataSource.transaction(async (manager) => {
      if (pesquisaAtiva.tipo === 'avaliacao_360') {
        await gerarRelacionamentos(manager, ciclo.id, ciclo.tiposRelacionamentoGerados)
        await gerarEnviosPesquisa(manager, ciclo.id, pesquisaAtiva.id)
      } else {
        // clima_geral: NUNCA gera relacionamentos_avaliacao — guard rail de
        // anonimização (essa tabela é exclusiva do motor de avaliacao_360 e
        // da regra de pares/subordinado, que não existe para clima).
        await gerarEnviosClima(manager, ciclo.id, pesquisaAtiva.id)
      }

      ciclo.status = novoStatus
      return manager.getRepository(CicloAvaliacao).save(ciclo)
    })

    return montarCicloResposta(salvo)
  }

  // ativo → encerrado: sem pré-condição nesta task (envios_pesquisa/respostas
  // ainda não existem para checar "todo mundo respondeu" — fora de escopo).
  ciclo.status = novoStatus
  const salvo = await repositorio().save(ciclo)

  return montarCicloResposta(salvo)
}

export async function listarRelacionamentos(
  ator: ColaboradorAutenticado,
  id: string,
): Promise<RelacionamentoResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(id)

  // Visão IDENTIFICADA de quem avalia quem — restrita a admin/gestor_rh pelo
  // garantirPapel acima, nunca acessível a `colaborador`.
  const linhas = await AppDataSource.getRepository(RelacionamentoAvaliacao)
    .createQueryBuilder('r')
    .innerJoin(Colaborador, 'avaliador', 'avaliador.id = r.avaliador_id')
    .innerJoin(Colaborador, 'avaliado', 'avaliado.id = r.avaliado_id')
    .select('r.id', 'id')
    .addSelect('r.avaliador_id', 'avaliadorId')
    .addSelect('avaliador.nome_completo', 'avaliadorNome')
    .addSelect('r.avaliado_id', 'avaliadoId')
    .addSelect('avaliado.nome_completo', 'avaliadoNome')
    .addSelect('r.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect('r.criado_em', 'criadoEm')
    .where('r.ciclo_id = :cicloId', { cicloId: id })
    .orderBy('r.criado_em', 'ASC')
    .getRawMany<{
      id: string
      avaliadorId: string
      avaliadorNome: string
      avaliadoId: string
      avaliadoNome: string
      tipoRelacionamento: TipoRelacionamento
      criadoEm: Date
    }>()

  return linhas.map((linha) => ({
    id: linha.id,
    avaliadorId: linha.avaliadorId,
    avaliadorNome: linha.avaliadorNome,
    avaliadoId: linha.avaliadoId,
    avaliadoNome: linha.avaliadoNome,
    tipoRelacionamento: linha.tipoRelacionamento,
    criadoEm: new Date(linha.criadoEm).toISOString(),
  }))
}
