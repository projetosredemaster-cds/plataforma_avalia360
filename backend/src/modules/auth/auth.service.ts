import type { PapelColaborador } from '../../common/enums'
import type { ColaboradorAutenticado } from '../../types/express'

export interface MeuPerfilResposta {
  id: string
  nomeCompleto: string
  email: string
  papel: PapelColaborador
  ativo: boolean
}

/**
 * Desvio consciente do plano original (task-backend.md não previu este
 * endpoint) — decisão do orquestrador para destravar o guard de rota do
 * frontend, que precisa descobrir o papel do usuário logado.
 *
 * Não viola o guard rail de anonimização/exposição de estrutura
 * organizacional (seção 1.7 do plano): expõe exclusivamente o registro do
 * próprio chamador (nunca aceita `:id` de terceiros nem lista colaboradores),
 * não inclui `cpf`, não inclui `equipe`/`gestor` nem qualquer vínculo
 * avaliador→avaliado. `colaborador` comum nunca chega aqui porque nunca tem
 * `usuario_auth_id` — o middleware `autenticar` já bloqueia essa sessão
 * antes de preencher `req.colaboradorAutenticado`.
 *
 * `ativo: true` é seguro de afirmar sem nova consulta ao banco: o middleware
 * `autenticar` só preenche `req.colaboradorAutenticado` quando encontra o
 * colaborador vinculado com `ativo = true` (ver src/middlewares/autenticacao.ts).
 */
export function meuPerfil(ator: ColaboradorAutenticado): MeuPerfilResposta {
  return {
    id: ator.id,
    nomeCompleto: ator.nomeCompleto,
    email: ator.email,
    papel: ator.papel,
    ativo: true,
  }
}
