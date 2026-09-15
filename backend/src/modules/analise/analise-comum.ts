import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { ErroHttp } from '../../common/erro-http'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { CicloParticipante } from '../ciclo-participantes/ciclo-participante.entity'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'
import { Resposta } from '../respostas/resposta.entity'
import { ItemResposta } from '../respostas/item-resposta.entity'
import { ItemRespostaClima } from '../respostas-clima/item-resposta-clima.entity'
import { RespostaClima } from '../respostas-clima/resposta-clima.entity'
import { Pergunta } from '../perguntas/pergunta.entity'
import { Pesquisa } from '../pesquisas/pesquisa.entity'

/**
 * Peças compartilhadas entre "Visão Geral" (`analise.service.ts`) e
 * "Avaliações" (`analise-avaliacoes.service.ts`) — extraídas aqui SEM
 * qualquer mudança de comportamento (task-backend.md, passo 1.1). A lógica de
 * sobreposição de vigência + desempate de pesquisa vinculada é intrincada o
 * suficiente para que duplicá-la entre os dois arquivos seja risco de drift.
 */

export const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

export const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/

export interface PeriodoConsulta {
  de: string
  ate: string
}

/**
 * Mesma regex/erro de `validarData` em `ciclos-avaliacao.service.ts` —
 * duplicada localmente porque aquela função é privada do módulo de ciclos
 * (não exportada); pequena duplicação deliberada em vez de exportar uma
 * função de outro domínio só para isto (ver task-backend.md, "Estado atual
 * verificado").
 */
export function validarDataQuery(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !REGEX_DATA.test(valor.trim())) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', `Campo "${campo}" deve ser uma data "YYYY-MM-DD".`)
  }

  const texto = valor.trim()
  const ano = Number(texto.slice(0, 4))
  const mes = Number(texto.slice(5, 7))
  const dia = Number(texto.slice(8, 10))
  const data = new Date(Date.UTC(ano, mes - 1, dia))

  if (
    Number.isNaN(data.getTime()) ||
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', `Campo "${campo}" não é uma data de calendário válida.`)
  }

  return texto
}

/**
 * Universo de ciclos elegíveis ao corte de período (spec 2.3a): a VIGÊNCIA do
 * ciclo precisa SOBREPOR o período informado (data_inicio <= ate AND
 * data_fim >= de) — não "caber inteiro dentro do período". Só id é
 * selecionado, nenhum outro campo é necessário aqui.
 */
export async function buscarUniversoCiclos(periodo: PeriodoConsulta, cicloId?: string): Promise<string[]> {
  const qb = AppDataSource.getRepository(CicloAvaliacao)
    .createQueryBuilder('c')
    .select('c.id', 'id')
    .where('c.data_inicio <= :ate::date', { ate: periodo.ate })
    .andWhere('c.data_fim >= :de::date', { de: periodo.de })

  if (cicloId) qb.andWhere('c.id = :cicloId', { cicloId })

  const linhas = await qb.getRawMany<{ id: string }>()
  return linhas.map((l) => l.id)
}

/**
 * Classifica cada ciclo do universo em avaliacao_360/clima_geral, com base na
 * pesquisa vinculada mais recente (mesmo critério de desempate de
 * `buscarPesquisaVinculada`/`listar()` em ciclos-avaliacao.service.ts —
 * `pesquisas.ciclo_id` não tem UNIQUE). Ciclos sem pesquisa vinculada não
 * entram em nenhum dos dois grupos (decisão de modelagem 8).
 */
export async function classificarPorTipo(
  idsUniverso: string[],
): Promise<{ idsAval360: string[]; idsClima: string[] }> {
  if (idsUniverso.length === 0) return { idsAval360: [], idsClima: [] }

  const pesquisasVinculadas = await AppDataSource.getRepository(Pesquisa).find({
    where: { cicloId: In(idsUniverso) },
    order: { criadoEm: 'DESC' },
  })

  const tipoPorCiclo = new Map<string, Pesquisa['tipo']>()
  for (const pesquisa of pesquisasVinculadas) {
    if (pesquisa.cicloId && !tipoPorCiclo.has(pesquisa.cicloId)) {
      tipoPorCiclo.set(pesquisa.cicloId, pesquisa.tipo)
    }
  }

  const idsAval360 = idsUniverso.filter((id) => tipoPorCiclo.get(id) === 'avaliacao_360')
  const idsClima = idsUniverso.filter((id) => tipoPorCiclo.get(id) === 'clima_geral')

  return { idsAval360, idsClima }
}

export interface GateParesSubordinadoLinha {
  avaliadoId: string
  cicloId: string
  tipoRelacionamento: 'pares' | 'subordinado'
  totalRespondentes: number
}

/**
 * GATE compartilhado por "Avaliações" e "Ranking": único uso permitido de
 * avaliador_id no caminho pares/subordinado é DENTRO de
 * COUNT(DISTINCT ...) — nunca projetado bruto (guard rail de anonimização,
 * ver skill backend-anonimizacao-respostas). `periodo` é OPCIONAL:
 * "Avaliações" sempre passa `{ de, ate }` (filtra resposta.respondido_em,
 * mesmo comportamento de antes da extração, sem mudança); "Ranking" chama
 * com `ids: [cicloId]` e SEM período (gate sobre o ciclo inteiro, já que
 * Ranking não tem filtro de data).
 */
export async function calcularGateParesSubordinado(
  ids: string[],
  periodo?: PeriodoConsulta,
): Promise<GateParesSubordinadoLinha[]> {
  if (ids.length === 0) return []

  const qb = AppDataSource.getRepository(RelacionamentoAvaliacao)
    .createQueryBuilder('rel')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.relacionamento_id = rel.id')
    .innerJoin(Resposta, 'resposta', 'resposta.envio_id = envio.id')
    .select('rel.avaliado_id', 'avaliadoId')
    .addSelect('rel.ciclo_id', 'cicloId')
    .addSelect('rel.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect('COUNT(DISTINCT rel.avaliador_id)', 'totalRespondentes')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('rel.tipo_relacionamento IN (:...tipos)', { tipos: ['pares', 'subordinado'] })
    .groupBy('rel.avaliado_id')
    .addGroupBy('rel.ciclo_id')
    .addGroupBy('rel.tipo_relacionamento')

  if (periodo) {
    qb.andWhere('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
  }

  const linhas = await qb.getRawMany<{
    avaliadoId: string
    cicloId: string
    tipoRelacionamento: 'pares' | 'subordinado'
    totalRespondentes: string
  }>()

  return linhas.map((l) => ({ ...l, totalRespondentes: Number(l.totalRespondentes) }))
}

/** Mesmo `arredondar1` já usado por "Visão Geral" — compartilhado por "Ranking". */
export function arredondar1(valor: number): number {
  return Math.round(valor * 10) / 10
}

/**
 * Peças extraídas de `analise.service.ts` ("Visão Geral", task-backend.md de
 * "Nuvem de Palavras", passo 1) — SEM qualquer mudança de comportamento/SQL.
 * Ganharam um segundo consumidor real (`analise-nuvem-palavras.service.ts`,
 * via `calcularMetricasComplementares` abaixo), por isso migraram para cá.
 */

export interface TempoMedioComponente {
  horas: number
  amostras: number
}

/**
 * Query A — contagem de respostas de avaliação 360 no período (join
 * relacionamentos_avaliacao -> envios_pesquisa -> respostas, filtrado por
 * ciclo_id + respondido_em dentro do período). SÓ CONTAGEM — nunca seleciona
 * avaliador_id/avaliado_id/tipo_relacionamento (guard rail de anonimização,
 * ver skill backend-anonimizacao-respostas). Reaproveitada tal qual para
 * `distribuicaoPorTipo.avaliacao_360.totalRespostas` E para o numerador
 * `concluidos360` da taxa de resposta média (decisão de modelagem 9 —
 * `respostas.envio_id` é UNIQUE e cada envio de 360 aponta a exatamente 1
 * relacionamento, então os dois números são o MESMO por construção).
 */
export async function contarRespostas360NoPeriodo(ids: string[], periodo: PeriodoConsulta): Promise<number> {
  if (ids.length === 0) return 0
  return AppDataSource.getRepository(RelacionamentoAvaliacao)
    .createQueryBuilder('rel')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.relacionamento_id = rel.id')
    .innerJoin(Resposta, 'resposta', 'resposta.envio_id = envio.id')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', {
      de: periodo.de,
      ate: periodo.ate,
    })
    .getCount()
}

/**
 * Query B — contagem de respostas de clima no período. SÓ CONTAGEM/GROUP BY
 * sobre carimbos de data — `respostas_clima` já é estruturalmente anônima
 * (sem FK de identidade), mas mesmo assim nenhuma coluna além de
 * ciclo_id/respondido_em é tocada aqui (guard rail de anonimização, ver
 * skill backend-anonimizacao-respostas).
 */
export async function contarRespostasClimaNoPeriodo(ids: string[], periodo: PeriodoConsulta): Promise<number> {
  if (ids.length === 0) return 0
  return AppDataSource.getRepository(RespostaClima)
    .createQueryBuilder('rc')
    .where('rc.ciclo_id IN (:...ids)', { ids })
    .andWhere('rc.respondido_em::date BETWEEN :de::date AND :ate::date', {
      de: periodo.de,
      ate: periodo.ate,
    })
    .getCount()
}

/**
 * Query C — denominador de `taxaRespostaMedia` para avaliação 360: universo
 * COMPLETO de relacionamentos_avaliacao do corte de ciclos, sem filtro de
 * data (mesma semântica de "total" de `calcularProgressoCiclo`). SÓ
 * CONTAGEM — nunca seleciona avaliador_id/avaliado_id/tipo_relacionamento
 * (guard rail de anonimização, ver skill backend-anonimizacao-respostas).
 */
export async function contarTotal360(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  return AppDataSource.getRepository(RelacionamentoAvaliacao).count({ where: { cicloId: In(ids) } })
}

/**
 * Query C (clima) — denominador de `taxaRespostaMedia` para clima geral:
 * universo completo de ciclo_participantes do corte de ciclos, sem filtro de
 * data. SÓ CONTAGEM — nunca seleciona avaliador_id/avaliado_id/
 * tipo_relacionamento (guard rail de anonimização, ver skill
 * backend-anonimizacao-respostas).
 */
export async function contarTotalParticipantesClima(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  return AppDataSource.getRepository(CicloParticipante).count({ where: { cicloId: In(ids) } })
}

/**
 * Query E — tempo médio de resposta 360 (spec 2.4): AVG(concluido_em -
 * enviado_em) em horas, por relacionamento com envio concluído, filtrado
 * pelo carimbo de CONCLUSÃO dentro do período. SÓ AVG/COUNT sobre carimbos
 * de data — nunca seleciona avaliador_id/avaliado_id/tipo_relacionamento
 * (guard rail de anonimização, ver skill backend-anonimizacao-respostas).
 */
export async function calcularTempoMedio360(
  ids: string[],
  periodo: PeriodoConsulta,
): Promise<TempoMedioComponente> {
  if (ids.length === 0) return { horas: 0, amostras: 0 }

  const linha = await AppDataSource.getRepository(EnvioPesquisa)
    .createQueryBuilder('envio')
    .innerJoin(RelacionamentoAvaliacao, 'rel', 'rel.id = envio.relacionamento_id')
    .select('AVG(EXTRACT(EPOCH FROM (envio.concluido_em - envio.enviado_em)) / 3600)', 'horas')
    .addSelect('COUNT(*)', 'amostras')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('envio.enviado_em IS NOT NULL')
    .andWhere('envio.concluido_em IS NOT NULL')
    .andWhere('envio.concluido_em::date BETWEEN :de::date AND :ate::date', {
      de: periodo.de,
      ate: periodo.ate,
    })
    .getRawOne<{ horas: string | null; amostras: string }>()

  return { horas: linha?.horas ? Number(linha.horas) : 0, amostras: Number(linha?.amostras ?? 0) }
}

/**
 * Query F — tempo médio de resposta clima (spec 2.4): da data de envio da
 * CAMPANHA (1 linha envios_pesquisa por ciclo, via ciclo_id) até
 * respondeu_em de cada participante já respondido, filtrado pelo carimbo de
 * RESPOSTA dentro do período. SÓ AVG/COUNT sobre carimbos de data (guard
 * rail de anonimização).
 */
export async function calcularTempoMedioClima(
  ids: string[],
  periodo: PeriodoConsulta,
): Promise<TempoMedioComponente> {
  if (ids.length === 0) return { horas: 0, amostras: 0 }

  const linha = await AppDataSource.getRepository(CicloParticipante)
    .createQueryBuilder('cp')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.ciclo_id = cp.ciclo_id')
    .select('AVG(EXTRACT(EPOCH FROM (cp.respondeu_em - envio.enviado_em)) / 3600)', 'horas')
    .addSelect('COUNT(*)', 'amostras')
    .where('cp.ciclo_id IN (:...ids)', { ids })
    .andWhere('cp.respondeu_em IS NOT NULL')
    .andWhere('envio.enviado_em IS NOT NULL')
    .andWhere('cp.respondeu_em::date BETWEEN :de::date AND :ate::date', {
      de: periodo.de,
      ate: periodo.ate,
    })
    .getRawOne<{ horas: string | null; amostras: string }>()

  return { horas: linha?.horas ? Number(linha.horas) : 0, amostras: Number(linha?.amostras ?? 0) }
}

/**
 * Peças extraídas de `analise-avaliacoes.service.ts` ("Avaliações",
 * task-backend.md de "Nuvem de Palavras", passo 1) — SEM qualquer mudança de
 * comportamento/SQL. Ganharam um segundo consumidor real
 * (`analise-nuvem-palavras.service.ts`), por isso migraram para cá.
 */

export interface TextoAbertoItem {
  perguntaId: string
  perguntaEnunciado: string
  texto: string
}

export interface GateClimaLinha {
  cicloId: string
  totalRespondentes: number
}

export async function calcularGateClima(ids: string[], periodo: PeriodoConsulta): Promise<GateClimaLinha[]> {
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

export async function buscarTextosClima(
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

export async function buscarTextosParesSubordinado(
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

/**
 * Mínimo de respondentes por ciclo (`ciclos_avaliacao.minimo_respostas_pares`)
 * — `select` explícito na forma de objeto para nunca trazer
 * `anonimizar_respostas_pares` (nem nenhuma outra coluna) de tabela: guard
 * rail crítico nº 1 de "Nuvem de Palavras"/decisão já registrada em
 * "Avaliações"/"Ranking" — esta coluna nunca é lida por nenhum consumidor de
 * `analise-comum.ts`.
 */
export async function buscarMinimosPorCiclo(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()
  const ciclos = await AppDataSource.getRepository(CicloAvaliacao).find({
    where: { id: In(ids) },
    select: { id: true, minimoRespostasPares: true },
  })
  return new Map(ciclos.map((c) => [c.id, c.minimoRespostasPares]))
}

export interface MetricasComplementares {
  totalEnvios: number
  totalRespostas: number
  tempoMedioResposta: { horas: number; amostras: number }
}

/**
 * Composição das 6 funções acima (decisão de modelagem 4 de "Nuvem de
 * Palavras") — mesma fórmula de média ponderada já usada em `buscarVisaoGeral`
 * para o bloco `geral` de `tempoMedioResposta`. Não recalcula lógica nova, só
 * reexecuta as mesmas consultas para o universo de ciclos específico desta
 * chamada.
 */
export async function calcularMetricasComplementares(
  idsAval360: string[],
  idsClima: string[],
  periodo: PeriodoConsulta,
): Promise<MetricasComplementares> {
  const [respostas360, respostasClima, total360, totalClimaParticipantes, tempo360, tempoClima] = await Promise.all([
    contarRespostas360NoPeriodo(idsAval360, periodo),
    contarRespostasClimaNoPeriodo(idsClima, periodo),
    contarTotal360(idsAval360),
    contarTotalParticipantesClima(idsClima),
    calcularTempoMedio360(idsAval360, periodo),
    calcularTempoMedioClima(idsClima, periodo),
  ])

  const amostrasGeral = tempo360.amostras + tempoClima.amostras
  const horasGeral =
    amostrasGeral === 0
      ? 0
      : (tempo360.horas * tempo360.amostras + tempoClima.horas * tempoClima.amostras) / amostrasGeral

  return {
    totalEnvios: total360 + totalClimaParticipantes, // mesmo "totalGeral" (denominador de taxaRespostaMedia) de Visão Geral — renomeado no contrato desta feature
    totalRespostas: respostas360 + respostasClima,
    tempoMedioResposta: { horas: arredondar1(horasGeral), amostras: amostrasGeral },
  }
}

export interface ProgressoCicloLote {
  total: number
  concluidos: number
  percentual: number
}

/**
 * Mesma fórmula de `calcularPercentual` em `ciclos-avaliacao.service.ts` —
 * duplicada localmente porque aquela função é privada do módulo de ciclos
 * (não exportada); pequena duplicação deliberada, mesmo padrão já usado por
 * `validarDataQuery` acima (task-backend.md de "Envios", passo 1.1).
 */
function calcularPercentualLote(total: number, concluidos: number): number {
  return total === 0 ? 0 : Math.round((concluidos / total) * 100)
}

/**
 * Progresso em lote (total/concluídos/percentual) por ciclo, para
 * `idsAval360`/`idsClima` já classificados por `classificarPorTipo`. Replica
 * EXATAMENTE o bloco inline de `ciclos-avaliacao.service.ts::listar()`
 * (decisão de arquitetura 3.2 da spec de "Envios" — duplicação deliberada em
 * vez de extrair/exportar aquele bloco ou fazer `ciclos-avaliacao/` depender
 * de `analise/`). Usada hoje só por `analise-envios.service.ts`, mas fica
 * aqui por ser a peça genuinamente de "análise em lote" — mesmo lugar das
 * outras funções de contagem em lote deste arquivo.
 */
export async function calcularProgressoEmLotePorCiclo(
  idsAval360: string[],
  idsClima: string[],
): Promise<Map<string, ProgressoCicloLote>> {
  const progressoPorCiclo = new Map<string, ProgressoCicloLote>()

  if (idsAval360.length === 0 && idsClima.length === 0) {
    return progressoPorCiclo
  }

  if (idsAval360.length > 0) {
    const totalPorCiclo = new Map<string, number>()
    const concluidosPorCiclo = new Map<string, number>()

    // SÓ CONTAGEM, nunca seleciona avaliador_id/avaliado_id/
    // tipo_relacionamento — guard rail de anonimização, ver skill
    // backend-anonimizacao-respostas.
    const linhasTotal = await AppDataSource.getRepository(RelacionamentoAvaliacao)
      .createQueryBuilder('r')
      .select('r.ciclo_id', 'cicloId')
      .addSelect('COUNT(*)', 'total')
      .where('r.ciclo_id IN (:...ids)', { ids: idsAval360 })
      .groupBy('r.ciclo_id')
      .getRawMany<{ cicloId: string; total: string }>()

    for (const linha of linhasTotal) totalPorCiclo.set(linha.cicloId, Number(linha.total))

    // SÓ CONTAGEM, nunca seleciona avaliador_id/avaliado_id/
    // tipo_relacionamento — guard rail de anonimização, ver skill
    // backend-anonimizacao-respostas.
    const linhasConcluidos = await AppDataSource.getRepository(RelacionamentoAvaliacao)
      .createQueryBuilder('r')
      .innerJoin(EnvioPesquisa, 'envio', 'envio.relacionamento_id = r.id')
      .innerJoin(Resposta, 'resposta', 'resposta.envio_id = envio.id')
      .select('r.ciclo_id', 'cicloId')
      .addSelect('COUNT(*)', 'total')
      .where('r.ciclo_id IN (:...ids)', { ids: idsAval360 })
      .groupBy('r.ciclo_id')
      .getRawMany<{ cicloId: string; total: string }>()

    for (const linha of linhasConcluidos) concluidosPorCiclo.set(linha.cicloId, Number(linha.total))

    for (const id of idsAval360) {
      const total = totalPorCiclo.get(id) ?? 0
      const concluidos = concluidosPorCiclo.get(id) ?? 0
      progressoPorCiclo.set(id, { total, concluidos, percentual: calcularPercentualLote(total, concluidos) })
    }
  }

  if (idsClima.length > 0) {
    // SÓ CONTAGEM, nunca seleciona avaliador_id/avaliado_id/
    // tipo_relacionamento — guard rail de anonimização, ver skill
    // backend-anonimizacao-respostas.
    const linhas = await AppDataSource.getRepository(CicloParticipante)
      .createQueryBuilder('cp')
      .select('cp.ciclo_id', 'cicloId')
      .addSelect('COUNT(*)', 'total')
      .addSelect('COUNT(cp.respondeu_em)', 'concluidos')
      .where('cp.ciclo_id IN (:...ids)', { ids: idsClima })
      .groupBy('cp.ciclo_id')
      .getRawMany<{ cicloId: string; total: string; concluidos: string }>()

    for (const linha of linhas) {
      const total = Number(linha.total)
      const concluidos = Number(linha.concluidos)
      progressoPorCiclo.set(linha.cicloId, {
        total,
        concluidos,
        percentual: calcularPercentualLote(total, concluidos),
      })
    }
  }

  return progressoPorCiclo
}
