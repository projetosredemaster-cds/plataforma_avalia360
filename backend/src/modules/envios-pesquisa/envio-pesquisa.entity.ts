import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { STATUS_ENVIO_VALORES, type StatusEnvio } from '../../common/enums'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { Pesquisa } from '../pesquisas/pesquisa.entity'

/**
 * Guarda só metadados de controle de envio (status/token/contadores) —
 * NUNCA ganha coluna de resposta/nota/valor (guard rail de anonimização,
 * mesma garantia já aplicada a `RelacionamentoAvaliacao`). Dados de resposta
 * (`itens_resposta`/`respostas`) são de uma task futura.
 */
@Entity('envios_pesquisa')
export class EnvioPesquisa {
  @PrimaryGeneratedColumn('uuid') id!: string

  @Column({ name: 'pesquisa_id', type: 'uuid' }) pesquisaId!: string
  @ManyToOne(() => Pesquisa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pesquisa_id' })
  pesquisa!: Pesquisa

  // NULL para envios de pesquisas `clima_geral` (ver `cicloId` abaixo).
  // Exatamente um dos dois é preenchido, garantido pelo CHECK
  // `chk_envios_pesquisa_origem_exclusiva` no banco — a aplicação nunca deve
  // gravar os dois ou nenhum.
  @Column({ name: 'relacionamento_id', type: 'uuid', nullable: true })
  relacionamentoId!: string | null
  @ManyToOne(() => RelacionamentoAvaliacao, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'relacionamento_id' })
  relacionamento!: RelacionamentoAvaliacao | null

  // Substitui `colaboradorId` (modelo anterior, 1 envio por participante).
  // Preenchido SÓ para pesquisas `clima_geral` — 1 ÚNICO envio (link de
  // campanha) por ciclo, garantido pelo índice único parcial
  // `uq_envios_pesquisa_ciclo`. Nunca gerado/lido junto de
  // `relacionamentoId` na mesma linha.
  @Column({ name: 'ciclo_id', type: 'uuid', nullable: true })
  cicloId!: string | null
  @ManyToOne(() => CicloAvaliacao, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo!: CicloAvaliacao | null

  @Column({ type: 'enum', enum: STATUS_ENVIO_VALORES, enumName: 'status_envio', default: 'pendente' })
  status!: StatusEnvio

  // Preenchido pelo DEFAULT do Postgres (gen_random_uuid()) — a aplicação
  // NUNCA gera nem reatribui este valor (ver decisão de modelagem 4).
  @Column({ name: 'token_acesso', type: 'uuid', unique: true })
  tokenAcesso!: string

  // Escrito por `marcarComoEnviado`. Não exposto no shape de resposta desta
  // task (ver decisão de modelagem 9).
  @Column({ name: 'enviado_em', type: 'timestamptz', nullable: true })
  enviadoEm!: Date | null

  // Reservado para a task futura de resposta (`/responder`) — esta task
  // NUNCA escreve esta coluna, só a expõe (sempre `null` por enquanto).
  @Column({ name: 'concluido_em', type: 'timestamptz', nullable: true })
  concluidoEm!: Date | null

  @Column({ name: 'quantidade_lembretes', type: 'smallint', default: 0 })
  quantidadeLembretes!: number

  // Reservado para a task futura de resposta (`/responder`, confirmação de
  // CPF) — esta task NUNCA escreve esta coluna, só a expõe (sempre `null`).
  @Column({ name: 'cpf_confirmado_em', type: 'timestamptz', nullable: true })
  cpfConfirmadoEm!: Date | null

  // Reservado para a task futura de resposta — esta task NUNCA escreve.
  @Column({ name: 'tentativas_cpf_invalidas', type: 'smallint', default: 0 })
  tentativasCpfInvalidas!: number

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date
}
