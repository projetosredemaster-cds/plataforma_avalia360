const FORMATADOR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/** Duplicado deliberado de `AnaliseVisaoGeralPage/formatadores.ts` — só o que esta tela usa. */
export function formatarPercentual(valor: number): string {
  return `${FORMATADOR.format(valor)}%`
}
