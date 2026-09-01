import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { ErroHttp } from '../../common/erro-http'
import { validarTextoObrigatorio } from '../../common/validacao'
import type { ColaboradorAutenticado } from '../../types/express'
import type { AtualizarEquipeDto } from './dto/atualizar-equipe.dto'
import type { CriarEquipeDto } from './dto/criar-equipe.dto'
import { Equipe } from './equipe.entity'

const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

export interface EquipeResposta {
  id: string
  nome: string
  criadoEm: string
  atualizadoEm: string
}

function mapearEquipe(equipe: Equipe): EquipeResposta {
  return {
    id: equipe.id,
    nome: equipe.nome,
    criadoEm: equipe.criadoEm.toISOString(),
    atualizadoEm: equipe.atualizadoEm.toISOString(),
  }
}

function repositorio() {
  return AppDataSource.getRepository(Equipe)
}

export async function criar(
  ator: ColaboradorAutenticado,
  dto: CriarEquipeDto,
): Promise<EquipeResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const nome = validarTextoObrigatorio(dto.nome, { campo: 'nome', min: 2, max: 255 })

  const equipe = repositorio().create({ nome })
  const salva = await repositorio().save(equipe)

  return mapearEquipe(salva)
}

export async function listar(ator: ColaboradorAutenticado): Promise<EquipeResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const equipes = await repositorio().find()

  return equipes.map(mapearEquipe)
}

export async function buscarPorId(
  ator: ColaboradorAutenticado,
  id: string,
): Promise<EquipeResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const equipe = await repositorio().findOneBy({ id })

  if (!equipe) {
    throw new ErroHttp(404, 'EQUIPE_NAO_ENCONTRADA', 'Equipe não encontrada.')
  }

  return mapearEquipe(equipe)
}

export async function atualizar(
  ator: ColaboradorAutenticado,
  id: string,
  dto: AtualizarEquipeDto,
): Promise<EquipeResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const equipe = await repositorio().findOneBy({ id })

  if (!equipe) {
    throw new ErroHttp(404, 'EQUIPE_NAO_ENCONTRADA', 'Equipe não encontrada.')
  }

  equipe.nome = validarTextoObrigatorio(dto.nome, { campo: 'nome', min: 2, max: 255 })

  const salva = await repositorio().save(equipe)

  return mapearEquipe(salva)
}

export async function remover(ator: ColaboradorAutenticado, id: string): Promise<void> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const equipe = await repositorio().findOneBy({ id })

  if (!equipe) {
    throw new ErroHttp(404, 'EQUIPE_NAO_ENCONTRADA', 'Equipe não encontrada.')
  }

  // DELETE físico: ON DELETE SET NULL em colaboradores.equipe_id já cobre a
  // integridade (ver decisão assumida 9 do plano).
  await repositorio().delete({ id })
}
