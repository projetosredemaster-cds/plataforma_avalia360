export interface EnviarRespostasDto {
  // Formato/obrigatoriedade validados manualmente no service — o shape de
  // `valor` varia por tipo de pergunta (ver valorValidoParaTipo).
  itens: unknown
}
