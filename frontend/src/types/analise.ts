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
