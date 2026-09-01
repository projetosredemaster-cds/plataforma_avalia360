// Criação é sempre manual — `status` não é aceito aqui (nasce sempre
// `rascunho`, ver pesquisas.service.ts). Nenhum atalho de auto-geração/IA/
// template de páginas ou perguntas.
export interface CriarPesquisaDto {
  titulo: string
  mensagemBoasVindas?: string
  logoUrl?: string
  cicloId?: string | null
}
