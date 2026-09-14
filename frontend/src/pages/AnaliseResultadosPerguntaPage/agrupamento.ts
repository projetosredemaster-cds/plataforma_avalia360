import type { ResultadoPergunta360, ResultadoPerguntaClima, ResultadosPerguntaAnalise } from '../../types/analise'

export interface GrupoCicloResultados {
  cicloId: string
  nomeCiclo: string
  avaliacao360: ResultadoPergunta360[]
  climaGeral: ResultadoPerguntaClima[]
}

/**
 * Só agrupa visualmente — não reordena. `avaliacao360`/`climaGeral` já
 * chegam do backend ordenados por nomeCiclo e depois pergunta.ordem; a ordem
 * de inserção no Map (primeiro ciclo encontrado = primeira chave) preserva
 * essa ordenação.
 */
export function agruparPorCiclo(dados: ResultadosPerguntaAnalise): GrupoCicloResultados[] {
  const mapa = new Map<string, GrupoCicloResultados>()

  function garantir(cicloId: string, nomeCiclo: string): GrupoCicloResultados {
    let grupo = mapa.get(cicloId)
    if (!grupo) {
      grupo = { cicloId, nomeCiclo, avaliacao360: [], climaGeral: [] }
      mapa.set(cicloId, grupo)
    }
    return grupo
  }

  for (const item of dados.avaliacao360) garantir(item.cicloId, item.nomeCiclo).avaliacao360.push(item)
  for (const item of dados.climaGeral) garantir(item.cicloId, item.nomeCiclo).climaGeral.push(item)

  return Array.from(mapa.values())
}
