import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('equipes')
export class Equipe {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255 })
  nome!: string

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date

  @UpdateDateColumn({ name: 'atualizado_em' })
  atualizadoEm!: Date
}
