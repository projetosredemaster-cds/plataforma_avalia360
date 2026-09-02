import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { STATUS_PESQUISA_VALORES, type StatusPesquisa } from '../../common/enums'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'

@Entity('pesquisas')
export class Pesquisa {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255 })
  titulo!: string

  @Column({ name: 'mensagem_boas_vindas', type: 'text', nullable: true })
  mensagemBoasVindas!: string | null

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl!: string | null

  @Column({
    type: 'enum',
    enum: STATUS_PESQUISA_VALORES,
    enumName: 'status_pesquisa',
    default: 'rascunho',
  })
  status!: StatusPesquisa

  @Column({ name: 'ciclo_id', type: 'uuid', nullable: true })
  cicloId!: string | null

  @ManyToOne(() => CicloAvaliacao, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo!: CicloAvaliacao | null

  @Column({ name: 'criado_por', type: 'uuid', nullable: true })
  criadoPor!: string | null

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date

  @UpdateDateColumn({ name: 'atualizado_em' })
  atualizadoEm!: Date
}
