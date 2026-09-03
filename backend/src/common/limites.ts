/**
 * Limite de tentativas inválidas de confirmação de CPF antes de bloquear um
 * `envios_pesquisa` (coluna `tentativas_cpf_invalidas`). Compartilhado entre
 * `coleta-respostas-publica` (fluxo público, incrementa a contagem e aplica
 * o bloqueio `403 BLOQUEADO_TENTATIVAS_CPF`) e `envios-pesquisa` (fluxo
 * autenticado admin/gestor_rh, expõe `bloqueadoPorTentativas` na resposta e
 * permite o desbloqueio manual via `desbloquearTentativas`) — centralizado
 * aqui para os dois módulos nunca divergirem sobre o valor do limite.
 */
export const LIMITE_TENTATIVAS_CPF_INVALIDAS = 5
