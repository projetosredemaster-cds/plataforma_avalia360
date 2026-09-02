import { Entity, PrimaryColumn } from 'typeorm'

@Entity('perguntas_competencias')
export class PerguntaCompetencia {
  @PrimaryColumn({ name: 'pergunta_id', type: 'uuid' })
  perguntaId!: string

  @PrimaryColumn({ name: 'competencia_id', type: 'uuid' })
  competenciaId!: string
}
