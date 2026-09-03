import type { ColaboradorOpcao } from '../components/perguntas/PerguntaPessoa/PerguntaPessoaResposta'
import type { RespostaLikert } from '../components/perguntas/PerguntaLikert/PerguntaLikertResposta'
import type { RespostaMatriz } from '../components/perguntas/PerguntaMatriz/PerguntaMatrizResposta'
import type { RespostaPessoa } from '../components/perguntas/PerguntaPessoa/PerguntaPessoaResposta'
import type { RespostaTextoAberto } from '../components/perguntas/PerguntaTextoAberto/PerguntaTextoAbertoResposta'
import type { Competencia } from './competencia'
import type {
  ConfiguracaoLikert,
  ConfiguracaoPessoa,
  ConfiguracaoTextoAberto,
  TipoPesquisa,
} from './pesquisa'

/**
 * Tipos do fluxo público de coleta de resposta (`/responder/:token`),
 * deliberadamente distintos de `types/envio.ts` (visão identificada de
 * admin/gestor_rh) e `types/pesquisa.ts` (visão do construtor) — ver decisão
 * 2 de `.claude/tasks/coleta-respostas-publica/task-frontend.md`.
 */

/** Os 11 códigos de erro terminais/inline do contrato público (spec seção 4/6). */
export type CodigoErroColetaPublica =
  | 'LINK_INVALIDO'
  | 'BLOQUEADO_TENTATIVAS_CPF'
  | 'CICLO_OU_PESQUISA_INATIVOS'
  | 'ENVIO_EXPIRADO'
  | 'JA_RESPONDIDO'
  | 'CPF_NAO_CONFERE'
  | 'SESSAO_INVALIDA'
  | 'SESSAO_EXPIRADA'
  | 'SESSAO_JA_UTILIZADA'
  | 'RESPOSTA_INCOMPLETA'
  | 'PERGUNTA_FORA_DA_PESQUISA'

export interface StatusEnvioPublicoResposta {
  estado: 'aguardando_cpf'
}

export interface ConfirmarCpfResposta {
  sessaoToken: string
  expiraEm: string
  tipoPesquisa: TipoPesquisa
}

interface PerguntaFormularioCamposComuns {
  id: string
  ordem: number
  enunciado: string
  obrigatoria: boolean
}

export type PerguntaFormularioPublico =
  | (PerguntaFormularioCamposComuns & { tipo: 'likert'; configuracao: ConfiguracaoLikert })
  | (PerguntaFormularioCamposComuns & { tipo: 'texto_aberto'; configuracao: ConfiguracaoTextoAberto })
  | (PerguntaFormularioCamposComuns & {
      tipo: 'matriz'
      configuracao: ConfiguracaoLikert
      competencias: Competencia[]
    })
  | (PerguntaFormularioCamposComuns & {
      tipo: 'pessoa'
      configuracao: ConfiguracaoPessoa
      opcoesPessoa: ColaboradorOpcao[]
    })

export interface PaginaFormularioPublico {
  id: string
  ordem: number
  titulo: string | null
  perguntas: PerguntaFormularioPublico[]
}

export interface FormularioPublicoResposta {
  pesquisa: { titulo: string; mensagemBoasVindas: string | null; logoUrl: string | null }
  paginas: PaginaFormularioPublico[]
}

export type ValorRespostaPublica = RespostaLikert | RespostaTextoAberto | RespostaMatriz | RespostaPessoa

export interface ItemRespostaPayload {
  perguntaId: string
  valor: ValorRespostaPublica
}

export interface EnviarRespostasPayload {
  itens: ItemRespostaPayload[]
}
