import type { CodigoErroColetaPublica } from '../../types/respostaPublica'
import type { SeveridadeEstadoPublico } from '../../components/publico/TelaEstadoPublico/TelaEstadoPublico'

/**
 * Mensagens dos estados terminais da coleta pública, indexadas por
 * `ApiError.codigo`. `BLOQUEADO_TENTATIVAS_CPF` é deliberadamente genérica —
 * nunca revela se o bloqueio foi por CPF errado, envio expirado etc.
 * `ERRO_DESCONHECIDO` cobre falha de rede/erro sem código semântico
 * reconhecido.
 */
export const MENSAGENS_ERRO_PUBLICO: Record<
  CodigoErroColetaPublica | 'ERRO_DESCONHECIDO',
  { titulo: string; mensagem: string; severidade: SeveridadeEstadoPublico }
> = {
  LINK_INVALIDO: {
    titulo: 'Link inválido',
    mensagem: 'Este link de acesso não é válido. Verifique se o endereço foi copiado corretamente.',
    severidade: 'erro',
  },
  BLOQUEADO_TENTATIVAS_CPF: {
    titulo: 'Acesso bloqueado',
    mensagem: 'Não foi possível confirmar seus dados. Procure o setor de RH.',
    severidade: 'bloqueio',
  },
  CICLO_OU_PESQUISA_INATIVOS: {
    titulo: 'Pesquisa indisponível',
    mensagem: 'Este ciclo ou pesquisa não está mais ativo.',
    severidade: 'erro',
  },
  ENVIO_EXPIRADO: {
    titulo: 'Link expirado',
    mensagem: 'Este link de acesso expirou.',
    severidade: 'erro',
  },
  JA_RESPONDIDO: {
    titulo: 'Resposta já registrada',
    mensagem: 'Você já respondeu esta pesquisa.',
    severidade: 'erro',
  },
  CPF_NAO_CONFERE: {
    titulo: 'CPF não confere',
    mensagem: 'CPF não confere. Verifique e tente novamente.',
    severidade: 'erro',
  },
  SESSAO_INVALIDA: {
    titulo: 'Sessão inválida',
    mensagem: 'Sua sessão não é válida. Acesse o link novamente para recomeçar.',
    severidade: 'erro',
  },
  SESSAO_EXPIRADA: {
    titulo: 'Sessão expirada',
    mensagem: 'Sua sessão expirou. Acesse o link novamente para recomeçar.',
    severidade: 'erro',
  },
  SESSAO_JA_UTILIZADA: {
    titulo: 'Sessão já utilizada',
    mensagem: 'Esta sessão já foi utilizada.',
    severidade: 'erro',
  },
  RESPOSTA_INCOMPLETA: {
    titulo: 'Resposta incompleta',
    mensagem: 'Uma ou mais perguntas obrigatórias não foram respondidas.',
    severidade: 'erro',
  },
  PERGUNTA_FORA_DA_PESQUISA: {
    titulo: 'Não foi possível enviar',
    mensagem: 'Uma ou mais respostas não puderam ser processadas.',
    severidade: 'erro',
  },
  ERRO_DESCONHECIDO: {
    titulo: 'Não foi possível conectar',
    mensagem: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
    severidade: 'erro',
  },
}
