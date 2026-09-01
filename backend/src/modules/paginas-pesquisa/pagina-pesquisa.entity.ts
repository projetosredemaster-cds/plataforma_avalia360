import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { Pesquisa } from '../pesquisas/pesquisa.entity'

@Entity('paginas_pesquisa')
export class PaginaPesquisa {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'pesquisa_id', type: 'uuid' })
  pesquisaId!: string

  @ManyToOne(() => Pesquisa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pesquisa_id' })
  pesquisa!: Pesquisa

  @Column({ type: 'varchar', length: 255, nullable: true })
  titulo!: string | null

  @Column({ type: 'int' })
  ordem!: number

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date

  @UpdateDateColumn({ name: 'atualizado_em' })
  atualizadoEm!: Date
}
