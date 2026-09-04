import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { ErroHttp } from '../../common/erro-http'
import { validarTextoObrigatorio } from '../../common/validacao'
import type { ColaboradorAutenticado } from '../../types/express'
import { Colaborador } from '../colaboradores/colaborador.entity'
import type { AtualizarEquipeDto } from './dto/atualizar-equipe.dto'
import type { CriarEquipeDto } from './dto/criar-equipe.dto'
import type { VincularColaboradoresEquipeDto } from './dto/vincular-colaboradores-equipe.dto'
import { Equipe } from './equipe.entity'

const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

export interface EquipeResposta {
  id: string
  nome: string
  criadoEm: string
  /**
   * Conta TODOS os colaboradores com equipe_id = id, independente de
   * `ativo` — usado pelo frontend para desabilitar o botão de excluir na
   * listagem sem round-trip extra por linha.
   */
  totalColaboradores: number
}

export interface ColaboradorDaEquipeResposta {
  id: string
  nomeCompleto: string
  cargo: string | null
  ativo: boolean
}

function mapearEquipe(equipe: Equipe, totalColaboradores: number): EquipeResposta {
  return {
    id: equipe.id,
    nome: equipe.nome,
    criadoEm: equipe.criadoEm.toISOString(),
    totalColaboradores,
  }
}

function mapearColaboradorDaEquipe(colaborador: Colaborador): ColaboradorDaEquipeResposta {
  return {
    id: colaborador.id,
    nomeCompleto: colaborador.nomeCompleto,
    cargo: colaborador.cargo,
    ativo: colaborador.ativo,
  }
}

function repositorio() {
  return AppDataSource.getRepository(Equipe)
}

function repositorioColaborador() {
  return AppDataSource.getRepository(Colaborador)
}

/**
 * Conta os colaboradores de CADA equipe (independente de `ativo`) em uma
 * única query — usada por `listar()` para evitar 1 count por equipe (N+1).
 * Agregação feita em memória (não `GROUP BY` no Postgres) de propósito: o
 * `FakeRepository` usado pelos testes deste módulo só implementa
 * find/findOne/findOneBy/save/delete/count (sem um emulador de query
 * builder) — mesmo assim continua sendo 1 única query, não 1 por equipe.
 * Revisitar com `GROUP BY` via `createQueryBuilder` se o volume de
 * colaboradores algum dia justificar mover a agregação para o banco.
 */
async function contarColaboradoresPorEquipe(): Promise<Map<string, number>> {
  const colaboradores = await repositorioColaborador().find()

  const contagem = new Map<string, number>()
  for (const colaborador of colaboradores) {
    if (!colaborador.equipeId) continue
    contagem.set(colaborador.equipeId, (contagem.get(colaborador.equipeId) ?? 0) + 1)
  }
  return contagem
}

/** Conta colaboradores vinculados a UMA equipe — reaproveitado por buscarPorId/atualizar e remover. */
async function contarColaboradoresDaEquipe(equipeId: string): Promise<number> {
  return repositorioColaborador().count({ where: { equipeId } })
}

export async function criar(
  ator: ColaboradorAutenticado,
  dto: CriarEquipeDto,
): Promise<EquipeResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const nome = validarTextoObrigatorio(dto.nome, { campo: 'nome', min: 2, max: 255 })

  const equipe = repositorio().create({ nome })
  const salva = await repositorio().save(equipe)

  // Equipe recém-criada nunca tem colaboradores vinculados.
  return mapearEquipe(salva, 0)
}

export async function listar(ator: ColaboradorAutenticado): Promise<EquipeResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const equipes = await repositorio().find()
  const contagemPorEquipe = await contarColaboradoresPorEquipe()

  return equipes.map((equipe) => mapearEquipe(equipe, contagemPorEquipe.get(equipe.id) ?? 0))
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

  const totalColaboradores = await contarColaboradoresDaEquipe(id)

  return mapearEquipe(equipe, totalColaboradores)
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
  const totalColaboradores = await contarColaboradoresDaEquipe(id)

  return mapearEquipe(salva, totalColaboradores)
}

export async function remover(ator: ColaboradorAutenticado, id: string): Promise<void> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const equipe = await repositorio().findOneBy({ id })

  if (!equipe) {
    throw new ErroHttp(404, 'EQUIPE_NAO_ENCONTRADA', 'Equipe não encontrada.')
  }

  // Bloqueio explícito de aplicação: uma equipe com colaboradores vinculados
  // (qualquer status) não pode ser excluída — precisa ser esvaziada primeiro
  // (ver PATCH /:id/colaboradores). `colaboradores.equipe_id` tem
  // `ON DELETE SET NULL`, mas essa proteção de schema só cobriria o caso em
  // que o registro de `equipes` deixasse de existir sob o vínculo — a regra
  // de negócio exigida aqui é mais forte: nunca permitir esse DELETE
  // enquanto o vínculo existir.
  const totalColaboradores = await contarColaboradoresDaEquipe(id)
  if (totalColaboradores > 0) {
    throw new ErroHttp(
      422,
      'EQUIPE_COM_COLABORADORES_VINCULADOS',
      'Não é possível excluir uma equipe com colaboradores vinculados. Desvincule-os primeiro.',
    )
  }

  await repositorio().delete({ id })
}

export async function listarColaboradoresDaEquipe(
  ator: ColaboradorAutenticado,
  id: string,
): Promise<ColaboradorDaEquipeResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const equipe = await repositorio().findOneBy({ id })
  if (!equipe) {
    throw new ErroHttp(404, 'EQUIPE_NAO_ENCONTRADA', 'Equipe não encontrada.')
  }

  const colaboradores = await repositorioColaborador().find({
    where: { equipeId: id },
    order: { nomeCompleto: 'ASC' },
  })

  return colaboradores.map(mapearColaboradorDaEquipe)
}

function validarColaboradorIds(valor: unknown): string[] {
  if (!Array.isArray(valor) || !valor.every((v) => typeof v === 'string' && v.trim().length > 0)) {
    throw new ErroHttp(
      422,
      'CAMPO_INVALIDO',
      'Campo "colaboradorIds" deve ser um array de ids (strings não vazias).',
    )
  }
  // Dedupe — o body pode chegar com ids repetidos vindos do multi-select do
  // frontend; a checagem de existência em lote (In(ids)) e o UPDATE em lote
  // abaixo não precisam de duplicatas.
  return Array.from(new Set(valor))
}

export async function vincularColaboradoresEquipe(
  ator: ColaboradorAutenticado,
  id: string,
  dto: VincularColaboradoresEquipeDto,
): Promise<ColaboradorDaEquipeResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const equipe = await repositorio().findOneBy({ id })
  if (!equipe) {
    throw new ErroHttp(404, 'EQUIPE_NAO_ENCONTRADA', 'Equipe não encontrada.')
  }

  const colaboradorIds = validarColaboradorIds(dto.colaboradorIds)

  if (colaboradorIds.length > 0) {
    const encontrados = await repositorioColaborador().findBy({ id: In(colaboradorIds) })
    if (encontrados.length !== colaboradorIds.length) {
      throw new ErroHttp(404, 'COLABORADOR_NAO_ENCONTRADO', 'Colaborador não encontrado.')
    }
  }

  // Substituição total do vínculo, em transação: quem está na lista passa a
  // ter equipe_id = id; quem tinha equipe_id = id e NÃO está na lista é
  // desvinculado (equipe_id = null). Sem restrição de `ativo` — um
  // colaborador inativo pode continuar/passar a ser membro.
  await AppDataSource.transaction(async (manager) => {
    if (colaboradorIds.length > 0) {
      await manager
        .createQueryBuilder()
        .update(Colaborador)
        .set({ equipeId: id })
        .where('id IN (:...colaboradorIds)', { colaboradorIds })
        .execute()
    }

    const desvincular = manager
      .createQueryBuilder()
      .update(Colaborador)
      .set({ equipeId: null })
      .where('equipe_id = :id', { id })

    if (colaboradorIds.length > 0) {
      desvincular.andWhere('id NOT IN (:...colaboradorIds)', { colaboradorIds })
    }

    await desvincular.execute()
  })

  const atualizados = await repositorioColaborador().find({
    where: { equipeId: id },
    order: { nomeCompleto: 'ASC' },
  })

  return atualizados.map(mapearColaboradorDaEquipe)
}
