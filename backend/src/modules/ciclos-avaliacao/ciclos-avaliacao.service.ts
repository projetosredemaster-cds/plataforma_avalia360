import { In, type EntityManager } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { STATUS_CICLO_VALORES, type StatusCiclo, type TipoRelacionamento } from '../../common/enums'
import { ErroHttp } from '../../common/erro-http'
import { validarEnum, validarTextoObrigatorio } from '../../common/validacao'
import type { ColaboradorAutenticado } from '../../types/express'
import { Colaborador } from '../colaboradores/colaborador.entity'
import { CicloParticipante } from '../ciclo-participantes/ciclo-participante.entity'
import { gerarEnviosClima, gerarEnviosPesquisa } from '../envios-pesquisa/envios-pesquisa.service'
import { Pesquisa } from '../pesquisas/pesquisa.entity'
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

export interface CicloResposta {
  id: string
  nome: string
  descricao: string | null
  dataInicio: string
  dataFim: string
  status: StatusCiclo
  anonimizarRespostasPares: boolean
  minimoRespostasPares: number
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

function mapearCiclo(ciclo: CicloAvaliacao): CicloResposta {
  return {
    id: ciclo.id,
    nome: ciclo.nome,
    descricao: ciclo.descricao,
    dataInicio: ciclo.dataInicio,
    dataFim: ciclo.dataFim,
    status: ciclo.status,
    anonimizarRespostasPares: ciclo.anonimizarRespostasPares,
    minimoRespostasPares: ciclo.minimoRespostasPares,
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

  const novo = repositorio().create({
    nome,
    descricao,
    dataInicio,
    dataFim,
    status: 'rascunho',
    anonimizarRespostasPares,
    minimoRespostasPares,
    criadoPor: ator.id,
  })

  const salvo = await repositorio().save(novo)

  return mapearCiclo(salvo)
}

export async function listar(ator: ColaboradorAutenticado): Promise<CicloResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ciclos = await repositorio().find({ order: { criadoEm: 'DESC' } })

  return ciclos.map(mapearCiclo)
}

export async function buscarPorId(
  ator: ColaboradorAutenticado,
  id: string,
): Promise<CicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ciclo = await buscarCicloOuFalhar(id)

  return mapearCiclo(ciclo)
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

  const salvo = await repositorio().save(ciclo)

  return mapearCiclo(salvo)
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
 * Gera `relacionamentos_avaliacao` a partir dos participantes do ciclo.
 * Função interna — nunca exposta como rota própria, só usada por
 * `atualizarStatus` dentro da transação de ativação. Nunca gera
 * `tipo_relacionamento = 'externo'` (reservado para avaliador convidado
 * manualmente, fora do escopo deste motor).
 */
async function gerarRelacionamentos(manager: EntityManager, cicloId: string): Promise<void> {
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
    // autoavaliacao: sempre.
    linhas.push({ avaliadorId: p.id, avaliadoId: p.id, tipoRelacionamento: 'autoavaliacao' })

    // gestor: o gestor de p avalia p, MESMO que o gestor não seja participante
    // (gestorId, se preenchido, sempre existe em `colaboradores` — FK garante).
    if (p.gestorId) {
      linhas.push({ avaliadorId: p.gestorId, avaliadoId: p.id, tipoRelacionamento: 'gestor' })
    }

    // subordinado: participantes cujo gestorId === p.id avaliam p.
    for (const subordinado of participantesPorGestor.get(p.id) ?? []) {
      linhas.push({ avaliadorId: subordinado.id, avaliadoId: p.id, tipoRelacionamento: 'subordinado' })
    }

    // pares: participantes com o MESMO equipeId de p (excluindo p) avaliam p.
    // Participante sem equipeId simplesmente não entra aqui (skip silencioso).
    if (p.equipeId) {
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

    if (totalParticipantes === 0) {
      throw new ErroHttp(
        422,
        'CICLO_SEM_PARTICIPANTES',
        'O ciclo precisa de pelo menos um participante para ser ativado.',
      )
    }

    const pesquisaPublicada = await AppDataSource.getRepository(Pesquisa).findOneBy({
      cicloId: ciclo.id,
      status: 'publicada',
    })

    if (!pesquisaPublicada) {
      throw new ErroHttp(
        422,
        'CICLO_SEM_PESQUISA_PUBLICADA',
        'O ciclo precisa de uma pesquisa publicada vinculada para ser ativado.',
      )
    }

    const salvo = await AppDataSource.transaction(async (manager) => {
      if (pesquisaPublicada.tipo === 'avaliacao_360') {
        await gerarRelacionamentos(manager, ciclo.id)
        await gerarEnviosPesquisa(manager, ciclo.id, pesquisaPublicada.id)
      } else {
        // clima_geral: NUNCA gera relacionamentos_avaliacao — guard rail de
        // anonimização (essa tabela é exclusiva do motor de avaliacao_360 e
        // da regra de pares/subordinado, que não existe para clima).
        await gerarEnviosClima(manager, ciclo.id, pesquisaPublicada.id)
      }

      ciclo.status = novoStatus
      return manager.getRepository(CicloAvaliacao).save(ciclo)
    })

    return mapearCiclo(salvo)
  }

  // ativo → encerrado: sem pré-condição nesta task (envios_pesquisa/respostas
  // ainda não existem para checar "todo mundo respondeu" — fora de escopo).
  ciclo.status = novoStatus
  const salvo = await repositorio().save(ciclo)

  return mapearCiclo(salvo)
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
