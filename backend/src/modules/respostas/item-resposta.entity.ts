import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { Pergunta } from '../perguntas/pergunta.entity'
import { Resposta } from './resposta.entity'

@Entity('itens_resposta')
export class ItemResposta {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'resposta_id', type: 'uuid' })
  respostaId!: string

  @ManyToOne(() => Resposta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resposta_id' })
  resposta!: Resposta

  @Column({ name: 'pergunta_id', type: 'uuid' })
  perguntaId!: string

  @ManyToOne(() => Pergunta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pergunta_id' })
  pergunta!: Pergunta

  // Shape por tipo de pergunta, ver docs/schema_avaliacao360_pt_v2.sql:
  // likert { nota }, texto_aberto { texto }, matriz { notas: { <competenciaId>: nota } },
  // pessoa { colaboradorId }.
  @Column({ type: 'jsonb', default: {} })
  valor!: Record<string, unknown>

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date
}
