import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { ErroHttp } from '../../common/erro-http'
import { ehUuidValido } from '../../common/uuid'
import type { ColaboradorAutenticado } from '../../types/express'
import { buscarCicloOuFalhar } from '../ciclos-avaliacao/ciclos-avaliacao.service'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'
import { Resposta } from '../respostas/resposta.entity'
import { ItemResposta } from '../respostas/item-resposta.entity'
import { RespostaClima } from '../respostas-clima/resposta-clima.entity'
import { ItemRespostaClima } from '../respostas-clima/item-resposta-clima.entity'
import { Pergunta } from '../perguntas/pergunta.entity'
import { Colaborador } from '../colaboradores/colaborador.entity'
import { PAPEIS_COM_ACESSO, buscarUniversoCiclos, classificarPorTipo, validarDataQuery } from './analise-comum'
import type { PeriodoConsulta } from './analise-comum'

/**
 * "Avaliações" — lista de respostas individuais de perguntas `texto_aberto`
 * (avaliação 360 + clima geral), com dois guard rails de anonimização
 * DIFERENTES entre si (ver task-backend.md, guard rails críticos nº 1 e nº
 * 2 — leia os comentários abaixo, eles não são redundantes com o guard rail
 * técnico de "Visão Geral"):
 *
 * GUARD RAIL CRÍTICO Nº 1: `ciclos_avaliacao.anonimizar_respostas_pares`
 * NUNCA é lida por nenhuma função deste arquivo — não é uma omissão, é uma
 * decisão de produto já fechada. A única coluna de `ciclos_avaliacao` lida
 * aqui é `minimo_respostas_pares` (`buscarMinimosPorCiclo`, com `select`
 * explícito, para nem sequer trazer a coluna irmã do banco). RH/admin NÃO
 * têm nenhum bypass do limiar — `garantirPapel` decide só "pode entrar na
 * tela", nunca "quanto vê dentro dela".
 *
 * GUARD RAIL CRÍTICO Nº 2: `rel.avaliador_id`/`avaliador.nome_completo`
 * nunca aparecem em `.select()`/`.addSelect()` de nenhuma query que também
 * projete texto de resposta `pares`/`subordinado` — o único uso permitido é
 * dentro de `COUNT(DISTINCT rel.avaliador_id)` no gate
 * (`calcularGateParesSubordinado`). Para `autoavaliacao`/`gestor`/`externo`
 * (`buscarIdentificadas360`), identidade junto do texto é esperada e
 * correta — não é uma violação deste guard rail.
 */

export interface TextoAbertoItem {
  perguntaId: string
  perguntaEnunciado: string
  texto: string
}

export interface AvaliacaoIdentificada {
  tipoRelacionamento: 'autoavaliacao' | 'gestor' | 'externo'
  cicloId: string
  avaliadoId: string
  avaliadoNome: string
  avaliadorId: string
  avaliadorNome: string
  perguntaId: string
  perguntaEnunciado: string
  texto: string
}

export interface GrupoParesSubordinado {
  cicloId: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: 'pares' | 'subordinado'
  totalRespondentes: number
  minimoNecessario: number
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  textos?: TextoAbertoItem[]
}

export interface GrupoClimaGeral {
  cicloId: string
  totalRespondentes: number
  minimoNecessario: number
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  textos?: TextoAbertoItem[]
}

export interface AvaliacoesAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  avaliacao360: {
    identificadas: AvaliacaoIdentificada[]
    paresSubordinado: GrupoParesSubordinado[]
  }
  climaGeral: GrupoClimaGeral[]
}

export interface BuscarAvaliacoesDto {
  de: unknown
  ate: unknown
  cicloId?: unknown
}

interface GateParesSubordinadoLinha {
  avaliadoId: string
  cicloId: string
  tipoRelacionamento: 'pares' | 'subordinado'
  totalRespondentes: number
}

interface GateClimaLinha {
  cicloId: string
  totalRespondentes: number
}

/** Fisher-Yates — embaralha uma cópia do array recebido, não muta o original. */
function embaralhar<T>(itens: T[]): T[] {
  const copia = [...itens]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = copia[i] as T
    copia[i] = copia[j] as T
    copia[j] = temp
  }
  return copia
}

// Identidade PROJETADA DELIBERADAMENTE — autoavaliacao/gestor/externo não
// têm terceiro a proteger (spec 3.2, guard rail crítico nº 2 do plano).
async function buscarIdentificadas360(
  ids: string[],
  periodo: PeriodoConsulta,
): Promise<AvaliacaoIdentificada[]> {
  if (ids.length === 0) return []

  const linhas = await AppDataSource.getRepository(ItemResposta)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', {
      tipoPergunta: 'texto_aberto',
    })
    .innerJoin(Resposta, 'resposta', 'resposta.id = item.resposta_id')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.id = resposta.envio_id')
    .innerJoin(RelacionamentoAvaliacao, 'rel', 'rel.id = envio.relacionamento_id')
    .innerJoin(Colaborador, 'avaliado', 'avaliado.id = rel.avaliado_id')
    .innerJoin(Colaborador, 'avaliador', 'avaliador.id = rel.avaliador_id')
    .select('rel.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect('rel.ciclo_id', 'cicloId')
    .addSelect('rel.avaliado_id', 'avaliadoId')
    .addSelect('avaliado.nome_completo', 'avaliadoNome')
    .addSelect('rel.avaliador_id', 'avaliadorId')
    .addSelect('avaliador.nome_completo', 'avaliadorNome')
    .addSelect('pergunta.id', 'perguntaId')
    .addSelect('pergunta.enunciado', 'perguntaEnunciado')
    .addSelect("item.valor ->> 'texto'", 'texto')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('rel.tipo_relacionamento IN (:...tipos)', { tipos: ['autoavaliacao', 'gestor', 'externo'] })
    .andWhere('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .andWhere("item.valor ->> 'texto' IS NOT NULL AND item.valor ->> 'texto' <> ''")
    .orderBy('avaliado.nome_completo')
    .addOrderBy('avaliador.nome_completo')
    .addOrderBy('pergunta.enunciado')
    .getRawMany<AvaliacaoIdentificada>()

  return linhas
}

// GATE: único uso permitido de avaliador_id no caminho pares/subordinado é
// DENTRO de COUNT(DISTINCT ...) — nunca projetado bruto (guard rail crítico nº 2).
// Decisão de modelagem 3: o corte de período aqui é o MESMO recorte usado
// depois em buscarTextosParesSubordinado — o conjunto de anonimato do gate
// precisa bater com o conjunto real exposto, senão um filtro de data
// estreito poderia reidentificar um respondente isolado.
async function calcularGateParesSubordinado(
  ids: string[],
  periodo: PeriodoConsulta,
): Promise<GateParesSubordinadoLinha[]> {
  if (ids.length === 0) return []

  const linhas = await AppDataSource.getRepository(RelacionamentoAvaliacao)
    .createQueryBuilder('rel')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.relacionamento_id = rel.id')
    .innerJoin(Resposta, 'resposta', 'resposta.envio_id = envio.id')
    .select('rel.avaliado_id', 'avaliadoId')
    .addSelect('rel.ciclo_id', 'cicloId')
    .addSelect('rel.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect('COUNT(DISTINCT rel.avaliador_id)', 'totalRespondentes')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('rel.tipo_relacionamento IN (:...tipos)', { tipos: ['pares', 'subordinado'] })
    .andWhere('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .groupBy('rel.avaliado_id')
    .addGroupBy('rel.ciclo_id')
    .addGroupBy('rel.tipo_relacionamento')
    .getRawMany<{ avaliadoId: string; cicloId: string; tipoRelacionamento: 'pares' | 'subordinado'; totalRespondentes: string }>()

  return linhas.map((l) => ({ ...l, totalRespondentes: Number(l.totalRespondentes) }))
}

// Recebe só os grupos que JÁ passaram no gate — nunca busca texto de grupo
// abaixo do limiar, nem transitoriamente em memória (defesa em profundidade,
// além do filtro em montarGruposParesSubordinado). NUNCA seleciona
// rel.avaliador_id (guard rail crítico nº 2).
async function buscarTextosParesSubordinado(
  grupos: Array<{ avaliadoId: string; cicloId: string; tipoRelacionamento: string }>,
  periodo: PeriodoConsulta,
): Promise<Map<string, TextoAbertoItem[]>> {
  const mapa = new Map<string, TextoAbertoItem[]>()
  if (grupos.length === 0) return mapa

  const qb = AppDataSource.getRepository(ItemResposta)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', {
      tipoPergunta: 'texto_aberto',
    })
    .innerJoin(Resposta, 'resposta', 'resposta.id = item.resposta_id')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.id = resposta.envio_id')
    .innerJoin(RelacionamentoAvaliacao, 'rel', 'rel.id = envio.relacionamento_id')
    .select('rel.avaliado_id', 'avaliadoId')
    .addSelect('rel.ciclo_id', 'cicloId')
    .addSelect('rel.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect('pergunta.id', 'perguntaId')
    .addSelect('pergunta.enunciado', 'perguntaEnunciado')
    .addSelect("item.valor ->> 'texto'", 'texto')
    .where('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .andWhere("item.valor ->> 'texto' IS NOT NULL AND item.valor ->> 'texto' <> ''")

  const condicoes: string[] = []
  const params: Record<string, unknown> = { de: periodo.de, ate: periodo.ate }
  grupos.forEach((g, i) => {
    condicoes.push(`(rel.avaliado_id = :avaliadoId${i} AND rel.ciclo_id = :cicloId${i} AND rel.tipo_relacionamento = :tipo${i})`)
    params[`avaliadoId${i}`] = g.avaliadoId
    params[`cicloId${i}`] = g.cicloId
    params[`tipo${i}`] = g.tipoRelacionamento
  })
  qb.andWhere(`(${condicoes.join(' OR ')})`, params)

  const linhas = await qb.getRawMany<{
    avaliadoId: string
    cicloId: string
    tipoRelacionamento: string
    perguntaId: string
    perguntaEnunciado: string
    texto: string
  }>()

  for (const l of linhas) {
    const chave = `${l.avaliadoId}|${l.cicloId}|${l.tipoRelacionamento}`
    const item: TextoAbertoItem = { perguntaId: l.perguntaId, perguntaEnunciado: l.perguntaEnunciado, texto: l.texto }
    mapa.set(chave, [...(mapa.get(chave) ?? []), item])
  }
  return mapa
}

function montarGruposParesSubordinado(
  gate: GateParesSubordinadoLinha[],
  minimosPorCiclo: Map<string, number>,
  nomes: Map<string, string>,
  textosPorGrupo: Map<string, TextoAbertoItem[]>,
): GrupoParesSubordinado[] {
  return gate.map((g) => {
    const minimo = minimosPorCiclo.get(g.cicloId) ?? 3
    const liberado = g.totalRespondentes >= minimo
    const chave = `${g.avaliadoId}|${g.cicloId}|${g.tipoRelacionamento}`
    return {
      cicloId: g.cicloId,
      avaliadoId: g.avaliadoId,
      avaliadoNome: nomes.get(g.avaliadoId) ?? '',
      tipoRelacionamento: g.tipoRelacionamento,
      totalRespondentes: g.totalRespondentes,
      minimoNecessario: minimo,
      liberado,
      ...(liberado
        ? { textos: embaralhar(textosPorGrupo.get(chave) ?? []) }
        : { motivo: 'aguardando_minimo_respondentes' as const }),
    }
  })
}

// GATE por CICLO INTEIRO — respostas_clima é estruturalmente anônima, não há
// avaliador_id a contar; a contagem aqui é de LINHAS de respostas_clima
// (decisão de modelagem 4), não de ciclo_participantes — mesmo raciocínio de
// conjunto de anonimato consistente do gate acima.
async function calcularGateClima(ids: string[], periodo: PeriodoConsulta): Promise<GateClimaLinha[]> {
  if (ids.length === 0) return []

  const linhas = await AppDataSource.getRepository(RespostaClima)
    .createQueryBuilder('rc')
    .select('rc.ciclo_id', 'cicloId')
    .addSelect('COUNT(rc.id)', 'totalRespondentes')
    .where('rc.ciclo_id IN (:...ids)', { ids })
    .andWhere('rc.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .groupBy('rc.ciclo_id')
    .getRawMany<{ cicloId: string; totalRespondentes: string }>()

  return linhas.map((l) => ({ cicloId: l.cicloId, totalRespondentes: Number(l.totalRespondentes) }))
}

// Só para ciclos JÁ liberados. respostas_clima/itens_resposta_clima não têm
// NENHUMA coluna de identidade — nada a excluir aqui além do texto em si.
async function buscarTextosClima(
  idsCiclosLiberados: string[],
  periodo: PeriodoConsulta,
): Promise<Map<string, TextoAbertoItem[]>> {
  const mapa = new Map<string, TextoAbertoItem[]>()
  if (idsCiclosLiberados.length === 0) return mapa

  const linhas = await AppDataSource.getRepository(ItemRespostaClima)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', {
      tipoPergunta: 'texto_aberto',
    })
    .innerJoin(RespostaClima, 'rc', 'rc.id = item.resposta_clima_id')
    .select('rc.ciclo_id', 'cicloId')
    .addSelect('pergunta.id', 'perguntaId')
    .addSelect('pergunta.enunciado', 'perguntaEnunciado')
    .addSelect("item.valor ->> 'texto'", 'texto')
    .where('rc.ciclo_id IN (:...ids)', { ids: idsCiclosLiberados })
    .andWhere('rc.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .andWhere("item.valor ->> 'texto' IS NOT NULL AND item.valor ->> 'texto' <> ''")
    .getRawMany<{ cicloId: string; perguntaId: string; perguntaEnunciado: string; texto: string }>()

  for (const l of linhas) {
    const item: TextoAbertoItem = { perguntaId: l.perguntaId, perguntaEnunciado: l.perguntaEnunciado, texto: l.texto }
    mapa.set(l.cicloId, [...(mapa.get(l.cicloId) ?? []), item])
  }
  return mapa
}

function montarGruposClima(
  gate: GateClimaLinha[],
  minimosPorCiclo: Map<string, number>,
  textosPorCiclo: Map<string, TextoAbertoItem[]>,
): GrupoClimaGeral[] {
  return gate.map((g) => {
    const minimo = minimosPorCiclo.get(g.cicloId) ?? 3
    const liberado = g.totalRespondentes >= minimo
    return {
      cicloId: g.cicloId,
      totalRespondentes: g.totalRespondentes,
      minimoNecessario: minimo,
      liberado,
      ...(liberado
        ? { textos: embaralhar(textosPorCiclo.get(g.cicloId) ?? []) }
        : { motivo: 'aguardando_minimo_respondentes' as const }),
    }
  })
}

// select explícito — NUNCA trazer anonimizarRespostasPares (guard rail crítico nº 1).
async function buscarMinimosPorCiclo(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()
  const ciclos = await AppDataSource.getRepository(CicloAvaliacao).find({
    where: { id: In(ids) },
    select: { id: true, minimoRespostasPares: true },
  })
  return new Map(ciclos.map((c) => [c.id, c.minimoRespostasPares]))
}

async function buscarNomesColaboradores(ids: string[]): Promise<Map<string, string>> {
  const idsUnicos = [...new Set(ids)]
  if (idsUnicos.length === 0) return new Map()
  const colaboradores = await AppDataSource.getRepository(Colaborador).find({
    where: { id: In(idsUnicos) },
    select: { id: true, nomeCompleto: true },
  })
  return new Map(colaboradores.map((c) => [c.id, c.nomeCompleto]))
}

/**
 * Única função exportada do módulo — lista de respostas individuais
 * `texto_aberto`, sempre restrita a admin/gestor_rh (`garantirPapel` como
 * primeira linha, nenhuma outra checagem de papel em nenhuma função privada
 * deste arquivo — ver guard rail crítico nº 1 no topo).
 */
export async function buscarAvaliacoes(
  ator: ColaboradorAutenticado,
  dto: BuscarAvaliacoesDto,
): Promise<AvaliacoesAnalise> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const de = validarDataQuery(dto.de, 'de')
  const ate = validarDataQuery(dto.ate, 'ate')

  if (ate < de) {
    throw new ErroHttp(422, 'PERIODO_INVALIDO', 'Campo "ate" deve ser maior ou igual a "de".')
  }

  let cicloId: string | null = null
  if (dto.cicloId !== undefined && dto.cicloId !== null && dto.cicloId !== '') {
    const cicloIdNormalizado = typeof dto.cicloId === 'string' ? dto.cicloId.trim() : dto.cicloId
    if (!ehUuidValido(cicloIdNormalizado)) {
      throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "cicloId" deve ser um uuid válido.')
    }
    await buscarCicloOuFalhar(cicloIdNormalizado)
    cicloId = cicloIdNormalizado
  }

  const periodo: PeriodoConsulta = { de, ate }

  const idsUniverso = await buscarUniversoCiclos(periodo, cicloId ?? undefined)

  if (idsUniverso.length === 0) {
    return { periodo, cicloId, avaliacao360: { identificadas: [], paresSubordinado: [] }, climaGeral: [] }
  }

  const { idsAval360, idsClima } = await classificarPorTipo(idsUniverso)

  const [identificadas, gateParesSubordinado, gateClima, minimosPorCiclo] = await Promise.all([
    buscarIdentificadas360(idsAval360, periodo),
    calcularGateParesSubordinado(idsAval360, periodo),
    calcularGateClima(idsClima, periodo),
    buscarMinimosPorCiclo(idsUniverso),
  ])

  const nomesAvaliados = await buscarNomesColaboradores(gateParesSubordinado.map((g) => g.avaliadoId))

  const gruposLiberados360 = gateParesSubordinado.filter(
    (g) => g.totalRespondentes >= (minimosPorCiclo.get(g.cicloId) ?? 3),
  )
  const textosPorGrupo360 = await buscarTextosParesSubordinado(gruposLiberados360, periodo)
  const paresSubordinado = montarGruposParesSubordinado(
    gateParesSubordinado,
    minimosPorCiclo,
    nomesAvaliados,
    textosPorGrupo360,
  )

  const idsClimaLiberados = gateClima
    .filter((g) => g.totalRespondentes >= (minimosPorCiclo.get(g.cicloId) ?? 3))
    .map((g) => g.cicloId)
  const textosPorCicloClima = await buscarTextosClima(idsClimaLiberados, periodo)
  const climaGeral = montarGruposClima(gateClima, minimosPorCiclo, textosPorCicloClima)

  return { periodo, cicloId, avaliacao360: { identificadas, paresSubordinado }, climaGeral }
}
