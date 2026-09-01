import type { Competencia } from './competencia'

export type StatusPesquisa = 'rascunho' | 'publicada' | 'encerrada'

/** Exatamente 4 tipos de pergunta no MVP — nenhum outro deve ser adicionado. */
export type TipoPergunta = 'likert' | 'texto_aberto' | 'matriz' | 'pessoa'

export interface ConfiguracaoLikert {
  niveis: number
  rotulos: string[]
}

export type ConfiguracaoTextoAberto = Record<string, never>

export interface ConfiguracaoPessoa {
  filtroRelacionamento: string[]
}

export type ConfiguracaoPergunta = ConfiguracaoLikert | ConfiguracaoTextoAberto | ConfiguracaoPessoa

interface PerguntaCamposComuns {
  id: string
  ordem: number
  enunciado: string
  obrigatoria: boolean
  /**
   * Resolvido pela API a partir de `perguntas_competencias` — sempre `[]`
   * fora do tipo `matriz`. Nunca escrito diretamente pelo frontend; ao
   * enviar para a API, usa-se `competenciaIds` (ver `PerguntaPayload`
   * abaixo), campo de nível superior, nunca aninhado em `configuracao`.
   */
  competencias: Competencia[]
}

export type Pergunta =
  | (PerguntaCamposComuns & { tipo: 'likert'; configuracao: ConfiguracaoLikert })
  | (PerguntaCamposComuns & { tipo: 'texto_aberto'; configuracao: ConfiguracaoTextoAberto })
  | (PerguntaCamposComuns & { tipo: 'matriz'; configuracao: ConfiguracaoLikert })
  | (PerguntaCamposComuns & { tipo: 'pessoa'; configuracao: ConfiguracaoPessoa })

export interface Pagina {
  id: string
  ordem: number
  titulo: string | null
  perguntas: Pergunta[]
}

export interface PesquisaResumo {
  id: string
  titulo: string
  status: StatusPesquisa
  cicloId: string | null
  criadoEm: string
  atualizadoEm: string
}

/** Detalhe completo, usado pelo construtor (`GET /api/pesquisas/:id` e afins). */
export interface Pesquisa {
  id: string
  titulo: string
  mensagemBoasVindas: string | null
  logoUrl: string | null
  status: StatusPesquisa
  cicloId: string | null
  paginas: Pagina[]
  criadoEm: string
  atualizadoEm: string
}

/**
 * Corpo enviado a `POST .../perguntas`. `competenciaIds` é campo de nível
 * superior — irmão de `tipo`/`enunciado`/`configuracao` — nunca aninhado em
 * `configuracao` (contrato confirmado em `task-backend.md`). Só `matriz`
 * pode enviar `competenciaIds` não-vazio (`422 MATRIZ_SEM_COMPETENCIA` se
 * vazio/ausente; `422 COMPETENCIA_FORA_DE_ESCOPO` se outro tipo enviar
 * algo não-vazio).
 */
export type PerguntaPayload =
  | { tipo: 'likert'; enunciado: string; obrigatoria: boolean; configuracao: ConfiguracaoLikert }
  | { tipo: 'texto_aberto'; enunciado: string; obrigatoria: boolean; configuracao: ConfiguracaoTextoAberto }
  | {
      tipo: 'matriz'
      enunciado: string
      obrigatoria: boolean
      configuracao: ConfiguracaoLikert
      competenciaIds: string[]
    }
  | { tipo: 'pessoa'; enunciado: string; obrigatoria: boolean; configuracao: ConfiguracaoPessoa }

/** Corpo enviado a `PUT .../perguntas/:id` — `tipo` não é editável após criado. */
export interface AtualizarPerguntaPayload {
  enunciado?: string
  obrigatoria?: boolean
  configuracao?: ConfiguracaoPergunta
  competenciaIds?: string[]
}

export interface ReordenarItem {
  id: string
  ordem: number
}
