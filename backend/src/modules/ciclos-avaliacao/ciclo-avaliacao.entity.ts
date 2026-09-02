import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { STATUS_CICLO_VALORES, type StatusCiclo } from '../../common/enums'

@Entity('ciclos_avaliacao')
export class CicloAvaliacao {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'text' })
  nome!: string

  @Column({ type: 'text', nullable: true })
  descricao!: string | null

  // TypeORM mapeia `date` como `string` (YYYY-MM-DD), nunca `Date`.
  @Column({ name: 'data_inicio', type: 'date' })
  dataInicio!: string

  @Column({ name: 'data_fim', type: 'date' })
  dataFim!: string

  @Column({
    type: 'enum',
    enum: STATUS_CICLO_VALORES,
    enumName: 'status_ciclo',
    default: 'rascunho',
  })
  status!: StatusCiclo

  // Base da anonimização futura (skill backend-anonimizacao-respostas) —
  // nome/tipo precisam bater exatamente com docs/schema_avaliacao360_pt_v2.sql.
  @Column({ name: 'anonimizar_respostas_pares', type: 'boolean', default: true })
  anonimizarRespostasPares!: boolean

  @Column({ name: 'minimo_respostas_pares', type: 'smallint', default: 3 })
  minimoRespostasPares!: number

  @Column({ name: 'criado_por', type: 'uuid', nullable: true })
  criadoPor!: string | null

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date

  @UpdateDateColumn({ name: 'atualizado_em' })
  atualizadoEm!: Date
}
