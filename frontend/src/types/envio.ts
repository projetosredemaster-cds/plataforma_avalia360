import type { TipoPesquisa } from './pesquisa'
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
 * Envio gerado a partir de `ciclo_participantes` (pesquisa `clima_geral`) —
 * SEM avaliador/avaliado/tipoRelacionamento (essa dimensão não existe para
 * clima). `destinatario` é identificado, mas é dado ESTRUTURAL de controle
 * de envio (quem recebeu o link), não uma resposta — mesmo critério já
 * aplicado ao braço `avaliacao_360`. NUNCA renderizar
 * avaliador/avaliado/tipoRelacionamento para um item deste braço, e NUNCA
 * aplicar a regra de anonimização de pares/subordinado aqui — essa regra é
 * exclusiva de `avaliacao_360`.
 */
export interface EnvioClimaGeralResposta extends EnvioComum {
  origem: 'colaborador'
  destinatario: { id: string; nomeCompleto: string }
}

export type EnvioPesquisa = EnvioAvaliacao360Resposta | EnvioClimaGeralResposta

/** Narrowing para o braço `avaliacao_360` — usar em vez de cast (`as`). */
export function ehEnvioAvaliacao360(envio: EnvioPesquisa): envio is EnvioAvaliacao360Resposta {
  return envio.origem === 'relacionamento'
}

/** Narrowing para o braço `clima_geral` — usar em vez de cast (`as`). */
export function ehEnvioClimaGeral(envio: EnvioPesquisa): envio is EnvioClimaGeralResposta {
  return envio.origem === 'colaborador'
}

/**
 * Resposta de `GET /api/ciclos/:cicloId/envios`. `tipoPesquisa` é `null`
 * SOMENTE quando `envios` está vazio (ciclo ainda não ativado) — nunca
 * interpretar como erro. `CicloDetalhePage` usa a pesquisa vinculada já
 * carregada como fonte primária de verdade do tipo (ver
 * `task-frontend.md`), tratando este campo como reforço/fallback.
 */
export interface ListarEnviosCicloResposta {
  tipoPesquisa: TipoPesquisa | null
  envios: EnvioPesquisa[]
}
