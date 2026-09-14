import { Card, CardContent, Divider, IconButton, Tooltip, Typography } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

interface MetricaCardDetalhe {
  rotulo: string
  valor: string
}

interface MetricaCardProps {
  titulo: string
  valor: string
  descricao?: string
  detalhes?: MetricaCardDetalhe[]
  tooltip?: string
  /** `'grande'` amplia a tipografia para leitura a distância (ex. Modo TV). Default `'padrao'`. */
  tamanho?: 'padrao' | 'grande'
}

export function MetricaCard({ titulo, valor, descricao, detalhes, tooltip, tamanho = 'padrao' }: MetricaCardProps) {
  const grande = tamanho === 'grande'

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-0.5">
          <Typography variant={grande ? 'h6' : 'subtitle2'} color="text.secondary">
            {titulo}
          </Typography>
          {tooltip && (
            <Tooltip title={tooltip}>
              <IconButton size="small" aria-label={`Sobre a métrica ${titulo}`} sx={{ p: 0.25 }}>
                <InfoOutlinedIcon fontSize="small" color="action" />
              </IconButton>
            </Tooltip>
          )}
        </div>
        <Typography variant={grande ? 'h2' : 'h4'} component="p" sx={{ fontWeight: 600 }}>
          {valor}
        </Typography>
        {descricao && (
          <Typography variant={grande ? 'body1' : 'body2'} color="text.secondary">
            {descricao}
          </Typography>
        )}
        {detalhes && detalhes.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <div className="flex flex-col gap-1">
              {detalhes.map((detalhe) => (
                <div key={detalhe.rotulo} className="flex items-center justify-between gap-2">
                  <Typography variant="caption" color="text.secondary">
                    {detalhe.rotulo}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {detalhe.valor}
                  </Typography>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
