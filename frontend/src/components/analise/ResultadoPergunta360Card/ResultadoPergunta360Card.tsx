import { useState } from 'react'
import { Chip, Paper, Tab, Tabs, Typography } from '@mui/material'
import type { ResultadoPergunta360 } from '../../../types/analise'
import { DistribuicaoPorTipoRelacionamento } from '../DistribuicaoPorTipoRelacionamento/DistribuicaoPorTipoRelacionamento'
import { rotuloTipoPergunta } from '../rotulosTipoPergunta'

interface ResultadoPergunta360CardProps {
  resultado: ResultadoPergunta360
}

export function ResultadoPergunta360Card({ resultado }: ResultadoPergunta360CardProps) {
  const [abaCompetencia, setAbaCompetencia] = useState(0)

  return (
    <Paper variant="outlined" className="flex flex-col gap-3 p-3 ">
      <div className="flex flex-wrap items-center justify-between gap-2 ">
        <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
          {resultado.perguntaEnunciado}
        </Typography>
        <Chip variant="outlined" size="small" label={rotuloTipoPergunta(resultado.tipo)} />
      </div>

      {resultado.tipo === 'likert' && (
        <DistribuicaoPorTipoRelacionamento
          variante="nivel"
          itens={resultado.porTipoRelacionamento}
          rotulos={resultado.rotulos}
        />
      )}

      {resultado.tipo === 'caixa_selecao' && (
        <DistribuicaoPorTipoRelacionamento variante="opcao" itens={resultado.porTipoRelacionamento} />
      )}

      {resultado.tipo === 'matriz' && (
        <div className="flex flex-col gap-3">
          <Tabs
            value={abaCompetencia}
            onChange={(_event, novaAba: number) => setAbaCompetencia(novaAba)}
            variant="scrollable"
            scrollButtons="auto"
          >
            {resultado.competencias.map((c) => (
              <Tab key={c.competenciaId} label={c.competenciaNome} />
            ))}
          </Tabs>
          {resultado.competencias[abaCompetencia] && (
            <DistribuicaoPorTipoRelacionamento
              variante="nivel"
              itens={resultado.competencias[abaCompetencia].porTipoRelacionamento}
              rotulos={resultado.rotulos}
            />
          )}
        </div>
      )}
    </Paper>
  )
}
