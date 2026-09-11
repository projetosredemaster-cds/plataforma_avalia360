// Payload 100% agregado — nenhum campo identifica avaliador/avaliado/tipo de
// relacionamento. Nunca combinar com `types/ciclo.ts` (`Relacionamento`) ou
// qualquer dado identificado.

export interface DistribuicaoTipoMetrica {
  totalCiclos: number
  totalRespostas: number
}

export interface TempoMedioComponente {
  horas: number
  amostras: number
}

export interface VisaoGeralAnalise {
  periodo: { de: string; ate: string } // 'YYYY-MM-DD'
  cicloId: string | null
  totalCiclos: number
  totalRespostas: number
  distribuicaoPorTipo: {
    avaliacao_360: DistribuicaoTipoMetrica
    clima_geral: DistribuicaoTipoMetrica
  }
  taxaRespostaMedia: number // percentual, já ponderado, 1 casa decimal
  tempoMedioResposta: {
    geral: TempoMedioComponente
    avaliacao_360: TempoMedioComponente
    clima_geral: TempoMedioComponente
  }
}

// ---- "Avaliações" (GET /api/analise/avaliacoes) ----
// Payload MISTO, ao contrário de VisaoGeralAnalise acima:
// - `avaliacao360.identificadas` traz identidade completa (avaliadorId +
//   avaliadorNome) — CORRETO e esperado para autoavaliacao/gestor/externo,
//   que não têm terceiro a proteger (spec `analise-avaliacoes`, seção 3.2).
// - `avaliacao360.paresSubordinado` e `climaGeral` NUNCA trazem
//   avaliadorId/avaliadorNome nem nenhum campo de identidade do avaliador —
//   só saem quando `liberado === true`, já agregados/reembaralhados pelo
//   backend. `liberado === false` é um estado FINAL de bloqueio para
//   QUALQUER papel (nenhum bypass para admin/gestor_rh) — nunca modelar como
//   array vazio nem tratar como algo "contornável" na UI.
// - `textos` dentro de um grupo liberado já vem embaralhado pelo backend A
//   CADA CHAMADA — nunca reordenar no frontend, nunca exibir número de
//   posição.
// - `nomeCiclo` é metadado administrativo do ciclo (não identidade de
//   avaliador), usado pela UI para os cabeçalhos de Accordion por ciclo.

export interface TextoAbertoItem {
  perguntaId: string
  perguntaEnunciado: string
  texto: string
}

export type TipoRelacionamentoIdentificado = 'autoavaliacao' | 'gestor' | 'externo'
export type TipoRelacionamentoAnonimizado = 'pares' | 'subordinado'

export interface AvaliacaoIdentificada {
  tipoRelacionamento: TipoRelacionamentoIdentificado
  cicloId: string
  nomeCiclo: string
  avaliadoId: string
  avaliadoNome: string
  avaliadorId: string
  avaliadorNome: string
  perguntaId: string
  perguntaEnunciado: string
  texto: string
}

export interface GrupoParesSubordinado {
  cicloId: string
  nomeCiclo: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: TipoRelacionamentoAnonimizado
  totalRespondentes: number
  minimoNecessario: number
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  textos?: TextoAbertoItem[]
}

export interface GrupoClimaGeral {
  cicloId: string
  nomeCiclo: string
  totalRespondentes: number
  minimoNecessario: number
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  textos?: TextoAbertoItem[]
}

export interface AvaliacoesAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  avaliacao360: {
    identificadas: AvaliacaoIdentificada[]
    paresSubordinado: GrupoParesSubordinado[]
  }
  climaGeral: GrupoClimaGeral[]
}

// ---- "Ranking" (GET /api/analise/ranking) ----
// Identifica o AVALIADO (avaliadoId/avaliadoNome) — esperado e correto, o
// ranking é sobre quem está sendo avaliado. NUNCA identifica o AVALIADOR de
// relações pares/subordinado — nenhum campo de nenhuma interface abaixo
// carrega avaliadorId/nome de avaliador, e nenhum campo numérico de contagem
// de respondentes/membros existe em nenhuma condição (só os booleanos abaixo).
// `mediaLikert`/`mediaMatriz` já vêm normalizadas em percentual (0-100) e
// arredondadas pelo backend — nunca recalculadas aqui. `posicao` já vem
// calculada com semântica RANK() (empate = mesma posição) e com as linhas
// sem nota (`media* === null` na métrica de ordenação) já posicionadas no
// fim do array — nunca reordenar `linhas` no frontend.

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
