import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { ErroHttp } from '../../common/erro-http'
import { ehUuidValido } from '../../common/uuid'
import type { ColaboradorAutenticado } from '../../types/express'
import { buscarCicloOuFalhar } from '../ciclos-avaliacao/ciclos-avaliacao.service'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import {
  PAPEIS_COM_ACESSO,
  buscarUniversoCiclos,
  classificarPorTipo,
  calcularProgressoEmLotePorCiclo,
  validarDataQuery,
} from './analise-comum'

/**
 * "Envios" (Análise → Quantitativa) — única função exportada deste arquivo,
 * sempre restrita a admin/gestor_rh (`garantirPapel` como primeira linha,
 * mesmo padrão de todo outro service de `analise/`). Tela agregada por CICLO
 * INTEIRO (1 linha = 1 ciclo, contagens de total/pendente/respondido) — nunca
 * quebra por avaliado nem por tipo de relacionamento, por isso não há gate de
 * `minimo_respostas_pares` (skill backend-anonimizacao-respostas, spec da
 * feature seção 6): a menor unidade exposta aqui é o ciclo, não um avaliado
 * individual, então o cenário que aquele gate protege não se aplica.
 */

export interface LinhaEnvioAnalise {
  cicloId: string
  nome: string
  tipoPesquisa: 'avaliacao_360' | 'clima_geral' | null
  status: 'rascunho' | 'ativo' | 'encerrado'
  dataInicio: string
  dataFim: string
  totalEnvios: number
  totalPendente: number
  totalRespondido: number
  percentualRespondido: number
}

export interface EnviosAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  ciclos: LinhaEnvioAnalise[]
}

export interface BuscarEnviosAnaliseDto {
  de: unknown
  ate: unknown
  cicloId?: unknown
}

export async function buscarEnviosAnalise(
  ator: ColaboradorAutenticado,
  dto: BuscarEnviosAnaliseDto,
): Promise<EnviosAnalise> {
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
    return { periodo, cicloId, ciclos: [] }
  }

  const { idsAval360, idsClima } = await classificarPorTipo(idsUniverso)
  const progressoPorCiclo = await calcularProgressoEmLotePorCiclo(idsAval360, idsClima)

  // `select` explícito — nunca trazer `minimoRespostasPares`/
  // `anonimizarRespostasPares`/`criadoPor`/`tiposRelacionamentoGerados`, que
  // esta tela não usa e não deve expor.
  const ciclos = await AppDataSource.getRepository(CicloAvaliacao).find({
    where: { id: In(idsUniverso) },
    select: { id: true, nome: true, dataInicio: true, dataFim: true, status: true, criadoEm: true },
    order: { dataInicio: 'DESC', criadoEm: 'DESC' },
  })

  const setAval360 = new Set(idsAval360)
  const setClima = new Set(idsClima)

  const linhas: LinhaEnvioAnalise[] = ciclos.map((ciclo) => {
    const tipoPesquisa: LinhaEnvioAnalise['tipoPesquisa'] = setAval360.has(ciclo.id)
      ? 'avaliacao_360'
      : setClima.has(ciclo.id)
        ? 'clima_geral'
        : null

    const progresso = progressoPorCiclo.get(ciclo.id) ?? { total: 0, concluidos: 0, percentual: 0 }

    return {
      cicloId: ciclo.id,
      nome: ciclo.nome,
      tipoPesquisa,
      status: ciclo.status,
      dataInicio: ciclo.dataInicio,
      dataFim: ciclo.dataFim,
      totalEnvios: progresso.total,
      totalPendente: progresso.total - progresso.concluidos,
      totalRespondido: progresso.concluidos,
      percentualRespondido: progresso.percentual,
    }
  })

  return { periodo, cicloId, ciclos: linhas }
}
