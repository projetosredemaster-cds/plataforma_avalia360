import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import {
  STATUS_CICLO_VALORES,
  type StatusCiclo,
  type TipoRelacionamento,
} from '../../common/enums'

@Entity('ciclos_avaliacao')
export class CicloAvaliacao {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'text' })
  nome!: string

  @Column({ type: 'text', nullable: true })
  descricao!: string | null

  // TypeORM mapeia `date` como `string` (YYYY-MM-DD), nunca `Date`.
  @Column({ name: 'data_inicio', type: 'date' })
  dataInicio!: string

  @Column({ name: 'data_fim', type: 'date' })
  dataFim!: string

  @Column({
    type: 'enum',
    enum: STATUS_CICLO_VALORES,
    enumName: 'status_ciclo',
    default: 'rascunho',
  })
  status!: StatusCiclo

  // Base da anonimização futura (skill backend-anonimizacao-respostas) —
  // nome/tipo precisam bater exatamente com docs/schema_avaliacao360_pt_v2.sql.
  @Column({ name: 'anonimizar_respostas_pares', type: 'boolean', default: true })
  anonimizarRespostasPares!: boolean

  @Column({ name: 'minimo_respostas_pares', type: 'smallint', default: 3 })
  minimoRespostasPares!: number

  // Subconjunto de TIPO_RELACIONAMENTO_GERACAO_VALORES habilitado para este
  // ciclo — `gerarRelacionamentos` (ciclos-avaliacao.service.ts) só insere
  // linhas de relacionamentos_avaliacao dos tipos presentes aqui. `default`
  // é só metadado de schema do TypeORM (não aplicado por `.create({...})`
  // quando o campo é omitido) — o valor real default é setado
  // explicitamente pelo service (criar()) e reforçado pelo DEFAULT da coluna
  // no banco (migration 1788650000000).
  @Column({
    name: 'tipos_relacionamento_gerados',
    type: 'text',
    array: true,
    default: "'{autoavaliacao,gestor,pares,subordinado}'",
  })
  tiposRelacionamentoGerados!: TipoRelacionamento[]

  @Column({ name: 'criado_por', type: 'uuid', nullable: true })
  criadoPor!: string | null

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date

  @UpdateDateColumn({ name: 'atualizado_em' })
  atualizadoEm!: Date
}
