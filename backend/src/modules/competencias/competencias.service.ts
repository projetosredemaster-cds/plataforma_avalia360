import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import type { ColaboradorAutenticado } from '../../types/express'
import { Competencia } from './competencia.entity'

const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

export interface CompetenciaResposta {
  id: string
  nome: string
  descricao: string | null
}

function mapearCompetencia(competencia: Competencia): CompetenciaResposta {
  return {
    id: competencia.id,
    nome: competencia.nome,
    descricao: competencia.descricao,
  }
}

function repositorio() {
  return AppDataSource.getRepository(Competencia)
}

export async function listar(ator: ColaboradorAutenticado): Promise<CompetenciaResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const competencias = await repositorio().find({ order: { nome: 'ASC' } })

  return competencias.map(mapearCompetencia)
}
