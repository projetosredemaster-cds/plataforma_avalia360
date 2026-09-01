// Update parcial — não declara `status` (gerenciado só pela rota de
// transição dedicada, PATCH .../status): qualquer `status` recebido aqui é
// ignorado silenciosamente, mesmo padrão usado para `usuarioAuthId` em
// atualizar-colaborador.dto.ts.
//
// `cicloId`, `mensagemBoasVindas` e `logoUrl` admitem `string | null` (além
// de omitido) para diferenciar três estados: chave ausente do body -> não
// mexe; chave presente com `null` -> limpa o campo (grava NULL na coluna);
// chave presente com uma string -> valida (formato de UUID para `cicloId`;
// texto não vazio dentro do limite de tamanho para os outros dois) e grava.
// Distinção feita no service via `'campo' in dto`, nunca `=== undefined` —
// mesmo padrão já usado para `equipeId`/`gestorId` em
// colaboradores.service.ts. Correção de bug de contrato: antes desta
// mudança não havia caminho para limpar `mensagemBoasVindas`/`logoUrl` já
// preenchidos (chave omitida e `null` explícito eram tratados da mesma
// forma — "não alterar").
export interface AtualizarPesquisaDto {
  titulo?: string
  mensagemBoasVindas?: string | null
  logoUrl?: string | null
  cicloId?: string | null
}
