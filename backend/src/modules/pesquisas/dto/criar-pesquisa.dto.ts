import type { TipoPesquisa } from '../../../common/enums'

// Sem `cicloId`: uma pesquisa recém-criada sempre nasce `rascunho`
// (hardcoded em pesquisas.service.criar), e vincular um ciclo exige
// `status === 'publicada'` (ver pesquisas.service.ts, validarCicloExistente)
// — logo `cicloId` nunca teria como ser aceito na criação.
/**
 * `tipo` é opcional (default `'avaliacao_360'`, resolvido em
 * `pesquisas.service.criar()`) e IMUTÁVEL depois de criada — nunca aceito
 * por `AtualizarPesquisaDto` (ver esse arquivo, mesmo critério já usado
 * para `status`).
 */
export interface CriarPesquisaDto {
  titulo: string
  mensagemBoasVindas?: string
  logoUrl?: string
  tipo?: TipoPesquisa
}
