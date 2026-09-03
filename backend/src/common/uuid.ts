const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Checagem de formato UUID (v1-v5, mesmo padrão frouxo já usado pelo
 * Postgres para aceitar o tipo `uuid`) — usada para rejeitar tokens
 * malformados ANTES de consultar o banco em rotas públicas (`/api/publico/
 * ...`), onde um erro de driver do Postgres para um valor não-UUID viraria
 * `500` em vez do `404` esperado. Retorna boolean puro (sem lançar); quem
 * chama decide o erro HTTP — sempre o MESMO usado para "não encontrado", para
 * não vazar a diferença entre "malformado" e "inexistente".
 */
export function ehUuidValido(valor: unknown): valor is string {
  return typeof valor === 'string' && REGEX_UUID.test(valor)
}
