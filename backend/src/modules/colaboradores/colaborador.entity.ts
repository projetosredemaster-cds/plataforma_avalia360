import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { PAPEL_COLABORADOR_VALORES, type PapelColaborador } from '../../common/enums'
import { Equipe } from '../equipes/equipe.entity'

@Entity('colaboradores')
export class Colaborador {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'nome_completo', type: 'varchar', length: 255 })
  nomeCompleto!: string

  @Column({ type: 'varchar', length: 255 })
  email!: string

  @Column({ type: 'char', length: 11 })
  cpf!: string

  @Column({
    type: 'enum',
    enum: PAPEL_COLABORADOR_VALORES,
    enumName: 'papel_colaborador',
    default: 'colaborador',
  })
  papel!: PapelColaborador

  @Column({ type: 'varchar', length: 255, nullable: true })
  cargo!: string | null

  @Column({ name: 'equipe_id', type: 'uuid', nullable: true })
  equipeId!: string | null

  @ManyToOne(() => Equipe, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'equipe_id' })
  equipe!: Equipe | null

  @Column({ name: 'gestor_id', type: 'uuid', nullable: true })
  gestorId!: string | null

  @ManyToOne(() => Colaborador, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'gestor_id' })
  gestor!: Colaborador | null

  @Column({ type: 'boolean', default: true })
  ativo!: boolean

  @Column({ name: 'usuario_auth_id', type: 'uuid', nullable: true })
  usuarioAuthId!: string | null

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date

  @UpdateDateColumn({ name: 'atualizado_em' })
  atualizadoEm!: Date
}
