import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import {
  TIPO_PERGUNTA_VALORES,
  TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES,
  type TipoPergunta,
} from '../../common/enums'
import { ErroHttp } from '../../common/erro-http'
import { validarEnum, validarTextoObrigatorio } from '../../common/validacao'
import type { ColaboradorAutenticado } from '../../types/express'
import { Competencia } from '../competencias/competencia.entity'
import { PaginaPesquisa } from '../paginas-pesquisa/pagina-pesquisa.entity'
import * as pesquisasService from '../pesquisas/pesquisas.service'
import type { AtualizarPerguntaDto } from './dto/atualizar-pergunta.dto'
import type { CriarPerguntaDto } from './dto/criar-pergunta.dto'
import type { ReordenarPerguntasDto } from './dto/reordenar-perguntas.dto'
import { PerguntaCompetencia } from './pergunta-competencia.entity'
import { Pergunta } from './pergunta.entity'

const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

export interface CompetenciaResumo {
  id: string
  nome: string
}

export interface PerguntaResposta {
  id: string
  tipo: TipoPergunta
  enunciado: string
  obrigatoria: boolean
  ordem: number
  configuracao: Record<string, unknown>
  competencias: CompetenciaResumo[]
}

function repositorio() {
  return AppDataSource.getRepository(Pergunta)
}

function repositorioPaginas() {
  return AppDataSource.getRepository(PaginaPesquisa)
}

function repositorioCompetencias() {
  return AppDataSource.getRepository(Competencia)
}

function repositorioVinculos() {
  return AppDataSource.getRepository(PerguntaCompetencia)
}

async function buscarPaginaDaPesquisaOuFalhar(
  pesquisaId: string,
  paginaId: string,
): Promise<PaginaPesquisa> {
  const pagina = await repositorioPaginas().findOneBy({ id: paginaId, pesquisaId })
  if (!pagina) {
    throw new ErroHttp(404, 'PAGINA_NAO_ENCONTRADA', 'Página não encontrada.')
  }
  return pagina
}

async function buscarPerguntaDaPaginaOuFalhar(
  paginaId: string,
  perguntaId: string,
): Promise<Pergunta> {
  const pergunta = await repositorio().findOneBy({ id: perguntaId, paginaId })
  if (!pergunta) {
    throw new ErroHttp(404, 'PERGUNTA_NAO_ENCONTRADA', 'Pergunta não encontrada.')
  }
  return pergunta
}

/**
 * Valida `perguntas.configuracao` (jsonb) por tipo, conforme a skill
 * `frontend-componente-pergunta` (chaves em camelCase, decisão assumida 12).
 * A configuração guarda EXCLUSIVAMENTE dados estruturais — nunca `resposta`,
 * `respondenteId`, `avaliadorId` ou qualquer dado de execução (guard rail
 * 1.8 do plano / skill `backend-anonimizacao-respostas`).
 */
function validarConfiguracaoPergunta(
  tipo: TipoPergunta,
  configuracaoBruta: unknown,
): Record<string, unknown> {
  const configuracao = configuracaoBruta ?? {}

  if (typeof configuracao !== 'object' || configuracao === null || Array.isArray(configuracao)) {
    throw new ErroHttp(422, 'CONFIGURACAO_INVALIDA', 'Campo "configuracao" deve ser um objeto.')
  }

  const objeto = configuracao as Record<string, unknown>

  if (tipo === 'likert' || tipo === 'matriz') {
    const { niveis, rotulos } = objeto
    if (typeof niveis !== 'number' || !Number.isInteger(niveis) || niveis < 2 || niveis > 10) {
      throw new ErroHttp(
        422,
        'CONFIGURACAO_INVALIDA',
        'Campo "configuracao.niveis" é obrigatório e deve ser um inteiro entre 2 e 10.',
      )
    }
    if (
      !Array.isArray(rotulos) ||
      rotulos.length !== niveis ||
      rotulos.some((rotulo) => typeof rotulo !== 'string' || rotulo.trim().length === 0)
    ) {
      throw new ErroHttp(
        422,
        'CONFIGURACAO_INVALIDA',
        'Campo "configuracao.rotulos" é obrigatório e deve ter exatamente "niveis" strings não vazias.',
      )
    }
    return { niveis, rotulos }
  }

  if (tipo === 'texto_aberto') {
    if (Object.keys(objeto).length > 0) {
      throw new ErroHttp(
        422,
        'CONFIGURACAO_INVALIDA',
        'Pergunta do tipo "texto_aberto" não aceita nenhuma chave em "configuracao".',
      )
    }
    return {}
  }

  // tipo === 'pessoa'
  const { filtroRelacionamento } = objeto
  if (
    !Array.isArray(filtroRelacionamento) ||
    filtroRelacionamento.length === 0 ||
    filtroRelacionamento.some(
      (item) =>
        typeof item !== 'string' || !TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES.includes(item as never),
    )
  ) {
    throw new ErroHttp(
      422,
      'CONFIGURACAO_INVALIDA',
      'Campo "configuracao.filtroRelacionamento" é obrigatório, não vazio, com tipos de relacionamento válidos.',
    )
  }
  return { filtroRelacionamento }
}

/**
 * Regra matriz <-> competenciaIds (decisão assumida 9): valida a lista
 * efetiva de competências contra o tipo resultante — SEMPRE que o tipo
 * resultante é conhecido (ou seja, em toda chamada de criar/atualizar,
 * mesmo quando `competenciaIds` não foi reenviado no atualizar — nesse caso
 * a lista efetiva é a que já está vinculada no banco).
 */
async function resolverCompetencias(
  tipo: TipoPergunta,
  competenciaIds: string[],
): Promise<Competencia[]> {
  const idsUnicos = Array.from(new Set(competenciaIds))

  if (tipo === 'matriz') {
    if (idsUnicos.length === 0) {
      throw new ErroHttp(
        422,
        'MATRIZ_SEM_COMPETENCIA',
        'Pergunta do tipo "matriz" exige pelo menos uma competência vinculada.',
      )
    }
    const encontradas = await repositorioCompetencias().findBy({ id: In(idsUnicos) })
    if (encontradas.length !== idsUnicos.length) {
      throw new ErroHttp(
        404,
        'COMPETENCIA_NAO_ENCONTRADA',
        'Uma ou mais competências informadas não foram encontradas.',
      )
    }
    return encontradas
  }

  if (idsUnicos.length > 0) {
    throw new ErroHttp(
      422,
      'COMPETENCIA_FORA_DE_ESCOPO',
      'Só perguntas do tipo "matriz" podem ter competências vinculadas.',
    )
  }
  return []
}

function mapearPergunta(pergunta: Pergunta, competencias: CompetenciaResumo[]): PerguntaResposta {
  return {
    id: pergunta.id,
    tipo: pergunta.tipo,
    enunciado: pergunta.enunciado,
    obrigatoria: pergunta.obrigatoria,
    ordem: pergunta.ordem,
    configuracao: pergunta.configuracao,
    competencias,
  }
}

export async function criar(
  ator: ColaboradorAutenticado,
  pesquisaId: string,
  paginaId: string,
  dto: CriarPerguntaDto,
): Promise<PerguntaResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarPaginaDaPesquisaOuFalhar(pesquisaId, paginaId)
  const pesquisa = await pesquisasService.buscarEntidadeOuFalhar(pesquisaId)
  pesquisasService.garantirEditavel(pesquisa)

  const tipo = validarEnum(dto.tipo, TIPO_PERGUNTA_VALORES, 'tipo')

  // Nova nesta task: pergunta `pessoa` pressupõe um universo
  // avaliador↔avaliado (relacionamentos_avaliacao), que só existe para
  // pesquisas `avaliacao_360` — `clima_geral` nunca gera
  // relacionamentos_avaliacao (ver ciclos-avaliacao.service.ts,
  // atualizarStatus). `pesquisa` já foi buscada acima, nenhuma query nova.
  if (tipo === 'pessoa' && pesquisa.tipo === 'clima_geral') {
    throw new ErroHttp(
      422,
      'TIPO_PERGUNTA_INVALIDO_PARA_PESQUISA',
      'Pergunta do tipo "pessoa" não é permitida em pesquisas do tipo "clima_geral".',
    )
  }

  const enunciado = validarTextoObrigatorio(dto.enunciado, { campo: 'enunciado', min: 2 })

  const obrigatoria = dto.obrigatoria !== undefined ? Boolean(dto.obrigatoria) : true

  // Validação de configuração roda ANTES da checagem de competenciaIds, para
  // nunca gravar uma pergunta com configuração estrutural inválida mesmo que
  // os vínculos de competência estejam corretos.
  const configuracaoValidada = validarConfiguracaoPergunta(tipo, dto.configuracao)
  const competencias = await resolverCompetencias(tipo, dto.competenciaIds ?? [])

  const resultadoMax = await repositorio()
    .createQueryBuilder('pergunta')
    .select('MAX(pergunta.ordem)', 'max')
    .where('pergunta.pagina_id = :paginaId', { paginaId })
    .getRawOne<{ max: number | null }>()

  const ordem = resultadoMax?.max ? Number(resultadoMax.max) + 1 : 1

  const perguntaSalva = await AppDataSource.transaction(async (manager) => {
    const perguntaRepo = manager.getRepository(Pergunta)
    const vinculoRepo = manager.getRepository(PerguntaCompetencia)

    const nova = await perguntaRepo.save(
      perguntaRepo.create({
        paginaId,
        tipo,
        enunciado,
        obrigatoria,
        configuracao: configuracaoValidada,
        ordem,
      }),
    )

    for (const competencia of competencias) {
      await vinculoRepo.save(
        vinculoRepo.create({ perguntaId: nova.id, competenciaId: competencia.id }),
      )
    }

    return nova
  })

  return mapearPergunta(
    perguntaSalva,
    competencias.map((competencia) => ({ id: competencia.id, nome: competencia.nome })),
  )
}

export async function atualizar(
  ator: ColaboradorAutenticado,
  pesquisaId: string,
  paginaId: string,
  perguntaId: string,
  dto: AtualizarPerguntaDto,
): Promise<PerguntaResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarPaginaDaPesquisaOuFalhar(pesquisaId, paginaId)
  const pesquisa = await pesquisasService.buscarEntidadeOuFalhar(pesquisaId)
  pesquisasService.garantirEditavel(pesquisa)

  const pergunta = await buscarPerguntaDaPaginaOuFalhar(paginaId, perguntaId)

  const tipoResultante =
    dto.tipo !== undefined ? validarEnum(dto.tipo, TIPO_PERGUNTA_VALORES, 'tipo') : pergunta.tipo

  // Mesma regra de criar() — revalidada mesmo quando `dto.tipo` não é
  // reenviado, para o caso (hoje inatingível pela própria checagem de
  // criar(), mas defendido aqui por consistência/defesa em profundidade) de
  // uma pergunta `pessoa` já existente numa pesquisa que de alguma forma
  // seja `clima_geral`.
  if (tipoResultante === 'pessoa' && pesquisa.tipo === 'clima_geral') {
    throw new ErroHttp(
      422,
      'TIPO_PERGUNTA_INVALIDO_PARA_PESQUISA',
      'Pergunta do tipo "pessoa" não é permitida em pesquisas do tipo "clima_geral".',
    )
  }

  if (dto.enunciado !== undefined) {
    pergunta.enunciado = validarTextoObrigatorio(dto.enunciado, { campo: 'enunciado', min: 2 })
  }

  if (dto.obrigatoria !== undefined) {
    pergunta.obrigatoria = Boolean(dto.obrigatoria)
  }

  pergunta.tipo = tipoResultante

  // Correção pós-revisão: `configuracao` é SEMPRE revalidada contra o tipo
  // resultante — usa o valor do body quando enviado, ou a configuração já
  // persistida como fallback (mesmo padrão espelhado do fallback de
  // `competenciaIds` logo abaixo). Sem isso, trocar `tipo` sem reenviar
  // `configuracao` gravava uma configuração incompatível com o novo tipo
  // (ex.: `pessoa -> likert` mantendo `filtroRelacionamento` sem
  // `niveis`/`rotulos`). Nunca faz merge parcial: o objeto validado
  // substitui o campo por completo.
  const configuracaoEfetiva =
    dto.configuracao !== undefined ? dto.configuracao : pergunta.configuracao
  pergunta.configuracao = validarConfiguracaoPergunta(tipoResultante, configuracaoEfetiva)

  // Lista efetiva de competências para VALIDAÇÃO (roda sempre que o tipo
  // resultante é conhecido, ou seja, em toda chamada): usa o que veio no
  // body se enviado, senão os vínculos já existentes no banco.
  let vinculosAtuais: PerguntaCompetencia[] = []
  if (dto.competenciaIds === undefined) {
    vinculosAtuais = await repositorioVinculos().find({ where: { perguntaId } })
  }
  const competenciaIdsEfetivos =
    dto.competenciaIds ?? vinculosAtuais.map((vinculo) => vinculo.competenciaId)

  const competencias = await resolverCompetencias(tipoResultante, competenciaIdsEfetivos)

  const salva = await AppDataSource.transaction(async (manager) => {
    const perguntaRepo = manager.getRepository(Pergunta)
    const vinculoRepo = manager.getRepository(PerguntaCompetencia)

    const perguntaSalva = await perguntaRepo.save(pergunta)

    // Substitui o conjunto de vínculos por completo (DELETE + INSERT) só
    // quando `competenciaIds` foi explicitamente enviado — sem diff
    // incremental (mais simples e suficiente para o volume esperado).
    if (dto.competenciaIds !== undefined) {
      await vinculoRepo.delete({ perguntaId })
      for (const competencia of competencias) {
        await vinculoRepo.save(
          vinculoRepo.create({ perguntaId, competenciaId: competencia.id }),
        )
      }
    }

    return perguntaSalva
  })

  const competenciasResposta =
    dto.competenciaIds !== undefined
      ? competencias.map((competencia) => ({ id: competencia.id, nome: competencia.nome }))
      : (
          await repositorioVinculos()
            .createQueryBuilder('pc')
            .innerJoin(Competencia, 'c', 'c.id = pc.competencia_id')
            .select('c.id', 'id')
            .addSelect('c.nome', 'nome')
            .where('pc.pergunta_id = :perguntaId', { perguntaId })
            .getRawMany<CompetenciaResumo>()
        )

  return mapearPergunta(salva, competenciasResposta)
}

export async function remover(
  ator: ColaboradorAutenticado,
  pesquisaId: string,
  paginaId: string,
  perguntaId: string,
): Promise<void> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarPaginaDaPesquisaOuFalhar(pesquisaId, paginaId)
  const pesquisa = await pesquisasService.buscarEntidadeOuFalhar(pesquisaId)
  pesquisasService.garantirEditavel(pesquisa)

  await buscarPerguntaDaPaginaOuFalhar(paginaId, perguntaId)

  // DELETE físico: ON DELETE CASCADE cobre perguntas_competencias.
  await repositorio().delete({ id: perguntaId })
}

export async function reordenar(
  ator: ColaboradorAutenticado,
  pesquisaId: string,
  paginaId: string,
  dto: ReordenarPerguntasDto,
): Promise<PerguntaResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarPaginaDaPesquisaOuFalhar(pesquisaId, paginaId)
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

  const existentes = await repositorio().find({ where: { paginaId } })
  const idsExistentes = new Set(existentes.map((pergunta) => pergunta.id))
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
      'A reordenação deve cobrir exatamente as perguntas existentes, com ordens inteiras positivas e sem duplicatas.',
    )
  }

  await AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Pergunta)
    // A constraint uq_perguntas_pagina_ordem é DEFERRABLE INITIALLY
    // DEFERRED — a checagem de unicidade só roda no COMMIT desta transação.
    for (const item of itens) {
      await repo.update({ id: item.id, paginaId }, { ordem: item.ordem })
    }
  })

  const atualizadas = await repositorio().find({ where: { paginaId }, order: { ordem: 'ASC' } })
  const perguntaIds = atualizadas.map((pergunta) => pergunta.id)

  const vinculos =
    perguntaIds.length === 0
      ? []
      : await repositorioVinculos()
          .createQueryBuilder('pc')
          .innerJoin(Competencia, 'c', 'c.id = pc.competencia_id')
          .select('pc.pergunta_id', 'perguntaId')
          .addSelect('c.id', 'id')
          .addSelect('c.nome', 'nome')
          .where('pc.pergunta_id IN (:...ids)', { ids: perguntaIds })
          .getRawMany<{ perguntaId: string; id: string; nome: string }>()

  const competenciasPorPergunta = new Map<string, CompetenciaResumo[]>()
  for (const vinculo of vinculos) {
    const lista = competenciasPorPergunta.get(vinculo.perguntaId) ?? []
    lista.push({ id: vinculo.id, nome: vinculo.nome })
    competenciasPorPergunta.set(vinculo.perguntaId, lista)
  }

  return atualizadas.map((pergunta) =>
    mapearPergunta(pergunta, competenciasPorPergunta.get(pergunta.id) ?? []),
  )
}
