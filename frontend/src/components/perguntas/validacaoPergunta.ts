import type { ConfiguracaoLikert, ConfiguracaoPessoa } from '../../types/pesquisa'

/**
 * Funções puras de validação/ajuste compartilhadas pelos editores e
 * componentes de resposta de pergunta. Mantidas fora dos arquivos de
 * componente para não violar `react-refresh/only-export-components` (regra
 * que exige que um arquivo consumido pelo Fast Refresh só exporte
 * componentes).
 */

export const NIVEIS_MIN = 2
export const NIVEIS_MAX = 10

/** Espelha a validação do backend para `{ niveis, rotulos }` (likert e matriz). */
export function validarConfiguracaoLikert(configuracao: ConfiguracaoLikert): boolean {
  return (
    Number.isInteger(configuracao.niveis) &&
    configuracao.niveis >= NIVEIS_MIN &&
    configuracao.niveis <= NIVEIS_MAX &&
    configuracao.rotulos.length === configuracao.niveis &&
    configuracao.rotulos.every((rotulo) => rotulo.trim().length > 0)
  )
}

/** Ajusta o array de `rotulos` para ter exatamente `niveis` itens, preenchendo/truncando. */
export function ajustarRotulosParaNiveis(niveis: number, rotulosAtuais: string[]): string[] {
  return Array.from({ length: niveis }, (_, indice) => rotulosAtuais[indice] ?? String(indice + 1))
}

/** Espelha o `422 MATRIZ_SEM_COMPETENCIA` do backend: pelo menos 1 competência selecionada. */
export function validarPerguntaMatriz(configuracao: ConfiguracaoLikert, competenciaIds: string[]): boolean {
  return validarConfiguracaoLikert(configuracao) && competenciaIds.length > 0
}

/** Espelha a validação do backend: `filtroRelacionamento` não pode ficar vazio. */
export function validarConfiguracaoPessoa(configuracao: ConfiguracaoPessoa): boolean {
  return configuracao.filtroRelacionamento.length > 0
}

// --- Validação de resposta (usada pelo futuro formulário público de resposta, fora de escopo desta task) ---

export function likertRespostaValida(obrigatoria: boolean, valor: { nota: number } | null): boolean {
  return !obrigatoria || valor != null
}

export function textoAbertoRespostaValida(obrigatoria: boolean, valor: { texto: string } | null): boolean {
  return !obrigatoria || Boolean(valor?.texto.trim())
}

export function matrizRespostaValida(
  obrigatoria: boolean,
  competencias: { id: string }[],
  valor: { notas: Record<string, number> } | null,
): boolean {
  if (!obrigatoria) return true
  if (!valor) return false
  return competencias.every((competencia) => valor.notas[competencia.id] != null)
}

export function pessoaRespostaValida(obrigatoria: boolean, valor: { colaboradorId: string } | null): boolean {
  return !obrigatoria || Boolean(valor?.colaboradorId)
}
