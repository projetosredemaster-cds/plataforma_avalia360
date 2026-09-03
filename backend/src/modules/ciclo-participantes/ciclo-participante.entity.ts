import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { Colaborador } from '../colaboradores/colaborador.entity'

/**
 * Tabela nova desta task (sem equivalente no schema doc) — guarda apenas o
 * vínculo de participação (quem está no ciclo), nunca papel/tipo de
 * relacionamento, que é derivado na ativação e vive em
 * `relacionamentos_avaliacao`.
 */
@Entity('ciclo_participantes')
export class CicloParticipante {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'ciclo_id', type: 'uuid' })
  cicloId!: string

  @ManyToOne(() => CicloAvaliacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo!: CicloAvaliacao

  @Column({ name: 'colaborador_id', type: 'uuid' })
  colaboradorId!: string

  @ManyToOne(() => Colaborador, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'colaborador_id' })
  colaborador!: Colaborador

  // Metadado de controle de PARTICIPAÇÃO (quem já respondeu à pesquisa de
  // `clima_geral` do ciclo) — NUNCA conteúdo de resposta. Escrito só pela
  // futura rota pública `/responder` (fora de escopo desta task) após
  // validar CPF contra este mesmo participante — esta task NUNCA escreve
  // esta coluna, só cria e expõe (sempre `null` por ora).
  @Column({ name: 'respondeu_em', type: 'timestamptz', nullable: true })
  respondeuEm!: Date | null

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date
}
