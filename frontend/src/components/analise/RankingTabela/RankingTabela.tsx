import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material'
import type { MetricaRanking, RankingAnalise, RankingAvaliadoLinha, RankingEquipeLinha } from '../../../types/analise'
import { RankingDadosInsuficientesTag } from '../RankingDadosInsuficientesTag/RankingDadosInsuficientesTag'

const FORMATADOR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function formatarPercentual(valor: number): string {
  return `${FORMATADOR.format(valor)}%`
}

function formatarPosicao(posicao: number | null): string {
  return posicao === null ? '—' : `${posicao}º`
}

interface RankingTabelaProps {
  dados: RankingAnalise
  onOrdenarPorChange: (metrica: MetricaRanking) => void
}

/**
 * Componente "burro": `posicao`, `mediaLikert`, `mediaMatriz` e os booleanos
 * de insuficiência já vêm prontos da API. Este componente só decide QUAL
 * sub-elemento renderizar (número / "Sem dado" / `RankingDadosInsuficientesTag`)
 * a partir desses campos já computados — nunca recalcula gate, média ou
 * posição. `linhas` é renderizado na ordem recebida, nunca reordenado aqui.
 */
export function RankingTabela({ dados, onOrdenarPorChange }: RankingTabelaProps) {
  function celulaAvaliado(linha: RankingAvaliadoLinha, metrica: MetricaRanking) {
    const valor = metrica === 'likert' ? linha.mediaLikert : linha.mediaMatriz
    if (valor !== null) return <Typography variant="body2">{formatarPercentual(valor)}</Typography>
    if (linha.paresInsuficiente || linha.subordinadoInsuficiente) return <RankingDadosInsuficientesTag />
    return (
      <Typography variant="body2" color="text.secondary">
        Sem dado
      </Typography>
    )
  }

  function celulaEquipe(linha: RankingEquipeLinha, metrica: MetricaRanking) {
    const valor = metrica === 'likert' ? linha.mediaLikert : linha.mediaMatriz
    const insuficiente = metrica === 'likert' ? linha.dadosInsuficientesLikert : linha.dadosInsuficientesMatriz
    if (valor !== null) return <Typography variant="body2">{formatarPercentual(valor)}</Typography>
    if (insuficiente) return <RankingDadosInsuficientesTag />
    return (
      <Typography variant="body2" color="text.secondary">
        Sem dado
      </Typography>
    )
  }

  function cabecalhoMetrica(metrica: MetricaRanking, rotulo: string) {
    const ativo = dados.ordenarPor === metrica
    return (
      <TableCell align="right">
        <TableSortLabel
          active={ativo}
          direction={ativo ? dados.ordem : 'desc'}
          onClick={() => onOrdenarPorChange(metrica)}
        >
          {rotulo}
        </TableSortLabel>
      </TableCell>
    )
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Posição</TableCell>
            <TableCell>{dados.modo === 'avaliado' ? 'Avaliado' : 'Equipe'}</TableCell>
            {dados.modo === 'avaliado' && (
              <>
                <TableCell>Cargo</TableCell>
                <TableCell>Equipe</TableCell>
              </>
            )}
            {cabecalhoMetrica('likert', 'Média Likert')}
            {cabecalhoMetrica('matriz', 'Média Matriz')}
          </TableRow>
        </TableHead>
        <TableBody>
          {dados.modo === 'avaliado'
            ? dados.linhas.map((linha) => (
                <TableRow key={linha.avaliadoId}>
                  <TableCell>{formatarPosicao(linha.posicao)}</TableCell>
                  <TableCell>{linha.avaliadoNome}</TableCell>
                  <TableCell>{linha.cargo ?? '—'}</TableCell>
                  <TableCell>{linha.equipeNome ?? '—'}</TableCell>
                  <TableCell align="right">{celulaAvaliado(linha, 'likert')}</TableCell>
                  <TableCell align="right">{celulaAvaliado(linha, 'matriz')}</TableCell>
                </TableRow>
              ))
            : dados.linhas.map((linha) => (
                <TableRow key={linha.equipeId}>
                  <TableCell>{formatarPosicao(linha.posicao)}</TableCell>
                  <TableCell>{linha.equipeNome}</TableCell>
                  <TableCell align="right">{celulaEquipe(linha, 'likert')}</TableCell>
                  <TableCell align="right">{celulaEquipe(linha, 'matriz')}</TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
