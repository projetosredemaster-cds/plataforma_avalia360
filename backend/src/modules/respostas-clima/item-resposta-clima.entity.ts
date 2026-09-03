import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { Pergunta } from '../perguntas/pergunta.entity'
import { RespostaClima } from './resposta-clima.entity'

@Entity('itens_resposta_clima')
export class ItemRespostaClima {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'resposta_clima_id', type: 'uuid' })
  respostaClimaId!: string

  @ManyToOne(() => RespostaClima, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resposta_clima_id' })
  respostaClima!: RespostaClima

  @Column({ name: 'pergunta_id', type: 'uuid' })
  perguntaId!: string

  @ManyToOne(() => Pergunta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pergunta_id' })
  pergunta!: Pergunta

  @Column({ type: 'jsonb', default: {} })
  valor!: Record<string, unknown>

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date
}
