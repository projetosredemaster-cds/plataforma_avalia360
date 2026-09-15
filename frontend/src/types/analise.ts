// Payload 100% agregado — nenhum campo identifica avaliador/avaliado/tipo de
// relacionamento. Nunca combinar com `types/ciclo.ts` (`Relacionamento`) ou
// qualquer dado identificado.

import type { StatusCiclo } from './ciclo'
import type { TipoPesquisa } from './pesquisa'

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

// ---- "Nuvem de Palavras" (GET /api/analise/nuvem-palavras) ----
// Payload 100% agregado — mais simples que os três blocos acima: NENHUM
// campo identifica avaliador, avaliado, ciclo (por palavra) ou tipo de
// relacionamento. `palavras` já vem ordenada por `frequencia` decrescente
// (top 50) pelo backend — NUNCA reordenar/filtrar no frontend. `metricas`
// reaproveita o mesmo shape de tempo médio já usado por `VisaoGeralAnalise`
// (`TempoMedioComponente`), mas é um subconjunto próprio (só
// totalEnvios/totalRespostas/tempoMedioResposta) — não confundir com
// `VisaoGeralAnalise.tempoMedioResposta`, que tem quebra por tipo de
// pesquisa (esta feature não tem).

export interface PalavraFrequencia {
  palavra: string
  frequencia: number
}

export interface MetricasComplementaresNuvem {
  totalEnvios: number
  totalRespostas: number
  tempoMedioResposta: TempoMedioComponente
}

export interface NuvemPalavrasAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  palavras: PalavraFrequencia[]
  metricas: MetricasComplementaresNuvem
  motivoVazio: 'bloqueado_minimo_respondentes' | 'sem_dado' | null
}

// ---- "Resultados por Pergunta" (GET /api/analise/resultados-pergunta) ----
// Tela MAIS ESTRITA do módulo até aqui: nunca expõe totalRespondentes/
// minimoNecessario (diferente de AvaliacoesAnalise) — só liberado/motivo.
// `distribuicao`/`competencias` só existem quando liberado === true.
// `distribuicao` já vem zero-preenchida (todos os níveis 1..niveis / todas
// as opcoesDisponiveis, mesmo com contagem 0) e ORDENADA pelo backend —
// nunca reordenar/completar/filtrar no frontend. `porTipoRelacionamento`
// também já vem em ordem fixa (autoavaliacao, gestor, pares, subordinado,
// externo) — não reordenar.

export interface ContagemNivel {
  nivel: number
  contagem: number
}

export interface ContagemOpcao {
  opcao: string
  contagem: number
}

export type TipoRelacionamentoTodos = TipoRelacionamentoIdentificado | TipoRelacionamentoAnonimizado

export type TipoPerguntaEstruturada = 'likert' | 'matriz' | 'caixa_selecao'

export interface DistribuicaoTipoRelacionamento {
  tipoRelacionamento: TipoRelacionamentoTodos
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  distribuicao?: ContagemNivel[] // ausente quando liberado === false
}

export interface DistribuicaoOpcaoTipoRelacionamento {
  tipoRelacionamento: TipoRelacionamentoTodos
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  distribuicao?: ContagemOpcao[] // ausente quando liberado === false
}

export interface CompetenciaDistribuicao {
  competenciaId: string
  competenciaNome: string
  porTipoRelacionamento: DistribuicaoTipoRelacionamento[]
}

interface ResultadoPerguntaBase360 {
  perguntaId: string
  perguntaEnunciado: string
  cicloId: string
  nomeCiclo: string
}

export interface ResultadoPerguntaLikert360 extends ResultadoPerguntaBase360 {
  tipo: 'likert'
  niveis: number
  rotulos: string[] // rotulos[i] é o rótulo do nível i+1
  porTipoRelacionamento: DistribuicaoTipoRelacionamento[]
}

export interface ResultadoPerguntaMatriz360 extends ResultadoPerguntaBase360 {
  tipo: 'matriz'
  niveis: number
  rotulos: string[] // escala compartilhada por todas as competências da pergunta
  competencias: CompetenciaDistribuicao[] // distribuição SEPARADA por competência
}

export interface ResultadoPerguntaCaixaSelecao360 extends ResultadoPerguntaBase360 {
  tipo: 'caixa_selecao'
  opcoesDisponiveis: string[]
  porTipoRelacionamento: DistribuicaoOpcaoTipoRelacionamento[]
}

export type ResultadoPergunta360 =
  | ResultadoPerguntaLikert360
  | ResultadoPerguntaMatriz360
  | ResultadoPerguntaCaixaSelecao360

interface ResultadoPerguntaBaseClima {
  perguntaId: string
  perguntaEnunciado: string
  cicloId: string
  nomeCiclo: string
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
}

export interface ResultadoPerguntaLikertClima extends ResultadoPerguntaBaseClima {
  tipo: 'likert'
  niveis: number
  rotulos: string[]
  distribuicao?: ContagemNivel[]
}

export interface ResultadoPerguntaMatrizClima extends ResultadoPerguntaBaseClima {
  tipo: 'matriz'
  niveis: number
  rotulos: string[]
  competencias?: Array<{ competenciaId: string; competenciaNome: string; distribuicao: ContagemNivel[] }>
}

export interface ResultadoPerguntaCaixaSelecaoClima extends ResultadoPerguntaBaseClima {
  tipo: 'caixa_selecao'
  opcoesDisponiveis: string[]
  distribuicao?: ContagemOpcao[]
}

export type ResultadoPerguntaClima =
  | ResultadoPerguntaLikertClima
  | ResultadoPerguntaMatrizClima
  | ResultadoPerguntaCaixaSelecaoClima

export interface ResultadosPerguntaAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  avaliacao360: ResultadoPergunta360[]
  climaGeral: ResultadoPerguntaClima[]
}

// ---- "Envios" (GET /api/analise/envios) ----
// Payload 100% agregado por CICLO INTEIRO (`COUNT`/`GROUP BY ciclo_id`) —
// nenhum campo de identidade (`avaliadorId`/`avaliadoId`/`colaboradorId`/
// `tipoRelacionamento`) em nenhum nível. Diferente de `AvaliacoesAnalise`/
// `ResultadosPerguntaAnalise`, não há gate de `minimo_respostas_pares` aqui:
// a menor unidade exposta é o ciclo inteiro, nunca um avaliado/respondente
// individual, então o cenário que aquele gate protege não se aplica (mesmo
// raciocínio já usado por `VisaoGeralAnalise`, que também não tem gate).

export interface LinhaEnvioAnalise {
  cicloId: string
  nome: string
  tipoPesquisa: TipoPesquisa | null // null = sem pesquisa vinculada
  status: StatusCiclo
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
