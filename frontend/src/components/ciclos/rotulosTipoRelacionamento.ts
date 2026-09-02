import type { TipoRelacionamento } from '../../types/ciclo'

/**
 * Mapa puro de rótulo legível por tipo de relacionamento — usado só para
 * exibir a coluna "Tipo" da tabela de relacionamentos gerados. Arquivo
 * separado (não componente) para não misturar exportação de
 * constante utilitária dentro de um arquivo de componente
 * (`react-refresh/only-export-components`), mesmo padrão já adotado em
 * `components/perguntas/validacaoPergunta.ts`.
 */
export const ROTULOS_TIPO_RELACIONAMENTO: Record<TipoRelacionamento, string> = {
  autoavaliacao: 'Autoavaliação',
  gestor: 'Gestor',
  pares: 'Pares',
  subordinado: 'Subordinado',
  externo: 'Externo',
}
