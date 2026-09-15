/**
 * Classes Tailwind do painel azul que agrupa textos abertos (por pergunta) nas
 * telas de Avaliações. Fonte única para as duas seções de Avaliação 360
 * ("respostas identificadas" e "pares e subordinados"), que devem permanecer
 * visualmente idênticas no nível do contêiner.
 *
 * A variante sem cantos arredondados (`PAINEL_TEXTO_ABERTO_BASE`) continua
 * sendo a usada pela seção "Clima e Satisfação" (via `TextoAbertoLista`), que
 * não deve receber nenhuma alteração visual.
 */
export const PAINEL_TEXTO_ABERTO_BASE = 'flex flex-col gap-2 bg-blue-50 border-blue-200 p-2'

export const PAINEL_TEXTO_ABERTO_ARREDONDADO = `${PAINEL_TEXTO_ABERTO_BASE} rounded-lg`
