import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { ErroHttp } from '../../common/erro-http'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
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
