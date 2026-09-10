import { Paper } from '@mui/material'
import type { GrupoClimaGeral } from '../../../types/analise'
import { TextoAbertoLista } from '../TextoAbertoLista/TextoAbertoLista'
import { EstadoAguardandoMinimo } from '../EstadoAguardandoMinimo/EstadoAguardandoMinimo'

interface GrupoClimaCardProps {
  grupo: GrupoClimaGeral
}

/**
 * Um bloco por ciclo de clima. `respostas_clima`/`itens_resposta_clima` são
 * estruturalmente anônimas (sem nenhuma FK de identidade) — os textos
 * liberados NUNCA têm nenhuma atribuição, nem agregada por pessoa (nada de
 * "Respondente 1"). Sem cabeçalho de avaliado (não existe, ao contrário de
 * `GrupoParesSubordinadoCard`).
 */
export function GrupoClimaCard({ grupo }: GrupoClimaCardProps) {
  return (
    <Paper variant="outlined" className="flex flex-col gap-2 p-3">
      {grupo.liberado ? (
        <TextoAbertoLista textos={grupo.textos ?? []} />
      ) : (
        <EstadoAguardandoMinimo totalRespondentes={grupo.totalRespondentes} minimoNecessario={grupo.minimoNecessario} />
      )}
    </Paper>
  )
}
