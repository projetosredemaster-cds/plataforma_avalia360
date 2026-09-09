/**
 * Baseline compartilhado de "respostas conhecidas" por ciclo, reaproveitado
 * entre `CiclosListPage` e `CicloDetalhePage` — evita duplicar a lógica de
 * comparação baseline-vs-contagem-atual em cada tela. Map em memória
 * (module-level): sobrevive à navegação entre páginas dentro da mesma sessão
 * do SPA, mas não a um reload de página inteira — mesmo comportamento já
 * aceito pelo `baselineConcluidosRef` (ref local) que já existia em
 * `CicloDetalhePage`.
 */
const baselinePorCiclo = new Map<string, number>()

/**
 * Registra a contagem atual como "vista" — chamado quando o usuário
 * efetivamente vê/atualiza os dados de um ciclo (nunca só por causa de um
 * tick de polling silencioso).
 */
export function marcarComoVisto(cicloId: string, concluidosAtual: number): void {
  baselinePorCiclo.set(cicloId, concluidosAtual)
}

/**
 * Só define o baseline se este ciclo ainda não tem um — evita marcar como
 * "nova resposta" algo que só está aparecendo pela primeira vez nesta
 * sessão. Idempotente: nunca sobrescreve um baseline já existente.
 */
export function inicializarBaselineSeAusente(cicloId: string, concluidosAtual: number): void {
  if (!baselinePorCiclo.has(cicloId)) {
    baselinePorCiclo.set(cicloId, concluidosAtual)
  }
}

/**
 * Reaproveitado tanto pelo polling do detalhe quanto pelo da listagem —
 * mesma regra de comparação nos dois lugares.
 */
export function houveNovaResposta(cicloId: string, concluidosAtual: number): boolean {
  const baseline = baselinePorCiclo.get(cicloId)
  return baseline !== undefined && concluidosAtual > baseline
}
