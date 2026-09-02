import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { STATUS_PESQUISA_VALORES, type StatusPesquisa } from '../../common/enums'
import { ErroHttp } from '../../common/erro-http'
import { validarEnum, validarTextoObrigatorio } from '../../common/validacao'
import type { ColaboradorAutenticado } from '../../types/express'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { garantirCicloEditavel } from '../ciclos-avaliacao/ciclos-avaliacao.service'
import { Competencia } from '../competencias/competencia.entity'
import * as paginasPesquisaService from '../paginas-pesquisa/paginas-pesquisa.service'
import { PaginaPesquisa } from '../paginas-pesquisa/pagina-pesquisa.entity'
import { PerguntaCompetencia } from '../perguntas/pergunta-competencia.entity'
import { Pergunta } from '../perguntas/pergunta.entity'
import type { AtualizarPesquisaDto } from './dto/atualizar-pesquisa.dto'
import type { AtualizarStatusPesquisaDto } from './dto/atualizar-status-pesquisa.dto'
import type { CriarPesquisaDto } from './dto/criar-pesquisa.dto'
import { Pesquisa } from './pesquisa.entity'

const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Só avanço, nunca regressão, nunca pular etapa (decisão assumida 5).
const TRANSICOES_VALIDAS: Record<StatusPesquisa, StatusPesquisa[]> = {
  rascunho: ['publicada'],
  publicada: ['encerrada'],
  encerrada: [],
}

export interface PesquisaRespostaLista {
  id: string
  titulo: string
  status: StatusPesquisa
  cicloId: string | null
  criadoEm: string
  atualizadoEm: string
}

export interface CompetenciaResumo {
  id: string
  nome: string
}

export interface PerguntaAninhada {
  id: string
  tipo: string
  enunciado: string
  obrigatoria: boolean
  ordem: number
  configuracao: Record<string, unknown>
  competencias: CompetenciaResumo[]
}

export interface PaginaAninhada {
  id: string
  titulo: string | null
  ordem: number
  perguntas: PerguntaAninhada[]
}

export interface PesquisaRespostaDetalhe {
  id: string
  titulo: string
  mensagemBoasVindas: string | null
  logoUrl: string | null
  status: StatusPesquisa
  cicloId: string | null
  paginas: PaginaAninhada[]
  criadoEm: string
  atualizadoEm: string
}

function repositorio() {
  return AppDataSource.getRepository(Pesquisa)
}

/**
 * Valida formato (UUID sintaticamente válido) e EXISTÊNCIA em
 * `ciclos_avaliacao` — tech debt resolvido pela task de ciclos de avaliação
 * (antes só validava formato, ver histórico do módulo).
 */
async function validarCicloExistente(valor: unknown): Promise<CicloAvaliacao> {
  if (typeof valor !== 'string' || !REGEX_UUID.test(valor.trim())) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "cicloId" deve ser um UUID válido ou null.')
  }

  const id = valor.trim()

  const ciclo = await AppDataSource.getRepository(CicloAvaliacao).findOneBy({ id })
  if (!ciclo) {
    throw new ErroHttp(404, 'CICLO_NAO_ENCONTRADO', 'Ciclo de avaliação não encontrado.')
  }

  return ciclo
}

function mapearPesquisaLista(pesquisa: Pesquisa): PesquisaRespostaLista {
  return {
    id: pesquisa.id,
    titulo: pesquisa.titulo,
    status: pesquisa.status,
    cicloId: pesquisa.cicloId,
    criadoEm: pesquisa.criadoEm.toISOString(),
    atualizadoEm: pesquisa.atualizadoEm.toISOString(),
  }
}

async function montarDetalhe(
  ator: ColaboradorAutenticado,
  pesquisa: Pesquisa,
): Promise<PesquisaRespostaDetalhe> {
  const paginas = await paginasPesquisaService.listar(ator, pesquisa.id)
  const paginaIds = paginas.map((pagina) => pagina.id)

  const perguntas =
    paginaIds.length === 0
      ? []
      : await AppDataSource.getRepository(Pergunta).find({
          where: { paginaId: In(paginaIds) },
          order: { ordem: 'ASC' },
        })

  const perguntaIds = perguntas.map((pergunta) => pergunta.id)

  const vinculos =
    perguntaIds.length === 0
      ? []
      : await AppDataSource.getRepository(PerguntaCompetencia)
          .createQueryBuilder('pc')
          .innerJoin(Competencia, 'c', 'c.id = pc.competencia_id')
          .select('pc.pergunta_id', 'perguntaId')
          .addSelect('c.id', 'competenciaId')
          .addSelect('c.nome', 'nome')
          .where('pc.pergunta_id IN (:...ids)', { ids: perguntaIds })
          .getRawMany<{ perguntaId: string; competenciaId: string; nome: string }>()

  const competenciasPorPergunta = new Map<string, CompetenciaResumo[]>()
  for (const vinculo of vinculos) {
    const lista = competenciasPorPergunta.get(vinculo.perguntaId) ?? []
    lista.push({ id: vinculo.competenciaId, nome: vinculo.nome })
    competenciasPorPergunta.set(vinculo.perguntaId, lista)
  }

  const perguntasPorPagina = new Map<string, PerguntaAninhada[]>()
  for (const pergunta of perguntas) {
    const lista = perguntasPorPagina.get(pergunta.paginaId) ?? []
    lista.push({
      id: pergunta.id,
      tipo: pergunta.tipo,
      enunciado: pergunta.enunciado,
      obrigatoria: pergunta.obrigatoria,
      ordem: pergunta.ordem,
      configuracao: pergunta.configuracao,
      competencias: competenciasPorPergunta.get(pergunta.id) ?? [],
    })
    perguntasPorPagina.set(pergunta.paginaId, lista)
  }

  return {
    id: pesquisa.id,
    titulo: pesquisa.titulo,
    mensagemBoasVindas: pesquisa.mensagemBoasVindas,
    logoUrl: pesquisa.logoUrl,
    status: pesquisa.status,
    cicloId: pesquisa.cicloId,
    paginas: paginas.map((pagina) => ({
      id: pagina.id,
      titulo: pagina.titulo,
      ordem: pagina.ordem,
      perguntas: perguntasPorPagina.get(pagina.id) ?? [],
    })),
    criadoEm: pesquisa.criadoEm.toISOString(),
    atualizadoEm: pesquisa.atualizadoEm.toISOString(),
  }
}
export async function buscarEntidadeOuFalhar(id: string): Promise<Pesquisa> {
  const pesquisa = await repositorio().findOneBy({ id })
  if (!pesquisa) {
    throw new ErroHttp(404, 'PESQUISA_NAO_ENCONTRADA', 'Pesquisa não encontrada.')
  }
  return pesquisa
}

export function garantirEditavel(pesquisa: Pesquisa): void {
  if (pesquisa.status !== 'rascunho') {
    throw new ErroHttp(
      409,
      'PESQUISA_NAO_EDITAVEL',
      'Só é possível alterar páginas/perguntas de uma pesquisa em rascunho.',
    )
  }
}

export async function criar(
  ator: ColaboradorAutenticado,
  dto: CriarPesquisaDto,
): Promise<PesquisaRespostaDetalhe> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const titulo = validarTextoObrigatorio(dto.titulo, { campo: 'titulo', min: 2, max: 255 })

  const mensagemBoasVindas =
    dto.mensagemBoasVindas !== undefined
      ? validarTextoObrigatorio(dto.mensagemBoasVindas, {
          campo: 'mensagemBoasVindas',
          min: 1,
          max: 2000,
        })
      : null

  const logoUrl =
    dto.logoUrl !== undefined
      ? validarTextoObrigatorio(dto.logoUrl, { campo: 'logoUrl', min: 1, max: 500 })
      : null

  const nova = repositorio().create({
    titulo,
    mensagemBoasVindas,
    logoUrl,
    cicloId: null,
    status: 'rascunho',
  })

  const salva = await repositorio().save(nova)

  return montarDetalhe(ator, salva)
}

export async function listar(ator: ColaboradorAutenticado): Promise<PesquisaRespostaLista[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const pesquisas = await repositorio().find({ order: { criadoEm: 'DESC' } })

  return pesquisas.map(mapearPesquisaLista)
}

export async function buscarPorId(
  ator: ColaboradorAutenticado,
  id: string,
): Promise<PesquisaRespostaDetalhe> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const pesquisa = await buscarEntidadeOuFalhar(id)

  return montarDetalhe(ator, pesquisa)
}

export async function atualizar(
  ator: ColaboradorAutenticado,
  id: string,
  dto: AtualizarPesquisaDto,
): Promise<PesquisaRespostaDetalhe> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const pesquisa = await buscarEntidadeOuFalhar(id)

  if (dto.titulo !== undefined) {
    pesquisa.titulo = validarTextoObrigatorio(dto.titulo, { campo: 'titulo', min: 2, max: 255 })
  }

  if ('mensagemBoasVindas' in dto) {
    pesquisa.mensagemBoasVindas =
      dto.mensagemBoasVindas === null
        ? null
        : validarTextoObrigatorio(dto.mensagemBoasVindas, {
            campo: 'mensagemBoasVindas',
            min: 1,
            max: 2000,
          })
  }

  if ('logoUrl' in dto) {
    pesquisa.logoUrl =
      dto.logoUrl === null
        ? null
        : validarTextoObrigatorio(dto.logoUrl, { campo: 'logoUrl', min: 1, max: 500 })
  }

  if ('cicloId' in dto) {
    if (dto.cicloId === null) {
      // Desvincular é sempre permitido, independentemente do status da
      // pesquisa ou do ciclo (decisão assumida 10 do plano da task de ciclos).
      pesquisa.cicloId = null
    } else {
      const ciclo = await validarCicloExistente(dto.cicloId)
      garantirCicloEditavel(ciclo)

      if (pesquisa.status !== 'publicada') {
        throw new ErroHttp(
          409,
          'PESQUISA_NAO_PUBLICADA',
          'Só é possível vincular um ciclo a uma pesquisa publicada.',
        )
      }

      pesquisa.cicloId = ciclo.id
    }
  }

  const salva = await repositorio().save(pesquisa)

  return montarDetalhe(ator, salva)
}

export async function atualizarStatus(
  ator: ColaboradorAutenticado,
  id: string,
  dto: AtualizarStatusPesquisaDto,
): Promise<PesquisaRespostaDetalhe> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const pesquisa = await buscarEntidadeOuFalhar(id)
  const novoStatus = validarEnum(dto.status, STATUS_PESQUISA_VALORES, 'status')

  const transicoesPermitidas = TRANSICOES_VALIDAS[pesquisa.status]
  if (!transicoesPermitidas.includes(novoStatus)) {
    throw new ErroHttp(
      409,
      'TRANSICAO_STATUS_INVALIDA',
      `Não é possível transicionar de "${pesquisa.status}" para "${novoStatus}".`,
    )
  }

  if (pesquisa.status === 'rascunho' && novoStatus === 'publicada') {
    const totalPerguntas = await AppDataSource.getRepository(Pergunta)
      .createQueryBuilder('pergunta')
      .innerJoin(PaginaPesquisa, 'pagina', 'pagina.id = pergunta.pagina_id')
      .where('pagina.pesquisa_id = :pesquisaId', { pesquisaId: pesquisa.id })
      .getCount()

    if (totalPerguntas === 0) {
      throw new ErroHttp(
        422,
        'PESQUISA_VAZIA',
        'A pesquisa precisa de pelo menos uma página com pelo menos uma pergunta para ser publicada.',
      )
    }
  }

  pesquisa.status = novoStatus
  const salva = await repositorio().save(pesquisa)

  return montarDetalhe(ator, salva)
}

export async function duplicar(
  ator: ColaboradorAutenticado,
  id: string,
): Promise<PesquisaRespostaDetalhe> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const original = await buscarEntidadeOuFalhar(id)
  const detalheOriginal = await montarDetalhe(ator, original)

  const novaId = await AppDataSource.transaction(async (manager) => {
    const pesquisaRepo = manager.getRepository(Pesquisa)
    const paginaRepo = manager.getRepository(PaginaPesquisa)
    const perguntaRepo = manager.getRepository(Pergunta)
    const perguntaCompetenciaRepo = manager.getRepository(PerguntaCompetencia)

    const novaPesquisa = await pesquisaRepo.save(
      pesquisaRepo.create({
        titulo: `${detalheOriginal.titulo} (cópia)`,
        mensagemBoasVindas: detalheOriginal.mensagemBoasVindas,
        logoUrl: detalheOriginal.logoUrl,
        status: 'rascunho',
        cicloId: null,
      }),
    )

    for (const pagina of detalheOriginal.paginas) {
      const novaPagina = await paginaRepo.save(
        paginaRepo.create({
          pesquisaId: novaPesquisa.id,
          titulo: pagina.titulo,
          ordem: pagina.ordem,
        }),
      )

      for (const pergunta of pagina.perguntas) {
        const novaPergunta = await perguntaRepo.save(
          perguntaRepo.create({
            paginaId: novaPagina.id,
            tipo: pergunta.tipo as Pergunta['tipo'],
            enunciado: pergunta.enunciado,
            obrigatoria: pergunta.obrigatoria,
            configuracao: pergunta.configuracao,
            ordem: pergunta.ordem,
          }),
        )

        for (const competencia of pergunta.competencias) {
          await perguntaCompetenciaRepo.save(
            perguntaCompetenciaRepo.create({
              perguntaId: novaPergunta.id,
              competenciaId: competencia.id,
            }),
          )
        }
      }
    }

    return novaPesquisa.id
  })

  const nova = await buscarEntidadeOuFalhar(novaId)
  return montarDetalhe(ator, nova)
}

export async function remover(ator: ColaboradorAutenticado, id: string): Promise<void> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const pesquisa = await buscarEntidadeOuFalhar(id)

  if (pesquisa.status !== 'rascunho') {
    throw new ErroHttp(
      409,
      'PESQUISA_NAO_REMOVIVEL',
      'Só é possível remover pesquisas em rascunho.',
    )
  }

  await repositorio().delete({ id })
}
