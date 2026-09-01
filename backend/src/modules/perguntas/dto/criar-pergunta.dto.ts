import type { TipoPergunta } from '../../../common/enums'

// `configuracao` e `competenciaIds` são campos IRMÃOS, de nível superior —
// competências continuam sendo um vínculo relacional (tabela
// `perguntas_competencias`, decisão assumida 9 do plano), nunca um valor
// dentro de `configuracao`. Um blob jsonb não permite validar existência de
// FK; a relação permite (404 COMPETENCIA_NAO_ENCONTRADA).
export interface CriarPerguntaDto {
  tipo: TipoPergunta
  enunciado: string
  obrigatoria?: boolean
  configuracao?: Record<string, unknown>
  competenciaIds?: string[]
}
