import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { ErroHttp } from '../../common/erro-http'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'
import { Resposta } from '../respostas/resposta.entity'
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
