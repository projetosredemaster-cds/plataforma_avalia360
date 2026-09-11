import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { ErroHttp } from '../../common/erro-http'
import { ehUuidValido } from '../../common/uuid'
import type { ColaboradorAutenticado } from '../../types/express'
import { buscarCicloOuFalhar } from '../ciclos-avaliacao/ciclos-avaliacao.service'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { CicloParticipante } from '../ciclo-participantes/ciclo-participante.entity'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'
import { Resposta } from '../respostas/resposta.entity'
import { RespostaClima } from '../respostas-clima/resposta-clima.entity'
import {
  PAPEIS_COM_ACESSO,
  arredondar1,
  buscarUniversoCiclos,
  classificarPorTipo,
  validarDataQuery,
} from './analise-comum'

export interface DistribuicaoTipoMetrica {
  totalCiclos: number
  totalRespostas: number
}

export interface TempoMedioComponente {
  horas: number
  amostras: number
}

export interface VisaoGeralAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  totalCiclos: number
  totalRespostas: number
  distribuicaoPorTipo: {
    avaliacao_360: DistribuicaoTipoMetrica
    clima_geral: DistribuicaoTipoMetrica
  }
  taxaRespostaMedia: number
  tempoMedioResposta: {
    geral: TempoMedioComponente
    avaliacao_360: TempoMedioComponente
    clima_geral: TempoMedioComponente
  }
}

export interface BuscarVisaoGeralDto {
  de: unknown
  ate: unknown
  cicloId?: unknown
}

function payloadZerado(periodo: { de: string; ate: string }, cicloId: string | null): VisaoGeralAnalise {
  return {
    periodo,
    cicloId,
    totalCiclos: 0,
    totalRespostas: 0,
    distribuicaoPorTipo: {
      avaliacao_360: { totalCiclos: 0, totalRespostas: 0 },
      clima_geral: { totalCiclos: 0, totalRespostas: 0 },
    },
    taxaRespostaMedia: 0,
    tempoMedioResposta: {
      geral: { horas: 0, amostras: 0 },
      avaliacao_360: { horas: 0, amostras: 0 },
      clima_geral: { horas: 0, amostras: 0 },
    },
  }
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
async function contarRespostas360NoPeriodo(
  ids: string[],
  periodo: { de: string; ate: string },
): Promise<number> {
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
async function contarRespostasClimaNoPeriodo(
  ids: string[],
  periodo: { de: string; ate: string },
): Promise<number> {
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
async function contarTotal360(ids: string[]): Promise<number> {
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
async function contarTotalParticipantesClima(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  return AppDataSource.getRepository(CicloParticipante).count({ where: { cicloId: In(ids) } })
}

/**
 * Query D — numerador `concluidosClima` (spec 2.3b): participantes de clima
 * já respondidos (`respondeu_em IS NOT NULL`) cujo carimbo cai dentro do
 * período. SÓ CONTAGEM sobre carimbo de data — nenhuma coluna de conteúdo de
 * resposta é tocada (guard rail de anonimização).
 */
async function contarConcluidosClimaNoPeriodo(
  ids: string[],
  periodo: { de: string; ate: string },
): Promise<number> {
  if (ids.length === 0) return 0
  return AppDataSource.getRepository(CicloParticipante)
    .createQueryBuilder('cp')
    .where('cp.ciclo_id IN (:...ids)', { ids })
    .andWhere('cp.respondeu_em IS NOT NULL')
    .andWhere('cp.respondeu_em::date BETWEEN :de::date AND :ate::date', {
      de: periodo.de,
      ate: periodo.ate,
    })
    .getCount()
}

/**
 * Query E — tempo médio de resposta 360 (spec 2.4): AVG(concluido_em -
 * enviado_em) em horas, por relacionamento com envio concluído, filtrado
 * pelo carimbo de CONCLUSÃO dentro do período. SÓ AVG/COUNT sobre carimbos
 * de data — nunca seleciona avaliador_id/avaliado_id/tipo_relacionamento
 * (guard rail de anonimização, ver skill backend-anonimizacao-respostas).
 */
async function calcularTempoMedio360(
  ids: string[],
  periodo: { de: string; ate: string },
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
async function calcularTempoMedioClima(
  ids: string[],
  periodo: { de: string; ate: string },
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
 * Única função exportada do módulo — visão geral agregada da Análise, sempre
 * restrita a admin/gestor_rh (`garantirPapel` como primeira linha, mesmo
 * padrão de todo outro service protegido). Nenhuma métrica desta função
 * quebra por avaliador/avaliado/tipo de relacionamento (spec, seção 3) —
 * guard rail de anonimização é técnico (nunca projetar colunas de
 * identidade), não o limiar `minimo_respostas_pares` (que não se aplica
 * aqui).
 */
export async function buscarVisaoGeral(
  ator: ColaboradorAutenticado,
  dto: BuscarVisaoGeralDto,
): Promise<VisaoGeralAnalise> {
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

  const periodo = { de, ate }

  const idsUniverso = await buscarUniversoCiclos(periodo, cicloId ?? undefined)

  if (idsUniverso.length === 0) {
    return payloadZerado(periodo, cicloId)
  }

  const { idsAval360, idsClima } = await classificarPorTipo(idsUniverso)

  const [
    respostas360,
    respostasClima,
    total360,
    totalClimaParticipantes,
    concluidosClima,
    tempo360,
    tempoClima,
  ] = await Promise.all([
    contarRespostas360NoPeriodo(idsAval360, periodo),
    contarRespostasClimaNoPeriodo(idsClima, periodo),
    contarTotal360(idsAval360),
    contarTotalParticipantesClima(idsClima),
    contarConcluidosClimaNoPeriodo(idsClima, periodo),
    calcularTempoMedio360(idsAval360, periodo),
    calcularTempoMedioClima(idsClima, periodo),
  ])

  // concluidos360 é o MESMO número de respostas360 (decisão de modelagem 9) —
  // reaproveitado, nenhuma segunda query redundante.
  const concluidos360 = respostas360

  const totalGeral = total360 + totalClimaParticipantes
  const concluidosGeral = concluidos360 + concluidosClima
  const taxaRespostaMedia = totalGeral === 0 ? 0 : arredondar1((concluidosGeral / totalGeral) * 100)

  const amostrasGeral = tempo360.amostras + tempoClima.amostras
  const horasGeral =
    amostrasGeral === 0
      ? 0
      : (tempo360.horas * tempo360.amostras + tempoClima.horas * tempoClima.amostras) / amostrasGeral

  return {
    periodo,
    cicloId,
    totalCiclos: idsUniverso.length,
    totalRespostas: respostas360 + respostasClima,
    distribuicaoPorTipo: {
      avaliacao_360: { totalCiclos: idsAval360.length, totalRespostas: respostas360 },
      clima_geral: { totalCiclos: idsClima.length, totalRespostas: respostasClima },
    },
    taxaRespostaMedia,
    tempoMedioResposta: {
      geral: { horas: arredondar1(horasGeral), amostras: amostrasGeral },
      avaliacao_360: { horas: arredondar1(tempo360.horas), amostras: tempo360.amostras },
      clima_geral: { horas: arredondar1(tempoClima.horas), amostras: tempoClima.amostras },
    },
  }
}
