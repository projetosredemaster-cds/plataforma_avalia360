import { useState } from 'react'
import { Chip, Paper, Tab, Tabs, Typography } from '@mui/material'
import type { ResultadoPerguntaClima } from '../../../types/analise'
import { DistribuicaoNivelTabela } from '../DistribuicaoNivelTabela/DistribuicaoNivelTabela'
import { DistribuicaoOpcaoTabela } from '../DistribuicaoOpcaoTabela/DistribuicaoOpcaoTabela'
import { RankingDadosInsuficientesTag } from '../RankingDadosInsuficientesTag/RankingDadosInsuficientesTag'
import { rotuloTipoPergunta } from '../rotulosTipoPergunta'

interface ResultadoPerguntaClimaCardProps {
  resultado: ResultadoPerguntaClima
}

export function ResultadoPerguntaClimaCard({ resultado }: ResultadoPerguntaClimaCardProps) {
  const [abaCompetencia, setAbaCompetencia] = useState(0)

  return (
    <Paper variant="outlined" className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
          {resultado.perguntaEnunciado}
        </Typography>
        <Chip variant="outlined" size="small" label={rotuloTipoPergunta(resultado.tipo)} />
      </div>

      {!resultado.liberado && <RankingDadosInsuficientesTag />}

      {resultado.liberado && resultado.tipo === 'likert' && (
        <DistribuicaoNivelTabela distribuicao={resultado.distribuicao ?? []} rotulos={resultado.rotulos} />
      )}

      {resultado.liberado && resultado.tipo === 'caixa_selecao' && (
        <DistribuicaoOpcaoTabela distribuicao={resultado.distribuicao ?? []} />
      )}

      {resultado.liberado && resultado.tipo === 'matriz' && (
        <div className="flex flex-col gap-3">
          <Tabs
            value={abaCompetencia}
            onChange={(_event, novaAba: number) => setAbaCompetencia(novaAba)}
            variant="scrollable"
            scrollButtons="auto"
          >
            {(resultado.competencias ?? []).map((c) => (
              <Tab key={c.competenciaId} label={c.competenciaNome} />
            ))}
          </Tabs>
          {resultado.competencias?.[abaCompetencia] && (
            <DistribuicaoNivelTabela
              distribuicao={resultado.competencias[abaCompetencia].distribuicao}
              rotulos={resultado.rotulos}
            />
          )}
        </div>
      )}
    </Paper>
  )
}
