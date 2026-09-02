import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { ErroHttp } from '../../common/erro-http'
import type { ColaboradorAutenticado } from '../../types/express'
import { buscarCicloOuFalhar, garantirCicloEditavel } from '../ciclos-avaliacao/ciclos-avaliacao.service'
import { Colaborador } from '../colaboradores/colaborador.entity'
import { Equipe } from '../equipes/equipe.entity'
import type { AdicionarParticipantesPorEquipeDto } from './dto/adicionar-participantes-por-equipe.dto'
import type { AdicionarParticipantesDto } from './dto/adicionar-participantes.dto'
import { CicloParticipante } from './ciclo-participante.entity'

const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

export interface ParticipanteResposta {
  id: string
  colaboradorId: string
  nomeCompleto: string
  email: string
  cargo: string | null
  equipe: { id: string; nome: string } | null
}

function repositorio() {
  return AppDataSource.getRepository(CicloParticipante)
}

function mapearParticipante(participante: CicloParticipante): ParticipanteResposta {
  const colaborador = participante.colaborador
  return {
    id: participante.id,
    colaboradorId: participante.colaboradorId,
    nomeCompleto: colaborador.nomeCompleto,
    email: colaborador.email,
    cargo: colaborador.cargo,
    equipe: colaborador.equipe ? { id: colaborador.equipe.id, nome: colaborador.equipe.nome } : null,
  }
}

export async function listar(
  ator: ColaboradorAutenticado,
  cicloId: string,
): Promise<ParticipanteResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(cicloId)

  const participantes = await repositorio().find({
    where: { cicloId },
    relations: { colaborador: { equipe: true } },
    order: { colaborador: { nomeCompleto: 'ASC' } },
  })

  return participantes.map(mapearParticipante)
}

export async function adicionarIndividual(
  ator: ColaboradorAutenticado,
  cicloId: string,
  dto: AdicionarParticipantesDto,
): Promise<ParticipanteResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ciclo = await buscarCicloOuFalhar(cicloId)
  garantirCicloEditavel(ciclo)

  const colaboradorIds = dto.colaboradorIds
  if (!Array.isArray(colaboradorIds) || colaboradorIds.length === 0) {
    throw new ErroHttp(
      422,
      'CAMPO_INVALIDO',
      'Campo "colaboradorIds" deve ser um array não vazio de UUIDs.',
    )
  }
  if (!colaboradorIds.every((id) => typeof id === 'string' && id.length > 0)) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "colaboradorIds" deve conter apenas strings.')
  }

  const colaboradores = await AppDataSource.getRepository(Colaborador).find({
    where: { id: In(colaboradorIds) },
  })

  const colaboradoresPorId = new Map(colaboradores.map((c) => [c.id, c]))
  const idAusente = colaboradorIds.find((id) => !colaboradoresPorId.has(id))
  if (idAusente) {
    throw new ErroHttp(404, 'COLABORADOR_NAO_ENCONTRADO', 'Colaborador não encontrado.')
  }

  const inativo = colaboradores.find((c) => !c.ativo)
  if (inativo) {
    throw new ErroHttp(
      422,
      'COLABORADOR_INATIVO',
      'Só é possível adicionar colaboradores ativos como participantes.',
    )
  }

  const existentes = await repositorio().find({ where: { cicloId } })
  const idsExistentes = new Set(existentes.map((p) => p.colaboradorId))

  const novosIds = colaboradorIds.filter((id) => !idsExistentes.has(id))

  if (novosIds.length > 0) {
    await repositorio().save(novosIds.map((colaboradorId) => repositorio().create({ cicloId, colaboradorId })))
  }

  return listar(ator, cicloId)
}

export async function adicionarPorEquipe(
  ator: ColaboradorAutenticado,
  cicloId: string,
  dto: AdicionarParticipantesPorEquipeDto,
): Promise<ParticipanteResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ciclo = await buscarCicloOuFalhar(cicloId)
  garantirCicloEditavel(ciclo)

  if (typeof dto.equipeId !== 'string' || dto.equipeId.length === 0) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "equipeId" deve ser um UUID válido.')
  }

  const equipe = await AppDataSource.getRepository(Equipe).findOneBy({ id: dto.equipeId })
  if (!equipe) {
    throw new ErroHttp(404, 'EQUIPE_NAO_ENCONTRADA', 'Equipe não encontrada.')
  }

  const colaboradoresDaEquipe = await AppDataSource.getRepository(Colaborador).find({
    where: { equipeId: equipe.id, ativo: true },
  })

  const existentes = await repositorio().find({ where: { cicloId } })
  const idsExistentes = new Set(existentes.map((p) => p.colaboradorId))

  const novos = colaboradoresDaEquipe.filter((c) => !idsExistentes.has(c.id))

  // Equipe sem colaboradores ativos (ou já todos participantes) não é erro —
  // retorna a lista inalterada (decisão assumida 11 do plano).
  if (novos.length > 0) {
    await repositorio().save(
      novos.map((c) => repositorio().create({ cicloId, colaboradorId: c.id })),
    )
  }

  return listar(ator, cicloId)
}

export async function remover(
  ator: ColaboradorAutenticado,
  cicloId: string,
  colaboradorId: string,
): Promise<void> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ciclo = await buscarCicloOuFalhar(cicloId)
  garantirCicloEditavel(ciclo)

  const resultado = await repositorio().delete({ cicloId, colaboradorId })

  if (!resultado.affected) {
    throw new ErroHttp(404, 'PARTICIPANTE_NAO_ENCONTRADO', 'Participante não encontrado no ciclo.')
  }
}
