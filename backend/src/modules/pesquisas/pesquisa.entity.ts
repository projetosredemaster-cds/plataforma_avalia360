import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { STATUS_PESQUISA_VALORES, type StatusPesquisa } from '../../common/enums'

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

  // Sem @ManyToOne/@JoinColumn: `ciclos_avaliacao` ainda não existe, então
  // esta é só uma coluna solta (uuid nullable, sem FK) — dívida técnica
  // assumida (decisão assumida 3 do plano da task). Validado só quanto ao
  // formato (UUID sintaticamente válido) na camada de serviço, nunca quanto
  // à existência. Adicionar `@ManyToOne`/`@JoinColumn` + FK na migration
  // quando o módulo de ciclos existir.
  @Column({ name: 'ciclo_id', type: 'uuid', nullable: true })
  cicloId!: string | null

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date

  @UpdateDateColumn({ name: 'atualizado_em' })
  atualizadoEm!: Date
}
