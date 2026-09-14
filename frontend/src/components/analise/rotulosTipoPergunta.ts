import type { TipoPerguntaEstruturada } from '../../types/analise'

const ROTULOS: Record<TipoPerguntaEstruturada, string> = {
  likert: 'Likert',
  matriz: 'Matriz',
  caixa_selecao: 'Caixa de seleção',
}

export function rotuloTipoPergunta(tipo: TipoPerguntaEstruturada): string {
  return ROTULOS[tipo]
}
