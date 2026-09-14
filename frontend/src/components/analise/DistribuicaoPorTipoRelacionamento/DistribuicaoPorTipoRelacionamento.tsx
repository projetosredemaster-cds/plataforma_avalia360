import { Chip } from '@mui/material'
import type { DistribuicaoOpcaoTipoRelacionamento, DistribuicaoTipoRelacionamento } from '../../../types/analise'
import { DistribuicaoNivelTabela } from '../DistribuicaoNivelTabela/DistribuicaoNivelTabela'
import { DistribuicaoOpcaoTabela } from '../DistribuicaoOpcaoTabela/DistribuicaoOpcaoTabela'
import { RankingDadosInsuficientesTag } from '../RankingDadosInsuficientesTag/RankingDadosInsuficientesTag'
import { rotuloTipoRelacionamento } from '../rotulosRelacionamento'

type DistribuicaoPorTipoRelacionamentoProps =
  | { variante: 'nivel'; itens: DistribuicaoTipoRelacionamento[]; rotulos: string[] }
  | { variante: 'opcao'; itens: DistribuicaoOpcaoTipoRelacionamento[] }

export function DistribuicaoPorTipoRelacionamento(props: DistribuicaoPorTipoRelacionamentoProps) {
  if (props.variante === 'nivel') {
    return (
      <div className="flex flex-col gap-3">
        {props.itens.map((item) => (
          <div key={item.tipoRelacionamento} className="flex flex-col gap-1">
            <Chip size="small" label={rotuloTipoRelacionamento(item.tipoRelacionamento)} sx={{ alignSelf: 'flex-start' }} />
            {item.liberado ? (
              <DistribuicaoNivelTabela distribuicao={item.distribuicao ?? []} rotulos={props.rotulos} />
            ) : (
              <RankingDadosInsuficientesTag />
            )}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {props.itens.map((item) => (
        <div key={item.tipoRelacionamento} className="flex flex-col gap-1">
          <Chip size="small" label={rotuloTipoRelacionamento(item.tipoRelacionamento)} sx={{ alignSelf: 'flex-start' }} />
          {item.liberado ? <DistribuicaoOpcaoTabela distribuicao={item.distribuicao ?? []} /> : <RankingDadosInsuficientesTag />}
        </div>
      ))}
    </div>
  )
}
