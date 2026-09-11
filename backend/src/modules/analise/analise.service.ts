import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { ErroHttp } from '../../common/erro-http'
import { ehUuidValido } from '../../common/uuid'
import type { ColaboradorAutenticado } from '../../types/express'
import { buscarCicloOuFalhar } from '../ciclos-avaliacao/ciclos-avaliacao.service'
import { CicloParticipante } from '../ciclo-participantes/ciclo-participante.entity'
import {
  PAPEIS_COM_ACESSO,
  arredondar1,
  buscarUniversoCiclos,
  classificarPorTipo,
  contarRespostas360NoPeriodo,
  contarRespostasClimaNoPeriodo,
  contarTotal360,
  contarTotalParticipantesClima,
  calcularTempoMedio360,
  calcularTempoMedioClima,
  validarDataQuery,
} from './analise-comum'
import type { TempoMedioComponente } from './analise-comum'

export interface DistribuicaoTipoMetrica {
  totalCiclos: number
  totalRespostas: number
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
