// Sem `cicloId`: uma pesquisa recém-criada sempre nasce `rascunho`
// (hardcoded em pesquisas.service.criar), e vincular um ciclo exige
// `status === 'publicada'` (ver pesquisas.service.ts, validarCicloExistente)
// — logo `cicloId` nunca teria como ser aceito na criação.
export interface CriarPesquisaDto {
  titulo: string
  mensagemBoasVindas?: string
  logoUrl?: string
}
