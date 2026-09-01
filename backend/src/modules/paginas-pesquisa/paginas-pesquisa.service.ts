import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { ErroHttp } from '../../common/erro-http'
import { validarTextoObrigatorio } from '../../common/validacao'
import type { ColaboradorAutenticado } from '../../types/express'
import * as pesquisasService from '../pesquisas/pesquisas.service'
import type { AtualizarPaginaDto } from './dto/atualizar-pagina.dto'
import type { CriarPaginaDto } from './dto/criar-pagina.dto'
import type { ReordenarPaginasDto } from './dto/reordenar-paginas.dto'
import { PaginaPesquisa } from './pagina-pesquisa.entity'

const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

export interface PaginaResposta {
  id: string
  titulo: string | null
  ordem: number
}

function repositorio() {
  return AppDataSource.getRepository(PaginaPesquisa)
}

function mapearPagina(pagina: PaginaPesquisa): PaginaResposta {
  return { id: pagina.id, titulo: pagina.titulo, ordem: pagina.ordem }
}

async function buscarPaginaDaPesquisaOuFalhar(
  pesquisaId: string,
  paginaId: string,
): Promise<PaginaPesquisa> {
  const pagina = await repositorio().findOneBy({ id: paginaId, pesquisaId })
  if (!pagina) {
    throw new ErroHttp(404, 'PAGINA_NAO_ENCONTRADA', 'Página não encontrada.')
  }
  return pagina
}

export async function criar(
  ator: ColaboradorAutenticado,
  pesquisaId: string,
  dto: CriarPaginaDto,
): Promise<PaginaResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const pesquisa = await pesquisasService.buscarEntidadeOuFalhar(pesquisaId)
  pesquisasService.garantirEditavel(pesquisa)

  const titulo =
    dto.titulo !== undefined
      ? validarTextoObrigatorio(dto.titulo, { campo: 'titulo', min: 1, max: 255 })
      : null

  const resultadoMax = await repositorio()
    .createQueryBuilder('pagina')
    .select('MAX(pagina.ordem)', 'max')
    .where('pagina.pesquisa_id = :pesquisaId', { pesquisaId })
    .getRawOne<{ max: number | null }>()

  const ordem = resultadoMax?.max ? Number(resultadoMax.max) + 1 : 1

  const nova = repositorio().create({ pesquisaId, titulo, ordem })
  const salva = await repositorio().save(nova)

  return mapearPagina(salva)
}

/**
 * Não exposta como rota própria nesta task — função interna reaproveitada
 * pela montagem do shape aninhado em `pesquisas.service.ts` (ver
 * task-backend.md 1.6). Retorna as entidades cruas, ordenadas.
 */
export async function listar(
  ator: ColaboradorAutenticado,
  pesquisaId: string,
): Promise<PaginaPesquisa[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  return repositorio().find({ where: { pesquisaId }, order: { ordem: 'ASC' } })
}

export async function atualizar(
  ator: ColaboradorAutenticado,
  pesquisaId: string,
  paginaId: string,
  dto: AtualizarPaginaDto,
): Promise<PaginaResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const pagina = await buscarPaginaDaPesquisaOuFalhar(pesquisaId, paginaId)

  const pesquisa = await pesquisasService.buscarEntidadeOuFalhar(pesquisaId)
  pesquisasService.garantirEditavel(pesquisa)

  if (dto.titulo !== undefined) {
    pagina.titulo = validarTextoObrigatorio(dto.titulo, { campo: 'titulo', min: 1, max: 255 })
  }

  const salva = await repositorio().save(pagina)

  return mapearPagina(salva)
}

export async function remover(
  ator: ColaboradorAutenticado,
  pesquisaId: string,
  paginaId: string,
): Promise<void> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarPaginaDaPesquisaOuFalhar(pesquisaId, paginaId)

  const pesquisa = await pesquisasService.buscarEntidadeOuFalhar(pesquisaId)
  pesquisasService.garantirEditavel(pesquisa)

  // DELETE físico: ON DELETE CASCADE cobre perguntas/perguntas_competencias
  // da página.
  await repositorio().delete({ id: paginaId })
}

export async function reordenar(
  ator: ColaboradorAutenticado,
  pesquisaId: string,
  dto: ReordenarPaginasDto,
): Promise<PaginaResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const pesquisa = await pesquisasService.buscarEntidadeOuFalhar(pesquisaId)
  pesquisasService.garantirEditavel(pesquisa)

  const itens = Array.isArray(dto.itens) ? dto.itens : []

  // Correção pós-revisão: valida a FORMA de cada item antes de acessar
  // `.id`/`.ordem` — um payload malformado (`null`, item sem `id`, `ordem`
  // não numérica) deve virar 422 de validação, nunca um 500 por acessar
  // propriedade de algo que não é o objeto esperado.
  const formatoValido = itens.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { id?: unknown }).id === 'string' &&
      typeof (item as { ordem?: unknown }).ordem === 'number',
  )
  if (!formatoValido) {
    throw new ErroHttp(
      422,
      'ORDEM_INVALIDA',
      'Cada item de "itens" deve ser um objeto com "id" (string) e "ordem" (número).',
    )
  }

  const existentes = await repositorio().find({ where: { pesquisaId } })
  const idsExistentes = new Set(existentes.map((pagina) => pagina.id))
  const idsRecebidos = itens.map((item) => item.id)
  const idsRecebidosUnicos = new Set(idsRecebidos)

  const ordensValidas = itens.every((item) => Number.isInteger(item.ordem) && item.ordem > 0)
  const ordensUnicas = new Set(itens.map((item) => item.ordem)).size === itens.length

  const cobreExatamente =
    idsRecebidos.length === idsExistentes.size &&
    idsRecebidosUnicos.size === idsRecebidos.length &&
    idsRecebidos.every((id) => idsExistentes.has(id))

  if (!cobreExatamente || !ordensValidas || !ordensUnicas) {
    throw new ErroHttp(
      422,
      'ORDEM_INVALIDA',
      'A reordenação deve cobrir exatamente as páginas existentes, com ordens inteiras positivas e sem duplicatas.',
    )
  }

  await AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(PaginaPesquisa)
    // A constraint uq_paginas_pesquisa_pesquisa_ordem é DEFERRABLE INITIALLY
    // DEFERRED — dentro desta transação, atualizações intermediárias que
    // colidiriam com a unicidade só são checadas no COMMIT.
    for (const item of itens) {
      await repo.update({ id: item.id, pesquisaId }, { ordem: item.ordem })
    }
  })

  const atualizadas = await repositorio().find({ where: { pesquisaId }, order: { ordem: 'ASC' } })
  return atualizadas.map(mapearPagina)
}
