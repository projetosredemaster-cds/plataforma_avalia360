// `ordem` não é aceito no body — sempre calculado no service
// (MAX(ordem) + 1 dentro da pesquisa, ou 1 se for a primeira página).
export interface CriarPaginaDto {
  titulo?: string
}
