import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { TIPO_RELACIONAMENTO_VALORES, type TipoRelacionamento } from '../../common/enums'
import { Colaborador } from '../colaboradores/colaborador.entity'
import { CicloAvaliacao } from './ciclo-avaliacao.entity'

/**
 * Guarda só o vínculo avaliador↔avaliado↔tipo dentro de um ciclo — NUNCA
 * ganha coluna de resposta/nota/valor (guard rail de anonimização, ver
 * task-backend.md 1.13). Dados de resposta (`itens_resposta`) são de uma
 * task futura.
 */
@Entity('relacionamentos_avaliacao')
export class RelacionamentoAvaliacao {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'ciclo_id', type: 'uuid' })
  cicloId!: string

  @ManyToOne(() => CicloAvaliacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo!: CicloAvaliacao

  @Column({ name: 'avaliador_id', type: 'uuid' })
  avaliadorId!: string

  @ManyToOne(() => Colaborador, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'avaliador_id' })
  avaliador!: Colaborador

  @Column({ name: 'avaliado_id', type: 'uuid' })
  avaliadoId!: string

  @ManyToOne(() => Colaborador, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'avaliado_id' })
  avaliado!: Colaborador

  @Column({
    name: 'tipo_relacionamento',
    type: 'enum',
    enum: TIPO_RELACIONAMENTO_VALORES,
    enumName: 'tipo_relacionamento',
  })
  tipoRelacionamento!: TipoRelacionamento

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date
}
