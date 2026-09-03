import type { TipoRelacionamento } from './ciclo'

export type StatusEnvio = 'pendente' | 'enviado' | 'em_andamento' | 'concluido' | 'expirado'

interface EnvioComum {
  id: string
  status: StatusEnvio
  link: string
  quantidadeLembretes: number
  cpfConfirmadoEm: string | null
  concluidoEm: string | null
}

/**
 * Envio gerado a partir de `relacionamentos_avaliacao` (pesquisa
 * `avaliacao_360`) — dado IDENTIFICADO de quem avalia quem
 * (`avaliadorId`/`avaliadorNome`), inclusive para os tipos
 * `pares`/`subordinado`. Só pode ser consumido dentro de `CicloDetalhePage`,
 * atrás do guard de papel admin/gestor_rh.
 */
export interface EnvioAvaliacao360Resposta extends EnvioComum {
  origem: 'relacionamento'
  avaliadorId: string
  avaliadorNome: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: TipoRelacionamento
}

/**
 * O ÚNICO envio (link de campanha) de uma pesquisa `clima_geral` — 1 por
 * ciclo. Substitui `EnvioClimaGeralResposta` (modelo anterior de 1 envio por
 * participante). Sem `destinatario`: não representa mais 1 pessoa, e sim a
 * campanha inteira — a lista de participantes/quem já respondeu vive em
 * `ListarEnviosCampanhaClimaResposta.participantes`, não aqui.
 */
export interface EnvioCampanhaClima extends EnvioComum {
  origem: 'ciclo'
}

/** Retorno das 3 ações (`marcarComoEnviado`/`registrarLembrete`/`expirarEnvio`) — pode alvejar um envio de avaliação 360 OU o envio único de campanha de clima. */
export type EnvioPesquisaAcao = EnvioAvaliacao360Resposta | EnvioCampanhaClima

/** Narrowing para o braço `avaliacao_360` — usar em vez de cast (`as`). */
export function ehEnvioAvaliacao360(envio: EnvioPesquisaAcao): envio is EnvioAvaliacao360Resposta {
  return envio.origem === 'relacionamento'
}

/** Narrowing para o braço `ciclo` (campanha de clima) — usar em vez de cast (`as`). */
export function ehEnvioCampanhaClima(envio: EnvioPesquisaAcao): envio is EnvioCampanhaClima {
  return envio.origem === 'ciclo'
}

/**
 * Metadado de PARTICIPAÇÃO (nunca conteúdo de resposta) de um participante
 * do ciclo em relação à campanha única de clima — `respondeuEm` nullable,
 * nunca inferido/derivado além de `!= null`. Tipo distinto de `Participante`
 * (`types/ciclo.ts`, usado pela seção de gestão de participantes no topo da
 * página): vem de um endpoint diferente (`GET .../envios`), com um propósito
 * diferente. Só pode ser consumido dentro de `CicloDetalhePage`, atrás do
 * guard de papel admin/gestor_rh.
 */
export interface ParticipanteEnvioClima {
  id: string
  colaboradorId: string
  nomeCompleto: string
  respondeuEm: string | null
}

/** Braço `avaliacao_360` do envelope de listagem — INALTERADO. */
export interface ListarEnviosAvaliacao360Resposta {
  tipoPesquisa: 'avaliacao_360'
  envios: EnvioAvaliacao360Resposta[]
}

/**
 * Braço `clima_geral` do envelope de listagem: um único `campanha` (o link
 * único do ciclo) + a lista de `participantes` com `respondeuEm`, em vez de
 * um array de envios (1 por participante, modelo anterior).
 */
export interface ListarEnviosCampanhaClimaResposta {
  tipoPesquisa: 'clima_geral'
  campanha: EnvioCampanhaClima
  participantes: ParticipanteEnvioClima[]
}

/** Caso residual: ciclo ainda sem envios gerados (ainda em rascunho). Esta seção nunca busca nesse estado, mas o tipo precisa cobrir. */
export interface ListarEnviosVazioResposta {
  tipoPesquisa: null
  envios: []
}

export type ListarEnviosCicloResposta =
  | ListarEnviosAvaliacao360Resposta
  | ListarEnviosCampanhaClimaResposta
  | ListarEnviosVazioResposta

/** Narrowing do envelope para o braço `clima_geral` — usar em vez de checar `tipoPesquisa` solto em múltiplos lugares. */
export function ehRespostaCampanhaClima(
  resposta: ListarEnviosCicloResposta,
): resposta is ListarEnviosCampanhaClimaResposta {
  return resposta.tipoPesquisa === 'clima_geral'
}

/** Narrowing do envelope para o braço `avaliacao_360`. */
export function ehRespostaAvaliacao360(
  resposta: ListarEnviosCicloResposta,
): resposta is ListarEnviosAvaliacao360Resposta {
  return resposta.tipoPesquisa === 'avaliacao_360'
}
