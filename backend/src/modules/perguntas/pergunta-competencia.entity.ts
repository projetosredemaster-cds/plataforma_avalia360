import { Entity, PrimaryColumn } from 'typeorm'

/**
 * Tabela de junção pura (`perguntas_competencias`) — vínculo relacional
 * entre pergunta tipo `matriz` e as competências avaliadas nela (decisão
 * assumida 9 do plano da task: sempre relacional, nunca dentro do jsonb
 * `perguntas.configuracao`, para permitir validar existência de FK). Vive
 * dentro do módulo `perguntas` por ser um detalhe de implementação da
 * pergunta `matriz`, não uma entidade de primeira classe com CRUD próprio.
 */
@Entity('perguntas_competencias')
export class PerguntaCompetencia {
  @PrimaryColumn({ name: 'pergunta_id', type: 'uuid' })
  perguntaId!: string

  @PrimaryColumn({ name: 'competencia_id', type: 'uuid' })
  competenciaId!: string
}
