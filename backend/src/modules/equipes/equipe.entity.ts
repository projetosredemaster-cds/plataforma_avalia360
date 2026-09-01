import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('equipes')
export class Equipe {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255 })
  nome!: string

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date
}
