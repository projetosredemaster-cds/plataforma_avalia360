import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { ErroHttp } from '../../common/erro-http'
import { ehUuidValido } from '../../common/uuid'
import { validarEnum } from '../../common/validacao'
import { CARGO_COLABORADOR_VALORES, type TipoRelacionamento } from '../../common/enums'
import type { ColaboradorAutenticado } from '../../types/express'
import { buscarCicloOuFalhar } from '../ciclos-avaliacao/ciclos-avaliacao.service'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'
import { Resposta } from '../respostas/resposta.entity'
import { ItemResposta } from '../respostas/item-resposta.entity'
import { Pergunta } from '../perguntas/pergunta.entity'
import { Colaborador } from '../colaboradores/colaborador.entity'
import { Equipe } from '../equipes/equipe.entity'
import {
  PAPEIS_COM_ACESSO,
  arredondar1,
  calcularGateParesSubordinado,
  classificarPorTipo,
} from './analise-comum'

/**
 * Tela "Ranking" — mesmo módulo `analise/`, arquivo dedicado (guard rails
 * diferentes de "Visão Geral"/"Avaliações": nenhum COUNT exato de
 * respondentes/membros pode ser exposto no payload, e
 * `ciclos_avaliacao.anonimizar_respostas_pares` NUNCA é lida — ver
 * task-backend.md, GUARD RAIL CRÍTICO Nº 1 e Nº 2). RH/admin NÃO têm bypass
 * do limiar `minimo_respostas_pares` — `garantirPapel` é a única checagem de
 * papel de toda a função, sem nenhum `if (ator.papel === 'admin')` alterando
 * o resultado do gate.
 */

export type ModoRanking = 'avaliado' | 'equipe'
export type MetricaRanking = 'likert' | 'matriz'
export type OrdemRanking = 'asc' | 'desc'

export interface RankingAvaliadoLinha {
  posicao: number | null
  avaliadoId: string
  avaliadoNome: string
  cargo: string | null
  equipeNome: string | null
  mediaLikert: number | null
  mediaMatriz: number | null
  paresInsuficiente: boolean
  subordinadoInsuficiente: boolean
}

export interface RankingEquipeLinha {
  posicao: number | null
  equipeId: string
  equipeNome: string
  mediaLikert: number | null
  mediaMatriz: number | null
  dadosInsuficientesLikert: boolean
  dadosInsuficientesMatriz: boolean
}

export interface RankingAvaliadoAnalise {
  cicloId: string
  modo: 'avaliado'
  ordenarPor: MetricaRanking
  ordem: OrdemRanking
  linhas: RankingAvaliadoLinha[]
}

export interface RankingEquipeAnalise {
  cicloId: string
  modo: 'equipe'
  ordenarPor: MetricaRanking
  ordem: OrdemRanking
  linhas: RankingEquipeLinha[]
}

export type RankingAnalise = RankingAvaliadoAnalise | RankingEquipeAnalise

export interface BuscarRankingDto {
  cicloId: unknown
  modo?: unknown
  cargo?: unknown
  equipeId?: unknown
  ordenarPor?: unknown
  ordem?: unknown
}

const LIMIAR_MINIMO_MEMBROS_EQUIPE = 5

interface LinhaUniversoAvaliado {
  avaliadoId: string
  avaliadoNome: string
  cargo: string | null
  equipeId: string | null
  equipeNome: string | null
}

interface LinhaAgregada {
  avaliadoId: string
  tipoRelacionamento: TipoRelacionamento
  somaPct: number
  quantidade: number
}

type ChaveGate = string // `${avaliadoId}|${tipoRelacionamento}`

function chaveGate(avaliadoId: string, tipo: string): ChaveGate {
  return `${avaliadoId}|${tipo}`
}

/**
 * Universo de avaliados do ciclo — define QUEM aparece no ranking,
 * independente de já ter resposta computável ou não (ciclos em andamento
 * podem ter avaliados ainda sem nota calculável, que devem aparecer com
 * `null`, não desaparecer da lista). Fonte: DISTINCT avaliado_id de
 * `relacionamentos_avaliacao`, já trazendo os campos de exibição.
 */
async function buscarUniversoAvaliados(
  cicloId: string,
  filtros: { cargo?: string | undefined; equipeId?: string | undefined },
): Promise<LinhaUniversoAvaliado[]> {
  const qb = AppDataSource.getRepository(RelacionamentoAvaliacao)
    .createQueryBuilder('rel')
    .innerJoin(Colaborador, 'avaliado', 'avaliado.id = rel.avaliado_id')
    .leftJoin(Equipe, 'equipe', 'equipe.id = avaliado.equipe_id')
    .select('rel.avaliado_id', 'avaliadoId')
    .addSelect('avaliado.nome_completo', 'avaliadoNome')
    .addSelect('avaliado.cargo', 'cargo')
    .addSelect('avaliado.equipe_id', 'equipeId')
    .addSelect('equipe.nome', 'equipeNome')
    .where('rel.ciclo_id = :cicloId', { cicloId })
    .distinct(true)

  if (filtros.cargo) qb.andWhere('avaliado.cargo = :cargo', { cargo: filtros.cargo })
  if (filtros.equipeId) qb.andWhere('avaliado.equipe_id = :equipeId', { equipeId: filtros.equipeId })

  return qb.getRawMany<LinhaUniversoAvaliado>()
}

/**
 * Agregação `likert`: `SUM(pct)` + `COUNT(*)` por avaliado + tipo de
 * relacionamento — normalização por percentual usando o `niveis` da própria
 * pergunta (spec 5.1). Nenhuma coluna de identidade do avaliador é
 * selecionada (guard rail de anonimização).
 */
async function agregarLikertPorAvaliado(
  cicloId: string,
  filtros: { cargo?: string | undefined; equipeId?: string | undefined },
): Promise<LinhaAgregada[]> {
  const qb = AppDataSource.getRepository(ItemResposta)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', {
      tipoPergunta: 'likert',
    })
    .innerJoin(Resposta, 'resposta', 'resposta.id = item.resposta_id')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.id = resposta.envio_id')
    .innerJoin(RelacionamentoAvaliacao, 'rel', 'rel.id = envio.relacionamento_id')
    .innerJoin(Colaborador, 'avaliado', 'avaliado.id = rel.avaliado_id')
    .select('rel.avaliado_id', 'avaliadoId')
    .addSelect('rel.tipo_relacionamento', 'tipoRelacionamento')
    // pct = (nota-1)/(niveis-1)*100, niveis da PRÓPRIA pergunta (spec 5.1)
    .addSelect(
      "SUM(((item.valor ->> 'nota')::numeric - 1) / ((pergunta.configuracao ->> 'niveis')::numeric - 1) * 100)",
      'somaPct',
    )
    .addSelect('COUNT(*)', 'quantidade')
    .where('rel.ciclo_id = :cicloId', { cicloId })
    // defesa contra divisão por zero — schema valida niveis 2..10, mas a query se defende sozinha
    .andWhere("(pergunta.configuracao ->> 'niveis')::int > 1")
    .groupBy('rel.avaliado_id')
    .addGroupBy('rel.tipo_relacionamento')

  if (filtros.cargo) qb.andWhere('avaliado.cargo = :cargo', { cargo: filtros.cargo })
  if (filtros.equipeId) qb.andWhere('avaliado.equipe_id = :equipeId', { equipeId: filtros.equipeId })

  const linhas = await qb.getRawMany<{
    avaliadoId: string
    tipoRelacionamento: TipoRelacionamento
    somaPct: string
    quantidade: string
  }>()
  return linhas.map((l) => ({ ...l, somaPct: Number(l.somaPct), quantidade: Number(l.quantidade) }))
}

/**
 * Agregação `matriz`: expande `item.valor->'notas'` via `jsonb_each_text`/
 * LATERAL ANTES de normalizar (spec 5.5 — cada competência respondida é 1
 * linha/unidade individual). `QueryBuilder` do TypeORM não suporta
 * `CROSS JOIN LATERAL` com alias de tabela-função de primeira classe — usa
 * `AppDataSource.query()` com SQL parametrizado POSICIONAL
 * (`$1`/`$2`/...); nunca interpola `cargo`/`equipeId`/`cicloId` como string
 * concatenada.
 */
async function agregarMatrizPorAvaliado(
  cicloId: string,
  filtros: { cargo?: string | undefined; equipeId?: string | undefined },
): Promise<LinhaAgregada[]> {
  const params: unknown[] = [cicloId]
  let filtroCargoSql = ''
  let filtroEquipeSql = ''
  if (filtros.cargo) {
    params.push(filtros.cargo)
    filtroCargoSql = `AND avaliado.cargo = $${params.length}`
  }
  if (filtros.equipeId) {
    params.push(filtros.equipeId)
    filtroEquipeSql = `AND avaliado.equipe_id = $${params.length}`
  }

  const sql = `
    SELECT rel.avaliado_id AS "avaliadoId",
           rel.tipo_relacionamento AS "tipoRelacionamento",
           SUM((notas.valor::numeric - 1) / ((pergunta.configuracao ->> 'niveis')::numeric - 1) * 100) AS "somaPct",
           COUNT(*) AS "quantidade"
    FROM itens_resposta item
    JOIN perguntas pergunta ON pergunta.id = item.pergunta_id AND pergunta.tipo = 'matriz'
    JOIN respostas resposta ON resposta.id = item.resposta_id
    JOIN envios_pesquisa envio ON envio.id = resposta.envio_id
    JOIN relacionamentos_avaliacao rel ON rel.id = envio.relacionamento_id
    JOIN colaboradores avaliado ON avaliado.id = rel.avaliado_id
    CROSS JOIN LATERAL jsonb_each_text(item.valor -> 'notas') AS notas(chave, valor)
    WHERE rel.ciclo_id = $1
      AND (pergunta.configuracao ->> 'niveis')::int > 1
      ${filtroCargoSql}
      ${filtroEquipeSql}
    GROUP BY rel.avaliado_id, rel.tipo_relacionamento
  `

  const linhas = await AppDataSource.query(sql, params)
  return linhas.map(
    (l: { avaliadoId: string; tipoRelacionamento: TipoRelacionamento; somaPct: string; quantidade: string }) => ({
      avaliadoId: l.avaliadoId,
      tipoRelacionamento: l.tipoRelacionamento,
      somaPct: Number(l.somaPct),
      quantidade: Number(l.quantidade),
    }),
  )
}

async function buscarMinimosPorCiclo(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()
  const ciclos = await AppDataSource.getRepository(CicloAvaliacao).find({
    where: { id: In(ids) },
    select: { id: true, minimoRespostasPares: true },
  })
  return new Map(ciclos.map((c) => [c.id, c.minimoRespostasPares]))
}

/**
 * Guard rail: autoavaliacao/gestor/externo SEMPRE entram (relações 1:1, sem
 * terceiro a proteger — spec seção 2, mesmo critério de "Avaliações" seção
 * 3.2). pares/subordinado só entram se o gate compartilhado liberar. Nunca
 * lê `anonimizarRespostasPares`, nunca expõe `totalRespondentes`. Soma
 * ponderada (`SUM(pct)/COUNT(*)`), nunca média aritmética das médias de
 * cada tipo de relacionamento.
 */
function comporMediasPorAvaliado(
  linhas: LinhaAgregada[],
  gate: Map<ChaveGate, number>,
  minimo: number,
): Map<string, { soma: number; qtd: number }> {
  const acc = new Map<string, { soma: number; qtd: number }>()
  for (const linha of linhas) {
    const elegivel =
      linha.tipoRelacionamento === 'autoavaliacao' ||
      linha.tipoRelacionamento === 'gestor' ||
      linha.tipoRelacionamento === 'externo' ||
      (gate.get(chaveGate(linha.avaliadoId, linha.tipoRelacionamento)) ?? 0) >= minimo
    if (!elegivel) continue
    const atual = acc.get(linha.avaliadoId) ?? { soma: 0, qtd: 0 }
    atual.soma += linha.somaPct
    atual.qtd += linha.quantidade
    acc.set(linha.avaliadoId, atual)
  }
  return acc
}

function mediaDoMapa(acc: Map<string, { soma: number; qtd: number }>, avaliadoId: string): number | null {
  const entrada = acc.get(avaliadoId)
  if (!entrada || entrada.qtd === 0) return null
  return arredondar1(entrada.soma / entrada.qtd)
}

/**
 * Decisão explícita: se não existe NENHUM relacionamento pares/subordinado
 * respondido para aquele avaliado (0 respondentes, sem linha de gate),
 * `paresInsuficiente`/`subordinadoInsuficiente` retornam `true` (mesmo valor
 * que "existem respondentes, mas abaixo do mínimo") — seguro (nunca expõe
 * mais do que "insuficiente" em nenhum dos dois casos), sem introduzir um
 * terceiro estado "não aplicável".
 */
function calcularInsuficiencia(
  avaliadoId: string,
  tipo: 'pares' | 'subordinado',
  gate: Map<ChaveGate, number>,
  minimo: number,
): boolean {
  const total = gate.get(chaveGate(avaliadoId, tipo)) ?? 0
  return total < minimo
}

interface NotaAvaliadoParaEquipe {
  equipeId: string | null
  equipeNome: string | null
  mediaLikert: number | null
  mediaMatriz: number | null
}

function media(valores: number[]): number {
  return valores.reduce((soma, v) => soma + v, 0) / valores.length
}

/**
 * Modo equipe: agrupamento em JS sobre as médias por avaliado já calculadas
 * (nunca uma query SQL nova com GROUP BY equipe_id — spec 5.4, média simples
 * dos membros, não ponderada). Limiar de 5 membros com nota calculável,
 * aplicado SEPARADAMENTE por métrica (likert/matriz) — controle cumulativo e
 * DIFERENTE do gate de pares/subordinado (mitiga inferência da nota de um
 * membro por subtração a partir da média já calculada da equipe). Nunca
 * expõe `grupo.likerts.length`/`grupo.matrizes.length` em nenhum campo do
 * retorno — só os booleanos.
 */
function agruparPorEquipe(avaliados: NotaAvaliadoParaEquipe[]): RankingEquipeLinha[] {
  const porEquipe = new Map<string, { equipeNome: string; likerts: number[]; matrizes: number[] }>()

  for (const av of avaliados) {
    if (!av.equipeId) continue // colaborador sem equipe não entra em nenhum grupo
    const grupo = porEquipe.get(av.equipeId) ?? { equipeNome: av.equipeNome ?? '', likerts: [], matrizes: [] }
    if (av.mediaLikert !== null) grupo.likerts.push(av.mediaLikert)
    if (av.mediaMatriz !== null) grupo.matrizes.push(av.mediaMatriz)
    porEquipe.set(av.equipeId, grupo)
  }

  return [...porEquipe.entries()].map(([equipeId, grupo]) => {
    const likertLiberado = grupo.likerts.length >= LIMIAR_MINIMO_MEMBROS_EQUIPE
    const matrizLiberado = grupo.matrizes.length >= LIMIAR_MINIMO_MEMBROS_EQUIPE
    return {
      posicao: null, // preenchido depois, na ordenação
      equipeId,
      equipeNome: grupo.equipeNome,
      mediaLikert: likertLiberado ? arredondar1(media(grupo.likerts)) : null,
      mediaMatriz: matrizLiberado ? arredondar1(media(grupo.matrizes)) : null,
      dadosInsuficientesLikert: !likertLiberado,
      dadosInsuficientesMatriz: !matrizLiberado,
    }
  })
}

/**
 * Ordenação/posição com semântica `RANK()` (empate = mesma posição, pula a
 * posição seguinte — spec 5.2), calculada em memória: a lista final só
 * existe depois da composição em JS (gate + agrupamento), então não há
 * `ORDER BY`/`RANK()` no banco. Linhas com `media === null` na métrica de
 * ordenação vão para o fim, sem posição atribuída.
 */
function calcularPosicoes<T>(
  linhas: T[],
  obterValor: (linha: T) => number | null,
  ordem: OrdemRanking,
): Array<T & { posicao: number | null }> {
  const comNota = linhas.filter((l) => obterValor(l) !== null)
  const semNota = linhas.filter((l) => obterValor(l) === null)

  comNota.sort((a, b) => {
    const va = obterValor(a) as number
    const vb = obterValor(b) as number
    return ordem === 'desc' ? vb - va : va - vb
  })

  const resultado: Array<T & { posicao: number | null }> = []
  let posicaoAtual = 0
  let valorAnterior: number | null = null
  comNota.forEach((linha, indice) => {
    const valor = obterValor(linha) as number
    if (valorAnterior === null || valor !== valorAnterior) {
      posicaoAtual = indice + 1
    }
    resultado.push({ ...linha, posicao: posicaoAtual })
    valorAnterior = valor
  })

  semNota.forEach((linha) => resultado.push({ ...linha, posicao: null }))
  return resultado
}

/**
 * Única função exportada — cálculo do ranking, restrito a admin/gestor_rh
 * (`garantirPapel` é a ÚNICA checagem de papel de toda a função, sem bypass
 * de papel para o gate de pares/subordinado ou para o limiar de 5 membros
 * — GUARD RAIL CRÍTICO Nº 1 de task-backend.md). Nenhuma query desta função
 * lê/filtra por `ciclos_avaliacao.anonimizar_respostas_pares` — a única
 * coluna de `ciclos_avaliacao` lida é `minimo_respostas_pares`
 * (`buscarMinimosPorCiclo`, `select` explícito). Nenhum campo numérico de
 * contagem de respondentes/membros é exposto no payload — GUARD RAIL
 * CRÍTICO Nº 2.
 */
export async function buscarRanking(
  ator: ColaboradorAutenticado,
  dto: BuscarRankingDto,
): Promise<RankingAnalise> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  // 1. cicloId obrigatório
  if (typeof dto.cicloId !== 'string' || !ehUuidValido(dto.cicloId.trim())) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "cicloId" é obrigatório e deve ser um uuid válido.')
  }
  const cicloId = dto.cicloId.trim()
  await buscarCicloOuFalhar(cicloId) // 404 CICLO_NAO_ENCONTRADO

  const { idsAval360 } = await classificarPorTipo([cicloId])
  if (!idsAval360.includes(cicloId)) {
    throw new ErroHttp(422, 'CICLO_NAO_E_AVALIACAO_360', 'Ranking só está disponível para ciclos de avaliação 360.')
  }

  // 2. modo
  const modo: ModoRanking =
    dto.modo === undefined || dto.modo === null || dto.modo === ''
      ? 'avaliado'
      : validarEnum(dto.modo, ['avaliado', 'equipe'], 'modo')

  // 3. cargo (incompatível com modo equipe — checar ANTES de validar o valor)
  const cargoBruto = dto.cargo
  const temCargo = cargoBruto !== undefined && cargoBruto !== null && cargoBruto !== ''
  if (temCargo && modo === 'equipe') {
    throw new ErroHttp(422, 'FILTRO_INCOMPATIVEL_COM_MODO', 'O filtro "cargo" não é aplicável no modo "equipe".')
  }
  const cargo = temCargo ? validarEnum(cargoBruto, CARGO_COLABORADOR_VALORES, 'cargo') : undefined

  // 4. equipeId
  const equipeIdBruto = dto.equipeId
  const temEquipeId = equipeIdBruto !== undefined && equipeIdBruto !== null && equipeIdBruto !== ''
  if (temEquipeId && (typeof equipeIdBruto !== 'string' || !ehUuidValido(equipeIdBruto.trim()))) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "equipeId" deve ser um uuid válido.')
  }
  const equipeId = temEquipeId ? (equipeIdBruto as string).trim() : undefined

  // 5. ordenarPor / ordem
  const ordenarPor: MetricaRanking =
    dto.ordenarPor === undefined || dto.ordenarPor === null || dto.ordenarPor === ''
      ? 'likert'
      : validarEnum(dto.ordenarPor, ['likert', 'matriz'], 'ordenarPor')
  const ordem: OrdemRanking =
    dto.ordem === undefined || dto.ordem === null || dto.ordem === ''
      ? 'desc'
      : validarEnum(dto.ordem, ['desc', 'asc'], 'ordem')

  const filtros = { cargo, equipeId }

  const [universo, linhasLikert, linhasMatriz, gateLinhas, minimosPorCiclo] = await Promise.all([
    buscarUniversoAvaliados(cicloId, filtros),
    agregarLikertPorAvaliado(cicloId, filtros),
    agregarMatrizPorAvaliado(cicloId, filtros),
    calcularGateParesSubordinado([cicloId]), // SEM periodo — gate sobre o ciclo inteiro
    buscarMinimosPorCiclo([cicloId]),
  ])

  if (universo.length === 0) {
    return { cicloId, modo, ordenarPor, ordem, linhas: [] } as RankingAnalise
  }

  const minimo = minimosPorCiclo.get(cicloId) ?? 3
  const gate = new Map(gateLinhas.map((g) => [chaveGate(g.avaliadoId, g.tipoRelacionamento), g.totalRespondentes]))

  const accLikert = comporMediasPorAvaliado(linhasLikert, gate, minimo)
  const accMatriz = comporMediasPorAvaliado(linhasMatriz, gate, minimo)

  const linhasAvaliado: RankingAvaliadoLinha[] = universo.map((u) => ({
    posicao: null,
    avaliadoId: u.avaliadoId,
    avaliadoNome: u.avaliadoNome,
    cargo: u.cargo,
    equipeNome: u.equipeNome,
    mediaLikert: mediaDoMapa(accLikert, u.avaliadoId),
    mediaMatriz: mediaDoMapa(accMatriz, u.avaliadoId),
    paresInsuficiente: calcularInsuficiencia(u.avaliadoId, 'pares', gate, minimo),
    subordinadoInsuficiente: calcularInsuficiencia(u.avaliadoId, 'subordinado', gate, minimo),
  }))

  if (modo === 'avaliado') {
    const linhas = calcularPosicoes(linhasAvaliado, (l) => (ordenarPor === 'likert' ? l.mediaLikert : l.mediaMatriz), ordem)
    return { cicloId, modo, ordenarPor, ordem, linhas }
  }

  // modo === 'equipe'
  const paraAgrupar: NotaAvaliadoParaEquipe[] = universo.map((u) => ({
    equipeId: u.equipeId,
    equipeNome: u.equipeNome,
    mediaLikert: mediaDoMapa(accLikert, u.avaliadoId),
    mediaMatriz: mediaDoMapa(accMatriz, u.avaliadoId),
  }))
  const linhasEquipeSemPosicao = agruparPorEquipe(paraAgrupar)
  const linhas = calcularPosicoes(
    linhasEquipeSemPosicao,
    (l) => (ordenarPor === 'likert' ? l.mediaLikert : l.mediaMatriz),
    ordem,
  )
  return { cicloId, modo, ordenarPor, ordem, linhas }
}
