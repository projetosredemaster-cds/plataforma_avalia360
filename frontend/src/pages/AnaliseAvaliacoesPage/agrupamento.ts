import type {
  AvaliacaoIdentificada,
  AvaliacoesAnalise,
  GrupoClimaGeral,
  GrupoParesSubordinado,
} from '../../types/analise'

export interface GrupoCiclo {
  cicloId: string
  nomeCiclo: string
  identificadas: AvaliacaoIdentificada[]
  paresSubordinado: GrupoParesSubordinado[]
  climaGeral: GrupoClimaGeral[]
}

export function agruparPorCiclo(dados: AvaliacoesAnalise): GrupoCiclo[] {
  const mapa = new Map<string, GrupoCiclo>()

  function garantir(cicloId: string, nomeCiclo: string): GrupoCiclo {
    let grupo = mapa.get(cicloId)
    if (!grupo) {
      grupo = { cicloId, nomeCiclo, identificadas: [], paresSubordinado: [], climaGeral: [] }
      mapa.set(cicloId, grupo)
    }
    return grupo
  }

  for (const item of dados.avaliacao360.identificadas) garantir(item.cicloId, item.nomeCiclo).identificadas.push(item)
  for (const grupo of dados.avaliacao360.paresSubordinado) garantir(grupo.cicloId, grupo.nomeCiclo).paresSubordinado.push(grupo)
  for (const grupo of dados.climaGeral) garantir(grupo.cicloId, grupo.nomeCiclo).climaGeral.push(grupo)

  return Array.from(mapa.values())
}

export interface GrupoPergunta<T> {
  perguntaId: string
  perguntaEnunciado: string
  itens: T[]
}

export function agruparIdentificadasPorPergunta(itens: AvaliacaoIdentificada[]): GrupoPergunta<AvaliacaoIdentificada>[] {
  const mapa = new Map<string, GrupoPergunta<AvaliacaoIdentificada>>()
  for (const item of itens) {
    let bucket = mapa.get(item.perguntaId)
    if (!bucket) {
      bucket = { perguntaId: item.perguntaId, perguntaEnunciado: item.perguntaEnunciado, itens: [] }
      mapa.set(item.perguntaId, bucket)
    }
    bucket.itens.push(item)
  }
  return Array.from(mapa.values())
}
