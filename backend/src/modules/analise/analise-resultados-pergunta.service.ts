import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { ErroHttp } from '../../common/erro-http'
import { ehUuidValido } from '../../common/uuid'
import type { TipoRelacionamento } from '../../common/enums'
import type { ColaboradorAutenticado } from '../../types/express'
import { buscarCicloOuFalhar } from '../ciclos-avaliacao/ciclos-avaliacao.service'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'
import { Resposta } from '../respostas/resposta.entity'
import { ItemResposta } from '../respostas/item-resposta.entity'
import { ItemRespostaClima } from '../respostas-clima/item-resposta-clima.entity'
import { RespostaClima } from '../respostas-clima/resposta-clima.entity'
import { Pergunta } from '../perguntas/pergunta.entity'
import { PaginaPesquisa } from '../paginas-pesquisa/pagina-pesquisa.entity'
import { Pesquisa } from '../pesquisas/pesquisa.entity'
import { Competencia } from '../competencias/competencia.entity'
import {
  PAPEIS_COM_ACESSO,
  buscarUniversoCiclos,
  calcularGateClima,
  calcularGateParesSubordinado,
  buscarMinimosPorCiclo,
  classificarPorTipo,
  validarDataQuery,
} from './analise-comum'
import type { PeriodoConsulta } from './analise-comum'

/**
 * Tela "Resultados por Pergunta" — mesmo módulo `analise/`, arquivo dedicado.
 * Esta é a tela MAIS ESTRITA do módulo até aqui: o payload NUNCA expõe
 * `totalRespondentes`/`minimoNecessario` (diferente de "Avaliações") — só
 * `liberado: boolean` + `motivo?: 'aguardando_minimo_respondentes'`. RH/admin
 * NÃO têm bypass do gate — `garantirPapel` é a ÚNICA checagem de papel de
 * toda a função `buscarResultadosPergunta`, sem nenhum
 * `if (ator.papel === 'admin')` alterando o resultado de um gate.
 * `ciclos_avaliacao.anonimizar_respostas_pares` NUNCA é lida — a única
 * coluna de `ciclos_avaliacao` tocada é `minimo_respostas_pares`, via
 * `buscarMinimosPorCiclo` (`analise-comum.ts`, `select` explícito). Nenhuma
 * query deste arquivo seleciona `avaliador_id` bruto — o único uso permitido
 * é dentro de `COUNT(DISTINCT rel.avaliador_id)`, encapsulado em
 * `calcularGateParesSubordinado` (`analise-comum.ts`).
 */

export interface ContagemNivel {
  nivel: number
  contagem: number
}

export interface ContagemOpcao {
  opcao: string
  contagem: number
}

export interface DistribuicaoTipoRelacionamento {
  tipoRelacionamento: TipoRelacionamento
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  distribuicao?: ContagemNivel[] // ausente quando liberado === false
}

export interface DistribuicaoOpcaoTipoRelacionamento {
  tipoRelacionamento: TipoRelacionamento
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  distribuicao?: ContagemOpcao[]
}

export interface CompetenciaDistribuicao {
  competenciaId: string
  competenciaNome: string
  porTipoRelacionamento: DistribuicaoTipoRelacionamento[]
}

interface ResultadoPerguntaBase360 {
  perguntaId: string
  perguntaEnunciado: string
  cicloId: string
  nomeCiclo: string
}

export interface ResultadoPerguntaLikert360 extends ResultadoPerguntaBase360 {
  tipo: 'likert'
  niveis: number
  rotulos: string[] // rotulos[i] é o rótulo do nível i+1 — mesma escala configurada em perguntas.configuracao
  porTipoRelacionamento: DistribuicaoTipoRelacionamento[]
}

export interface ResultadoPerguntaMatriz360 extends ResultadoPerguntaBase360 {
  tipo: 'matriz'
  niveis: number
  rotulos: string[] // escala compartilhada por TODAS as competências da pergunta (mesma configuracao)
  competencias: CompetenciaDistribuicao[] // ordenadas por competenciaNome (pt-BR)
}

export interface ResultadoPerguntaCaixaSelecao360 extends ResultadoPerguntaBase360 {
  tipo: 'caixa_selecao'
  opcoesDisponiveis: string[]
  porTipoRelacionamento: DistribuicaoOpcaoTipoRelacionamento[]
}

export type ResultadoPergunta360 =
  | ResultadoPerguntaLikert360
  | ResultadoPerguntaMatriz360
  | ResultadoPerguntaCaixaSelecao360

interface ResultadoPerguntaBaseClima {
  perguntaId: string
  perguntaEnunciado: string
  cicloId: string
  nomeCiclo: string
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
}

export interface ResultadoPerguntaLikertClima extends ResultadoPerguntaBaseClima {
  tipo: 'likert'
  niveis: number
  rotulos: string[]
  distribuicao?: ContagemNivel[] // ausente quando liberado === false
}

export interface ResultadoPerguntaMatrizClima extends ResultadoPerguntaBaseClima {
  tipo: 'matriz'
  niveis: number
  rotulos: string[]
  competencias?: Array<{ competenciaId: string; competenciaNome: string; distribuicao: ContagemNivel[] }>
}

export interface ResultadoPerguntaCaixaSelecaoClima extends ResultadoPerguntaBaseClima {
  tipo: 'caixa_selecao'
  opcoesDisponiveis: string[]
  distribuicao?: ContagemOpcao[]
}

export type ResultadoPerguntaClima =
  | ResultadoPerguntaLikertClima
  | ResultadoPerguntaMatrizClima
  | ResultadoPerguntaCaixaSelecaoClima

export interface ResultadosPerguntaAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  avaliacao360: ResultadoPergunta360[]
  climaGeral: ResultadoPerguntaClima[]
}

export interface BuscarResultadosPerguntaDto {
  de: unknown
  ate: unknown
  cicloId?: unknown
}

/**
 * Ordem fixa e determinística de `tipoRelacionamento` dentro de
 * `porTipoRelacionamento` — nunca ordem de inserção do Map (que depende da
 * ordem de chegada das linhas do banco).
 */
const ORDEM_TIPOS_RELACIONAMENTO: TipoRelacionamento[] = [
  'autoavaliacao',
  'gestor',
  'pares',
  'subordinado',
  'externo',
]

// --- 3. Funções auxiliares privadas de metadado (sem tocar em conteúdo de resposta) ---

async function buscarNomesCiclos(ids: string[]): Promise<Map<string, string>> {
  const idsUnicos = [...new Set(ids)]
  if (idsUnicos.length === 0) return new Map()
  const ciclos = await AppDataSource.getRepository(CicloAvaliacao).find({
    where: { id: In(idsUnicos) },
    select: { id: true, nome: true },
  })
  return new Map(ciclos.map((c) => [c.id, c.nome]))
}

async function buscarNomesCompetencias(ids: string[]): Promise<Map<string, string>> {
  const idsUnicos = [...new Set(ids)]
  if (idsUnicos.length === 0) return new Map()
  const competencias = await AppDataSource.getRepository(Competencia).find({
    where: { id: In(idsUnicos) },
    select: { id: true, nome: true },
  })
  return new Map(competencias.map((c) => [c.id, c.nome]))
}

interface MetadadosPergunta {
  ordem: number
  configuracao: Record<string, unknown>
}

async function buscarMetadadosPerguntas(ids: string[]): Promise<Map<string, MetadadosPergunta>> {
  const idsUnicos = [...new Set(ids)]
  if (idsUnicos.length === 0) return new Map()
  const perguntas = await AppDataSource.getRepository(Pergunta).find({
    where: { id: In(idsUnicos) },
    select: { id: true, ordem: true, configuracao: true },
  })
  return new Map(perguntas.map((p) => [p.id, { ordem: p.ordem, configuracao: p.configuracao }]))
}

function extrairNiveis(configuracao: Record<string, unknown>): number {
  return Number((configuracao as { niveis?: unknown }).niveis ?? 0)
}

/** rotulos[i] é o texto do nível i+1 — mesmo array validado pelo backend em
 * `perguntas.service.ts` (`configuracao.rotulos.length === niveis`, sem
 * strings vazias) para likert/matriz. Metadado estrutural de configuração de
 * pergunta, não conteúdo de resposta — seguro expor mesmo quando bloqueado
 * (mesmo critério já usado para `niveis`/`opcoesDisponiveis`). */
function extrairRotulos(configuracao: Record<string, unknown>): string[] {
  return ((configuracao as { rotulos?: unknown }).rotulos as string[] | undefined) ?? []
}

function extrairOpcoesConfiguradas(configuracao: Record<string, unknown>): string[] {
  return ((configuracao as { opcoes?: unknown }).opcoes as string[] | undefined) ?? []
}

// --- 4. Queries de agregação — avaliacao_360 (GROUP BY inclui avaliado_id — nunca avaliador_id) ---

interface LinhaNivel360 {
  perguntaId: string
  perguntaEnunciado: string
  avaliadoId: string
  cicloId: string
  tipoRelacionamento: TipoRelacionamento
  nivel: number
  contagem: number
}

async function agregarLikert360(ids: string[], periodo: PeriodoConsulta): Promise<LinhaNivel360[]> {
  if (ids.length === 0) return []
  const linhas = await AppDataSource.getRepository(ItemResposta)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', {
      tipoPergunta: 'likert',
    })
    .innerJoin(Resposta, 'resposta', 'resposta.id = item.resposta_id')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.id = resposta.envio_id')
    .innerJoin(RelacionamentoAvaliacao, 'rel', 'rel.id = envio.relacionamento_id')
    .select('pergunta.id', 'perguntaId')
    .addSelect('pergunta.enunciado', 'perguntaEnunciado')
    .addSelect('rel.avaliado_id', 'avaliadoId')
    .addSelect('rel.ciclo_id', 'cicloId')
    .addSelect('rel.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect("(item.valor ->> 'nota')::int", 'nivel')
    .addSelect('COUNT(*)', 'contagem')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .groupBy('pergunta.id')
    .addGroupBy('pergunta.enunciado')
    .addGroupBy('rel.avaliado_id')
    .addGroupBy('rel.ciclo_id')
    .addGroupBy('rel.tipo_relacionamento')
    .addGroupBy("(item.valor ->> 'nota')::int")
    .getRawMany<{
      perguntaId: string
      perguntaEnunciado: string
      avaliadoId: string
      cicloId: string
      tipoRelacionamento: TipoRelacionamento
      nivel: number
      contagem: string
    }>()

  return linhas.map((l) => ({ ...l, contagem: Number(l.contagem) }))
}

interface LinhaCompetenciaNivel360 extends LinhaNivel360 {
  competenciaId: string
}

async function agregarMatriz360(ids: string[], periodo: PeriodoConsulta): Promise<LinhaCompetenciaNivel360[]> {
  if (ids.length === 0) return []
  const sql = `
    SELECT pergunta.id AS "perguntaId",
           pergunta.enunciado AS "perguntaEnunciado",
           rel.avaliado_id AS "avaliadoId",
           rel.ciclo_id AS "cicloId",
           rel.tipo_relacionamento AS "tipoRelacionamento",
           notas.chave AS "competenciaId",
           notas.valor::int AS "nivel",
           COUNT(*) AS "contagem"
    FROM itens_resposta item
    JOIN perguntas pergunta ON pergunta.id = item.pergunta_id AND pergunta.tipo = 'matriz'
    JOIN respostas resposta ON resposta.id = item.resposta_id
    JOIN envios_pesquisa envio ON envio.id = resposta.envio_id
    JOIN relacionamentos_avaliacao rel ON rel.id = envio.relacionamento_id
    CROSS JOIN LATERAL jsonb_each_text(item.valor -> 'notas') AS notas(chave, valor)
    WHERE rel.ciclo_id = ANY($1::uuid[])
      AND resposta.respondido_em::date BETWEEN $2::date AND $3::date
    GROUP BY pergunta.id, pergunta.enunciado, rel.avaliado_id, rel.ciclo_id,
             rel.tipo_relacionamento, notas.chave, notas.valor
  `
  const linhas = await AppDataSource.query(sql, [ids, periodo.de, periodo.ate])
  return linhas.map((l: LinhaCompetenciaNivel360 & { contagem: string }) => ({ ...l, contagem: Number(l.contagem) }))
}

interface LinhaOpcao360 {
  perguntaId: string
  perguntaEnunciado: string
  avaliadoId: string
  cicloId: string
  tipoRelacionamento: TipoRelacionamento
  opcao: string
  contagem: number
}

async function agregarCaixaSelecao360(ids: string[], periodo: PeriodoConsulta): Promise<LinhaOpcao360[]> {
  if (ids.length === 0) return []
  const sql = `
    SELECT pergunta.id AS "perguntaId",
           pergunta.enunciado AS "perguntaEnunciado",
           rel.avaliado_id AS "avaliadoId",
           rel.ciclo_id AS "cicloId",
           rel.tipo_relacionamento AS "tipoRelacionamento",
           opcoes.valor AS "opcao",
           COUNT(*) AS "contagem"
    FROM itens_resposta item
    JOIN perguntas pergunta ON pergunta.id = item.pergunta_id AND pergunta.tipo = 'caixa_selecao'
    JOIN respostas resposta ON resposta.id = item.resposta_id
    JOIN envios_pesquisa envio ON envio.id = resposta.envio_id
    JOIN relacionamentos_avaliacao rel ON rel.id = envio.relacionamento_id
    CROSS JOIN LATERAL jsonb_array_elements_text(item.valor -> 'opcoes') AS opcoes(valor)
    WHERE rel.ciclo_id = ANY($1::uuid[])
      AND resposta.respondido_em::date BETWEEN $2::date AND $3::date
    GROUP BY pergunta.id, pergunta.enunciado, rel.avaliado_id, rel.ciclo_id,
             rel.tipo_relacionamento, opcoes.valor
  `
  const linhas = await AppDataSource.query(sql, [ids, periodo.de, periodo.ate])
  return linhas.map((l: LinhaOpcao360 & { contagem: string }) => ({ ...l, contagem: Number(l.contagem) }))
}

// --- 5. Queries de agregação — clima_geral (restritas a idsClimaLiberados, gate-primeiro-depois-busca) ---

interface LinhaNivelClima {
  perguntaId: string
  perguntaEnunciado: string
  cicloId: string
  nivel: number
  contagem: number
}

async function agregarLikertClima(idsLiberados: string[], periodo: PeriodoConsulta): Promise<LinhaNivelClima[]> {
  if (idsLiberados.length === 0) return []
  const linhas = await AppDataSource.getRepository(ItemRespostaClima)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', {
      tipoPergunta: 'likert',
    })
    .innerJoin(RespostaClima, 'rc', 'rc.id = item.resposta_clima_id')
    .select('pergunta.id', 'perguntaId')
    .addSelect('pergunta.enunciado', 'perguntaEnunciado')
    .addSelect('rc.ciclo_id', 'cicloId')
    .addSelect("(item.valor ->> 'nota')::int", 'nivel')
    .addSelect('COUNT(*)', 'contagem')
    .where('rc.ciclo_id IN (:...ids)', { ids: idsLiberados })
    .andWhere('rc.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .groupBy('pergunta.id')
    .addGroupBy('pergunta.enunciado')
    .addGroupBy('rc.ciclo_id')
    .addGroupBy("(item.valor ->> 'nota')::int")
    .getRawMany<{
      perguntaId: string
      perguntaEnunciado: string
      cicloId: string
      nivel: number
      contagem: string
    }>()

  return linhas.map((l) => ({ ...l, contagem: Number(l.contagem) }))
}

interface LinhaCompetenciaNivelClima extends LinhaNivelClima {
  competenciaId: string
}

async function agregarMatrizClima(
  idsLiberados: string[],
  periodo: PeriodoConsulta,
): Promise<LinhaCompetenciaNivelClima[]> {
  if (idsLiberados.length === 0) return []
  const sql = `
    SELECT pergunta.id AS "perguntaId",
           pergunta.enunciado AS "perguntaEnunciado",
           rc.ciclo_id AS "cicloId",
           notas.chave AS "competenciaId",
           notas.valor::int AS "nivel",
           COUNT(*) AS "contagem"
    FROM itens_resposta_clima item
    JOIN perguntas pergunta ON pergunta.id = item.pergunta_id AND pergunta.tipo = 'matriz'
    JOIN respostas_clima rc ON rc.id = item.resposta_clima_id
    CROSS JOIN LATERAL jsonb_each_text(item.valor -> 'notas') AS notas(chave, valor)
    WHERE rc.ciclo_id = ANY($1::uuid[])
      AND rc.respondido_em::date BETWEEN $2::date AND $3::date
    GROUP BY pergunta.id, pergunta.enunciado, rc.ciclo_id, notas.chave, notas.valor
  `
  const linhas = await AppDataSource.query(sql, [idsLiberados, periodo.de, periodo.ate])
  return linhas.map((l: LinhaCompetenciaNivelClima & { contagem: string }) => ({
    ...l,
    contagem: Number(l.contagem),
  }))
}

interface LinhaOpcaoClima {
  perguntaId: string
  perguntaEnunciado: string
  cicloId: string
  opcao: string
  contagem: number
}

async function agregarCaixaSelecaoClima(idsLiberados: string[], periodo: PeriodoConsulta): Promise<LinhaOpcaoClima[]> {
  if (idsLiberados.length === 0) return []
  const sql = `
    SELECT pergunta.id AS "perguntaId",
           pergunta.enunciado AS "perguntaEnunciado",
           rc.ciclo_id AS "cicloId",
           opcoes.valor AS "opcao",
           COUNT(*) AS "contagem"
    FROM itens_resposta_clima item
    JOIN perguntas pergunta ON pergunta.id = item.pergunta_id AND pergunta.tipo = 'caixa_selecao'
    JOIN respostas_clima rc ON rc.id = item.resposta_clima_id
    CROSS JOIN LATERAL jsonb_array_elements_text(item.valor -> 'opcoes') AS opcoes(valor)
    WHERE rc.ciclo_id = ANY($1::uuid[])
      AND rc.respondido_em::date BETWEEN $2::date AND $3::date
    GROUP BY pergunta.id, pergunta.enunciado, rc.ciclo_id, opcoes.valor
  `
  const linhas = await AppDataSource.query(sql, [idsLiberados, periodo.de, periodo.ate])
  return linhas.map((l: LinhaOpcaoClima & { contagem: string }) => ({ ...l, contagem: Number(l.contagem) }))
}

// --- 6. Ciclos de clima bloqueados — enumeração ESTRUTURAL de perguntas (sem tocar em nenhuma resposta) ---

/**
 * Mesmo critério de desempate de `classificarPorTipo` (analise-comum.ts):
 * pesquisa mais recente (criadoEm DESC) quando há mais de uma por ciclo.
 * Só toca `perguntas -> paginas_pesquisa -> pesquisas` — nenhum JOIN com
 * `respostas_clima`/`itens_resposta_clima` (metadado estrutural, seguro
 * mesmo para ciclos bloqueados pelo gate).
 */
async function resolverPesquisaVinculadaPorCiclo(idsCiclos: string[]): Promise<Map<string, string>> {
  if (idsCiclos.length === 0) return new Map()
  const pesquisas = await AppDataSource.getRepository(Pesquisa).find({
    where: { cicloId: In(idsCiclos) },
    order: { criadoEm: 'DESC' },
    select: { id: true, cicloId: true },
  })
  const mapa = new Map<string, string>() // cicloId -> pesquisaId
  for (const p of pesquisas) {
    if (p.cicloId && !mapa.has(p.cicloId)) mapa.set(p.cicloId, p.id)
  }
  return mapa
}

interface PerguntaEstrutural {
  perguntaId: string
  perguntaEnunciado: string
  tipo: 'likert' | 'matriz' | 'caixa_selecao'
  ordem: number
  configuracao: Record<string, unknown>
  pesquisaId: string
}

async function buscarPerguntasEstruturaisPorPesquisa(pesquisaIds: string[]): Promise<PerguntaEstrutural[]> {
  if (pesquisaIds.length === 0) return []
  return AppDataSource.getRepository(Pergunta)
    .createQueryBuilder('pergunta')
    .innerJoin(PaginaPesquisa, 'pagina', 'pagina.id = pergunta.pagina_id')
    .select('pergunta.id', 'perguntaId')
    .addSelect('pergunta.enunciado', 'perguntaEnunciado')
    .addSelect('pergunta.tipo', 'tipo')
    .addSelect('pergunta.ordem', 'ordem')
    .addSelect('pergunta.configuracao', 'configuracao')
    .addSelect('pagina.pesquisa_id', 'pesquisaId')
    .where('pagina.pesquisa_id IN (:...pesquisaIds)', { pesquisaIds })
    .andWhere('pergunta.tipo IN (:...tipos)', { tipos: ['likert', 'matriz', 'caixa_selecao'] })
    .getRawMany<PerguntaEstrutural>()
}

// --- 7. Zero-fill — aplicado só a entradas liberado: true ---

function zeroFillNiveis(niveis: number, contagens: Map<number, number>): ContagemNivel[] {
  const resultado: ContagemNivel[] = []
  for (let nivel = 1; nivel <= niveis; nivel++) {
    resultado.push({ nivel, contagem: contagens.get(nivel) ?? 0 })
  }
  return resultado
}

function zeroFillOpcoes(opcoesConfiguradas: string[], contagens: Map<string, number>): ContagemOpcao[] {
  // Preserva a ORDEM configurada em perguntas.configuracao.opcoes — nunca
  // ordenada alfabeticamente nem por contagem.
  return opcoesConfiguradas.map((opcao) => ({ opcao, contagem: contagens.get(opcao) ?? 0 }))
}

// --- 8. Composição em memória — avaliacao_360 ---

type ChaveGate = string // `${avaliadoId}|${cicloId}|${tipoRelacionamento}`

function elegivel(
  tipoRelacionamento: TipoRelacionamento,
  avaliadoId: string,
  cicloId: string,
  gate: Map<ChaveGate, number>,
  minimo: number,
): boolean {
  if (tipoRelacionamento === 'autoavaliacao' || tipoRelacionamento === 'gestor' || tipoRelacionamento === 'externo') {
    return true
  }
  return (gate.get(`${avaliadoId}|${cicloId}|${tipoRelacionamento}`) ?? 0) >= minimo
}

function ordenarPorCicloEOrdem<T extends { nomeCiclo: string; ordem: number }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => {
    const cmpCiclo = a.nomeCiclo.localeCompare(b.nomeCiclo, 'pt-BR')
    if (cmpCiclo !== 0) return cmpCiclo
    return a.ordem - b.ordem
  })
}

function montarAvaliacao360(
  linhasLikert: LinhaNivel360[],
  linhasMatriz: LinhaCompetenciaNivel360[],
  linhasCaixa: LinhaOpcao360[],
  gate: Map<ChaveGate, number>,
  minimoDoCiclo: (cicloId: string) => number,
  metadadosPerguntas: Map<string, MetadadosPergunta>,
  nomesCiclos: Map<string, string>,
  nomesCompetencias: Map<string, string>,
): ResultadoPergunta360[] {
  // --- likert ---
  const existiuLikert = new Set<string>() // `${perguntaId}|${tipoRelacionamento}`
  const distribLikert = new Map<string, Map<TipoRelacionamento, Map<number, number>>>()
  const metaLikert = new Map<string, { perguntaEnunciado: string; cicloId: string }>()

  for (const l of linhasLikert) {
    const chaveExistiu = `${l.perguntaId}|${l.tipoRelacionamento}`
    existiuLikert.add(chaveExistiu)
    if (!metaLikert.has(l.perguntaId)) {
      metaLikert.set(l.perguntaId, { perguntaEnunciado: l.perguntaEnunciado, cicloId: l.cicloId })
    }
    const minimo = minimoDoCiclo(l.cicloId)
    if (!elegivel(l.tipoRelacionamento, l.avaliadoId, l.cicloId, gate, minimo)) continue

    const porPergunta = distribLikert.get(l.perguntaId) ?? new Map<TipoRelacionamento, Map<number, number>>()
    const porTipo = porPergunta.get(l.tipoRelacionamento) ?? new Map<number, number>()
    porTipo.set(l.nivel, (porTipo.get(l.nivel) ?? 0) + l.contagem)
    porPergunta.set(l.tipoRelacionamento, porTipo)
    distribLikert.set(l.perguntaId, porPergunta)
  }

  const resultadosLikert: Array<ResultadoPerguntaLikert360 & { ordem: number }> = [...metaLikert.entries()].map(([perguntaId, meta]) => {
    const configuracao = metadadosPerguntas.get(perguntaId)?.configuracao ?? {}
    const niveis = extrairNiveis(configuracao)
    const rotulos = extrairRotulos(configuracao)
    const porPergunta = distribLikert.get(perguntaId)
    const porTipoRelacionamento: DistribuicaoTipoRelacionamento[] = ORDEM_TIPOS_RELACIONAMENTO.filter((tipo) =>
      existiuLikert.has(`${perguntaId}|${tipo}`),
    ).map((tipo) => {
      const mapaNiveis = porPergunta?.get(tipo)
      const total = mapaNiveis ? [...mapaNiveis.values()].reduce((s, v) => s + v, 0) : 0
      const liberado = total > 0
      return liberado
        ? { tipoRelacionamento: tipo, liberado: true, distribuicao: zeroFillNiveis(niveis, mapaNiveis ?? new Map()) }
        : { tipoRelacionamento: tipo, liberado: false, motivo: 'aguardando_minimo_respondentes' as const }
    })
    return {
      perguntaId,
      perguntaEnunciado: meta.perguntaEnunciado,
      cicloId: meta.cicloId,
      nomeCiclo: nomesCiclos.get(meta.cicloId) ?? '',
      tipo: 'likert' as const,
      niveis,
      rotulos,
      porTipoRelacionamento,
      ordem: metadadosPerguntas.get(perguntaId)?.ordem ?? 0,
    }
  })

  // --- matriz ---
  const existiuMatriz = new Set<string>() // `${perguntaId}|${competenciaId}|${tipoRelacionamento}`
  const distribMatriz = new Map<string, Map<string, Map<TipoRelacionamento, Map<number, number>>>>() // perguntaId -> competenciaId -> tipo -> nivel -> contagem
  const metaMatriz = new Map<string, { perguntaEnunciado: string; cicloId: string }>()
  const competenciasPorPergunta = new Map<string, Set<string>>()

  for (const l of linhasMatriz) {
    const chaveExistiu = `${l.perguntaId}|${l.competenciaId}|${l.tipoRelacionamento}`
    existiuMatriz.add(chaveExistiu)
    if (!metaMatriz.has(l.perguntaId)) {
      metaMatriz.set(l.perguntaId, { perguntaEnunciado: l.perguntaEnunciado, cicloId: l.cicloId })
    }
    const conjuntoCompetencias = competenciasPorPergunta.get(l.perguntaId) ?? new Set<string>()
    conjuntoCompetencias.add(l.competenciaId)
    competenciasPorPergunta.set(l.perguntaId, conjuntoCompetencias)

    const minimo = minimoDoCiclo(l.cicloId)
    if (!elegivel(l.tipoRelacionamento, l.avaliadoId, l.cicloId, gate, minimo)) continue

    const porPergunta = distribMatriz.get(l.perguntaId) ?? new Map<string, Map<TipoRelacionamento, Map<number, number>>>()
    const porCompetencia = porPergunta.get(l.competenciaId) ?? new Map<TipoRelacionamento, Map<number, number>>()
    const porTipo = porCompetencia.get(l.tipoRelacionamento) ?? new Map<number, number>()
    porTipo.set(l.nivel, (porTipo.get(l.nivel) ?? 0) + l.contagem)
    porCompetencia.set(l.tipoRelacionamento, porTipo)
    porPergunta.set(l.competenciaId, porCompetencia)
    distribMatriz.set(l.perguntaId, porPergunta)
  }

  const resultadosMatriz: Array<ResultadoPerguntaMatriz360 & { ordem: number }> = [...metaMatriz.entries()].map(([perguntaId, meta]) => {
    const configuracaoMatriz = metadadosPerguntas.get(perguntaId)?.configuracao ?? {}
    const niveis = extrairNiveis(configuracaoMatriz)
    const rotulos = extrairRotulos(configuracaoMatriz)
    const porPerguntaMap = distribMatriz.get(perguntaId)
    const idsCompetencias = [...(competenciasPorPergunta.get(perguntaId) ?? [])]

    const competencias: CompetenciaDistribuicao[] = idsCompetencias.map((competenciaId) => {
      const porCompetencia = porPerguntaMap?.get(competenciaId)
      const porTipoRelacionamento: DistribuicaoTipoRelacionamento[] = ORDEM_TIPOS_RELACIONAMENTO.filter((tipo) =>
        existiuMatriz.has(`${perguntaId}|${competenciaId}|${tipo}`),
      ).map((tipo) => {
        const mapaNiveis = porCompetencia?.get(tipo)
        const total = mapaNiveis ? [...mapaNiveis.values()].reduce((s, v) => s + v, 0) : 0
        const liberado = total > 0
        return liberado
          ? { tipoRelacionamento: tipo, liberado: true, distribuicao: zeroFillNiveis(niveis, mapaNiveis ?? new Map()) }
          : { tipoRelacionamento: tipo, liberado: false, motivo: 'aguardando_minimo_respondentes' as const }
      })
      return {
        competenciaId,
        competenciaNome: nomesCompetencias.get(competenciaId) ?? '',
        porTipoRelacionamento,
      }
    })

    competencias.sort((a, b) => a.competenciaNome.localeCompare(b.competenciaNome, 'pt-BR'))

    return {
      perguntaId,
      perguntaEnunciado: meta.perguntaEnunciado,
      cicloId: meta.cicloId,
      nomeCiclo: nomesCiclos.get(meta.cicloId) ?? '',
      tipo: 'matriz' as const,
      niveis,
      rotulos,
      competencias,
      ordem: metadadosPerguntas.get(perguntaId)?.ordem ?? 0,
    }
  })

  // --- caixa_selecao ---
  const existiuCaixa = new Set<string>() // `${perguntaId}|${tipoRelacionamento}`
  const distribCaixa = new Map<string, Map<TipoRelacionamento, Map<string, number>>>()
  const metaCaixa = new Map<string, { perguntaEnunciado: string; cicloId: string }>()

  for (const l of linhasCaixa) {
    const chaveExistiu = `${l.perguntaId}|${l.tipoRelacionamento}`
    existiuCaixa.add(chaveExistiu)
    if (!metaCaixa.has(l.perguntaId)) {
      metaCaixa.set(l.perguntaId, { perguntaEnunciado: l.perguntaEnunciado, cicloId: l.cicloId })
    }
    const minimo = minimoDoCiclo(l.cicloId)
    if (!elegivel(l.tipoRelacionamento, l.avaliadoId, l.cicloId, gate, minimo)) continue

    const porPergunta = distribCaixa.get(l.perguntaId) ?? new Map<TipoRelacionamento, Map<string, number>>()
    const porTipo = porPergunta.get(l.tipoRelacionamento) ?? new Map<string, number>()
    porTipo.set(l.opcao, (porTipo.get(l.opcao) ?? 0) + l.contagem)
    porPergunta.set(l.tipoRelacionamento, porTipo)
    distribCaixa.set(l.perguntaId, porPergunta)
  }

  const resultadosCaixa: Array<ResultadoPerguntaCaixaSelecao360 & { ordem: number }> = [...metaCaixa.entries()].map(([perguntaId, meta]) => {
    const opcoesConfiguradas = extrairOpcoesConfiguradas(metadadosPerguntas.get(perguntaId)?.configuracao ?? {})
    const porPergunta = distribCaixa.get(perguntaId)
    const porTipoRelacionamento: DistribuicaoOpcaoTipoRelacionamento[] = ORDEM_TIPOS_RELACIONAMENTO.filter((tipo) =>
      existiuCaixa.has(`${perguntaId}|${tipo}`),
    ).map((tipo) => {
      const mapaOpcoes = porPergunta?.get(tipo)
      const total = mapaOpcoes ? [...mapaOpcoes.values()].reduce((s, v) => s + v, 0) : 0
      const liberado = total > 0
      return liberado
        ? {
            tipoRelacionamento: tipo,
            liberado: true,
            distribuicao: zeroFillOpcoes(opcoesConfiguradas, mapaOpcoes ?? new Map()),
          }
        : { tipoRelacionamento: tipo, liberado: false, motivo: 'aguardando_minimo_respondentes' as const }
    })
    return {
      perguntaId,
      perguntaEnunciado: meta.perguntaEnunciado,
      cicloId: meta.cicloId,
      nomeCiclo: nomesCiclos.get(meta.cicloId) ?? '',
      tipo: 'caixa_selecao' as const,
      opcoesDisponiveis: opcoesConfiguradas,
      porTipoRelacionamento,
      ordem: metadadosPerguntas.get(perguntaId)?.ordem ?? 0,
    }
  })

  const todas = [...resultadosLikert, ...resultadosMatriz, ...resultadosCaixa]
  const ordenadas = ordenarPorCicloEOrdem(todas)
  // `ordem` é chave de ordenação interna, descartada do contrato de resposta final.
  return ordenadas.map(({ ordem: _ordem, ...resto }) => resto) as ResultadoPergunta360[]
}

// --- 9. Composição em memória — clima_geral ---

function montarClimaGeral(
  linhasLikert: LinhaNivelClima[],
  linhasMatriz: LinhaCompetenciaNivelClima[],
  linhasCaixa: LinhaOpcaoClima[],
  perguntasEstruturaisBloqueadas: PerguntaEstrutural[],
  pesquisaVinculadaBloqueados: Map<string, string>,
  metadadosPerguntas: Map<string, MetadadosPergunta>,
  nomesCiclos: Map<string, string>,
  nomesCompetencias: Map<string, string>,
): ResultadoPerguntaClima[] {
  const cicloPorPesquisa = new Map<string, string>()
  for (const [cicloId, pesquisaId] of pesquisaVinculadaBloqueados.entries()) {
    cicloPorPesquisa.set(pesquisaId, cicloId)
  }

  // --- likert (liberadas) ---
  const distribLikert = new Map<string, Map<number, number>>() // perguntaId -> nivel -> contagem
  const metaLikert = new Map<string, { perguntaEnunciado: string; cicloId: string }>()
  for (const l of linhasLikert) {
    metaLikert.set(l.perguntaId, { perguntaEnunciado: l.perguntaEnunciado, cicloId: l.cicloId })
    const mapa = distribLikert.get(l.perguntaId) ?? new Map<number, number>()
    mapa.set(l.nivel, (mapa.get(l.nivel) ?? 0) + l.contagem)
    distribLikert.set(l.perguntaId, mapa)
  }
  const resultadosLikertLiberados: Array<ResultadoPerguntaLikertClima & { ordem: number }> = [...metaLikert.entries()].map(
    ([perguntaId, meta]) => {
      const configuracaoLikertClima = metadadosPerguntas.get(perguntaId)?.configuracao ?? {}
      const niveis = extrairNiveis(configuracaoLikertClima)
      const rotulos = extrairRotulos(configuracaoLikertClima)
      return {
        perguntaId,
        perguntaEnunciado: meta.perguntaEnunciado,
        cicloId: meta.cicloId,
        nomeCiclo: nomesCiclos.get(meta.cicloId) ?? '',
        tipo: 'likert' as const,
        niveis,
        rotulos,
        liberado: true,
        distribuicao: zeroFillNiveis(niveis, distribLikert.get(perguntaId) ?? new Map()),
        ordem: metadadosPerguntas.get(perguntaId)?.ordem ?? 0,
      }
    },
  )

  // --- matriz (liberadas) ---
  const distribMatriz = new Map<string, Map<string, Map<number, number>>>() // perguntaId -> competenciaId -> nivel -> contagem
  const metaMatriz = new Map<string, { perguntaEnunciado: string; cicloId: string }>()
  const competenciasPorPergunta = new Map<string, Set<string>>()
  for (const l of linhasMatriz) {
    metaMatriz.set(l.perguntaId, { perguntaEnunciado: l.perguntaEnunciado, cicloId: l.cicloId })
    const conjunto = competenciasPorPergunta.get(l.perguntaId) ?? new Set<string>()
    conjunto.add(l.competenciaId)
    competenciasPorPergunta.set(l.perguntaId, conjunto)

    const porPergunta = distribMatriz.get(l.perguntaId) ?? new Map<string, Map<number, number>>()
    const porCompetencia = porPergunta.get(l.competenciaId) ?? new Map<number, number>()
    porCompetencia.set(l.nivel, (porCompetencia.get(l.nivel) ?? 0) + l.contagem)
    porPergunta.set(l.competenciaId, porCompetencia)
    distribMatriz.set(l.perguntaId, porPergunta)
  }
  const resultadosMatrizLiberados: Array<ResultadoPerguntaMatrizClima & { ordem: number }> = [...metaMatriz.entries()].map(
    ([perguntaId, meta]) => {
      const configuracaoMatrizClima = metadadosPerguntas.get(perguntaId)?.configuracao ?? {}
      const niveis = extrairNiveis(configuracaoMatrizClima)
      const rotulos = extrairRotulos(configuracaoMatrizClima)
      const porPerguntaMap = distribMatriz.get(perguntaId)
      const idsCompetencias = [...(competenciasPorPergunta.get(perguntaId) ?? [])]
      const competencias = idsCompetencias
        .map((competenciaId) => ({
          competenciaId,
          competenciaNome: nomesCompetencias.get(competenciaId) ?? '',
          distribuicao: zeroFillNiveis(niveis, porPerguntaMap?.get(competenciaId) ?? new Map()),
        }))
        .sort((a, b) => a.competenciaNome.localeCompare(b.competenciaNome, 'pt-BR'))
      return {
        perguntaId,
        perguntaEnunciado: meta.perguntaEnunciado,
        cicloId: meta.cicloId,
        nomeCiclo: nomesCiclos.get(meta.cicloId) ?? '',
        tipo: 'matriz' as const,
        niveis,
        rotulos,
        liberado: true,
        competencias,
        ordem: metadadosPerguntas.get(perguntaId)?.ordem ?? 0,
      }
    },
  )

  // --- caixa_selecao (liberadas) ---
  const distribCaixa = new Map<string, Map<string, number>>() // perguntaId -> opcao -> contagem
  const metaCaixa = new Map<string, { perguntaEnunciado: string; cicloId: string }>()
  for (const l of linhasCaixa) {
    metaCaixa.set(l.perguntaId, { perguntaEnunciado: l.perguntaEnunciado, cicloId: l.cicloId })
    const mapa = distribCaixa.get(l.perguntaId) ?? new Map<string, number>()
    mapa.set(l.opcao, (mapa.get(l.opcao) ?? 0) + l.contagem)
    distribCaixa.set(l.perguntaId, mapa)
  }
  const resultadosCaixaLiberadas: Array<ResultadoPerguntaCaixaSelecaoClima & { ordem: number }> = [...metaCaixa.entries()].map(
    ([perguntaId, meta]) => {
      const opcoesConfiguradas = extrairOpcoesConfiguradas(metadadosPerguntas.get(perguntaId)?.configuracao ?? {})
      return {
        perguntaId,
        perguntaEnunciado: meta.perguntaEnunciado,
        cicloId: meta.cicloId,
        nomeCiclo: nomesCiclos.get(meta.cicloId) ?? '',
        tipo: 'caixa_selecao' as const,
        opcoesDisponiveis: opcoesConfiguradas,
        liberado: true,
        distribuicao: zeroFillOpcoes(opcoesConfiguradas, distribCaixa.get(perguntaId) ?? new Map()),
        ordem: metadadosPerguntas.get(perguntaId)?.ordem ?? 0,
      }
    },
  )

  // --- bloqueadas (enumeração estrutural, sem distribuição) ---
  const bloqueadas: Array<ResultadoPerguntaClima & { ordem: number }> = perguntasEstruturaisBloqueadas.map((p) => {
    const cicloId = cicloPorPesquisa.get(p.pesquisaId) ?? ''
    const configuracao = p.configuracao ?? {}
    const base = {
      perguntaId: p.perguntaId,
      perguntaEnunciado: p.perguntaEnunciado,
      cicloId,
      nomeCiclo: nomesCiclos.get(cicloId) ?? '',
      liberado: false as const,
      motivo: 'aguardando_minimo_respondentes' as const,
      ordem: p.ordem,
    }
    if (p.tipo === 'likert') {
      return { ...base, tipo: 'likert' as const, niveis: extrairNiveis(configuracao), rotulos: extrairRotulos(configuracao) }
    }
    if (p.tipo === 'matriz') {
      return { ...base, tipo: 'matriz' as const, niveis: extrairNiveis(configuracao), rotulos: extrairRotulos(configuracao) }
    }
    return { ...base, tipo: 'caixa_selecao' as const, opcoesDisponiveis: extrairOpcoesConfiguradas(configuracao) }
  })

  const todas = [
    ...resultadosLikertLiberados,
    ...resultadosMatrizLiberados,
    ...resultadosCaixaLiberadas,
    ...bloqueadas,
  ]
  const ordenadas = ordenarPorCicloEOrdem(todas)
  return ordenadas.map(({ ordem: _ordem, ...resto }) => resto) as ResultadoPerguntaClima[]
}

// --- 10. Fluxo completo ---

export async function buscarResultadosPergunta(
  ator: ColaboradorAutenticado,
  dto: BuscarResultadosPerguntaDto,
): Promise<ResultadosPerguntaAnalise> {
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
    await buscarCicloOuFalhar(cicloIdNormalizado) // 404 CICLO_NAO_ENCONTRADO
    cicloId = cicloIdNormalizado
  }

  const periodo: PeriodoConsulta = { de, ate }
  const idsUniverso = await buscarUniversoCiclos(periodo, cicloId ?? undefined)

  if (idsUniverso.length === 0) {
    return { periodo, cicloId, avaliacao360: [], climaGeral: [] }
  }

  const { idsAval360, idsClima } = await classificarPorTipo(idsUniverso)

  const [linhasLikert360, linhasMatriz360, linhasCaixa360, gateParesSubordinado, gateClima, minimosPorCiclo, nomesCiclos] =
    await Promise.all([
      agregarLikert360(idsAval360, periodo),
      agregarMatriz360(idsAval360, periodo),
      agregarCaixaSelecao360(idsAval360, periodo),
      calcularGateParesSubordinado(idsAval360, periodo), // COM período
      calcularGateClima(idsClima, periodo),
      buscarMinimosPorCiclo(idsUniverso),
      buscarNomesCiclos(idsUniverso),
    ])

  const gate = new Map<ChaveGate, number>(
    gateParesSubordinado.map((g) => [`${g.avaliadoId}|${g.cicloId}|${g.tipoRelacionamento}`, g.totalRespondentes]),
  )
  const minimoDoCiclo = (id: string) => minimosPorCiclo.get(id) ?? 3

  // --- composição avaliacao_360 ---
  const idsPerguntas360 = [
    ...new Set([...linhasLikert360, ...linhasMatriz360, ...linhasCaixa360].map((l) => l.perguntaId)),
  ]
  const idsCompetencias = [...new Set(linhasMatriz360.map((l) => l.competenciaId))]
  const [metadadosPerguntas360, nomesCompetencias] = await Promise.all([
    buscarMetadadosPerguntas(idsPerguntas360),
    buscarNomesCompetencias(idsCompetencias),
  ])
  const avaliacao360 = montarAvaliacao360(
    linhasLikert360,
    linhasMatriz360,
    linhasCaixa360,
    gate,
    minimoDoCiclo,
    metadadosPerguntas360,
    nomesCiclos,
    nomesCompetencias,
  )

  // --- composição clima_geral — gate primeiro, busca depois ---
  const gateClimaMap = new Map(gateClima.map((g) => [g.cicloId, g.totalRespondentes]))
  const idsClimaLiberados = idsClima.filter((id) => (gateClimaMap.get(id) ?? 0) >= minimoDoCiclo(id))
  const idsClimaBloqueados = idsClima.filter((id) => {
    const total = gateClimaMap.get(id) ?? 0
    return total > 0 && total < minimoDoCiclo(id)
  })

  const [linhasLikertClima, linhasMatrizClima, linhasCaixaClima] = await Promise.all([
    agregarLikertClima(idsClimaLiberados, periodo),
    agregarMatrizClima(idsClimaLiberados, periodo),
    agregarCaixaSelecaoClima(idsClimaLiberados, periodo),
  ])

  const idsPerguntasClima = [
    ...new Set([...linhasLikertClima, ...linhasMatrizClima, ...linhasCaixaClima].map((l) => l.perguntaId)),
  ]
  const idsCompetenciasClima = [...new Set(linhasMatrizClima.map((l) => l.competenciaId))]

  const pesquisaVinculadaBloqueados = await resolverPesquisaVinculadaPorCiclo(idsClimaBloqueados)
  const perguntasEstruturaisBloqueadas = await buscarPerguntasEstruturaisPorPesquisa([
    ...pesquisaVinculadaBloqueados.values(),
  ])

  const [metadadosPerguntasClima, nomesCompetenciasClima] = await Promise.all([
    buscarMetadadosPerguntas([...idsPerguntasClima, ...perguntasEstruturaisBloqueadas.map((p) => p.perguntaId)]),
    buscarNomesCompetencias(idsCompetenciasClima),
  ])

  const climaGeral = montarClimaGeral(
    linhasLikertClima,
    linhasMatrizClima,
    linhasCaixaClima,
    perguntasEstruturaisBloqueadas,
    pesquisaVinculadaBloqueados,
    metadadosPerguntasClima,
    nomesCiclos,
    nomesCompetenciasClima,
  )

  return { periodo, cicloId, avaliacao360, climaGeral }
}
