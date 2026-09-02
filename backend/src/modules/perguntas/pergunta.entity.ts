import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { TIPO_PERGUNTA_VALORES, type TipoPergunta } from '../../common/enums'
import { PaginaPesquisa } from '../paginas-pesquisa/pagina-pesquisa.entity'

@Entity('perguntas')
export class Pergunta {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'pagina_id', type: 'uuid' })
  paginaId!: string

  @ManyToOne(() => PaginaPesquisa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pagina_id' })
  pagina!: PaginaPesquisa

  @Column({
    type: 'enum',
    enum: TIPO_PERGUNTA_VALORES,
    enumName: 'tipo_pergunta',
  })
  tipo!: TipoPergunta

  @Column({ type: 'text' })
  enunciado!: string

  @Column({ type: 'boolean', default: true })
  obrigatoria!: boolean

  @Column({ type: 'jsonb', default: {} })
  configuracao!: Record<string, unknown>

  @Column({ type: 'int' })
  ordem!: number

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date

  @UpdateDateColumn({ name: 'atualizado_em' })
  atualizadoEm!: Date
}
