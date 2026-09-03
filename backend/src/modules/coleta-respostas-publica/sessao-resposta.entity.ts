import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { TIPO_PESQUISA_VALORES, type TipoPesquisa } from '../../common/enums'
import { CicloParticipante } from '../ciclo-participantes/ciclo-participante.entity'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'

/**
 * Ponte temporária IDENTIDADE -> INTENÇÃO DE RESPONDER. NUNCA referenciada
 * por `respostas`/`itens_resposta` nem por `respostas_clima`/
 * `itens_resposta_clima` (nem o inverso) — essa ausência de referência
 * cruzada é o que garante o anonimato estrutural do clima. Uso único:
 * `usadaEm` marca consumo (resposta já enviada), nunca reutilizável depois.
 */
@Entity('sessoes_resposta')
export class SessaoResposta {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  // Preenchido pelo DEFAULT do Postgres (gen_random_uuid()) — a aplicação
  // NUNCA gera nem reatribui este valor (mesmo padrão de
  // envios_pesquisa.tokenAcesso).
  @Column({ type: 'uuid', unique: true })
  token!: string

  @Column({ name: 'envio_id', type: 'uuid' })
  envioId!: string

  @ManyToOne(() => EnvioPesquisa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'envio_id' })
  envio!: EnvioPesquisa

  // Preenchido SÓ para clima_geral (única ponte identidade -> intenção de
  // responder, usada para saber qual ciclo_participantes marcar). NULL para
  // avaliacao_360.
  @Column({ name: 'ciclo_participante_id', type: 'uuid', nullable: true })
  cicloParticipanteId!: string | null

  @ManyToOne(() => CicloParticipante, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ciclo_participante_id' })
  cicloParticipante!: CicloParticipante | null

  // Denormalizado — evita 1 join extra para decidir o branch de gravação no
  // envio final.
  @Column({
    name: 'tipo_pesquisa',
    type: 'enum',
    enum: TIPO_PESQUISA_VALORES,
    enumName: 'tipo_pesquisa',
  })
  tipoPesquisa!: TipoPesquisa

  @Column({ name: 'expira_em', type: 'timestamptz' })
  expiraEm!: Date

  @Column({ name: 'usada_em', type: 'timestamptz', nullable: true })
  usadaEm!: Date | null

  @CreateDateColumn({ name: 'criada_em' })
  criadaEm!: Date
}
