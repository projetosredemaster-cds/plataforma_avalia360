import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('competencias')
export class Competencia {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255 })
  nome!: string

  @Column({ type: 'text', nullable: true })
  descricao!: string | null

  @Column({ type: 'boolean', default: true })
  ativo!: boolean

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date
}
