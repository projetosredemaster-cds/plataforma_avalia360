import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { Pesquisa } from '../pesquisas/pesquisa.entity'

/**
 * Anonimato ESTRUTURAL (não regra de leitura): SEM colaborador_id, SEM
 * sessao_id, SEM envio_id — nenhuma FK de identidade. `sessoes_resposta` é a
 * única ponte identidade -> intenção de responder e NUNCA referencia nem é
 * referenciada por esta tabela. NENHUMA rota, presente ou futura, deve
 * adicionar uma coluna de identidade aqui — quebraria a garantia de design
 * pedida explicitamente pelo usuário (ver task-backend.md, "Guard rails de
 * anonimização").
 */
@Entity('respostas_clima')
export class RespostaClima {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'pesquisa_id', type: 'uuid' })
  pesquisaId!: string

  @ManyToOne(() => Pesquisa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pesquisa_id' })
  pesquisa!: Pesquisa

  // Redundante com pesquisa_id (uma pesquisa pertence a 1 só ciclo), incluído
  // por conveniência para agregação futura sem join extra — decisão de
  // conveniência, não estrutural (ver spec, seção 7.3).
  @Column({ name: 'ciclo_id', type: 'uuid' })
  cicloId!: string

  @ManyToOne(() => CicloAvaliacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo!: CicloAvaliacao

  @CreateDateColumn({ name: 'respondido_em' })
  respondidoEm!: Date
}
