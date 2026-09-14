import type { ColaboradorOpcao } from '../../components/perguntas/PerguntaPessoa/PerguntaPessoaResposta'

/**
 * Lista fictícia usada só para renderizar a pergunta `pessoa` na
 * pré-visualização — o endpoint do construtor (`GET /api/pesquisas/:id`)
 * nunca retorna colaboradores reais para esse tipo de pergunta (isso só
 * existe no fluxo público, dependente de um ciclo/relacionamento real). IDs
 * com prefixo `ficticio-` deliberadamente não-UUID, para nunca colidir por
 * acidente com um `colaborador.id` real caso alguém reaproveite a constante
 * em outro lugar por engano. Uso exclusivo de `PreviewPagina.tsx` — nunca
 * tratar como dado real em nenhum outro ponto da tela.
 */
export const COLABORADORES_FICTICIOS: ColaboradorOpcao[] = [
  { id: 'ficticio-1', nomeCompleto: 'Colaborador Exemplo 1' },
  { id: 'ficticio-2', nomeCompleto: 'Colaborador Exemplo 2' },
  { id: 'ficticio-3', nomeCompleto: 'Colaborador Exemplo 3' },
]
