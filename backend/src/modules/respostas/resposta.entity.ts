import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'

/**
 * Avaliação 360 — greenfield, nome/colunas batendo literalmente com
 * docs/schema_avaliacao360_pt_v2.sql (`respostas`), sem divergência
 * conhecida. `avaliador_id`/`relacionamento_id` ficam preservados na cadeia
 * respostas -> envios_pesquisa -> relacionamentos_avaliacao — a anonimização
 * de pares/subordinado é regra de LEITURA (futura), nunca de escrita (ver
 * skill backend-anonimizacao-respostas). Vive em módulo próprio (`respostas/`,
 * não dentro de `coleta-respostas-publica/`) para ser reaproveitável pela
 * futura "Análise básica por avaliado" sem sugerir "só escrita pública".
 */
@Entity('respostas')
export class Resposta {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'envio_id', type: 'uuid', unique: true })
  envioId!: string

  @ManyToOne(() => EnvioPesquisa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'envio_id' })
  envio!: EnvioPesquisa

  @CreateDateColumn({ name: 'respondido_em' })
  respondidoEm!: Date
}
