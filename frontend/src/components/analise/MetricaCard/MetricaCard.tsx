import { Card, CardContent, Divider, Typography } from '@mui/material'

interface MetricaCardDetalhe {
  rotulo: string
  valor: string
}

interface MetricaCardProps {
  titulo: string
  valor: string
  descricao?: string
  detalhes?: MetricaCardDetalhe[]
}

/**
 * "Stat tile" genérico reutilizável por qualquer tela futura do módulo
 * Análise (Ranking, Performance, etc.) — não acoplado a nenhum shape
 * específico de `VisaoGeralAnalise`. Recebe só strings já formatadas pelo
 * chamador; nenhuma lógica de cálculo/formatação vive aqui.
 */
export function MetricaCard({ titulo, valor, descricao, detalhes }: MetricaCardProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-1">
        <Typography variant="subtitle2" color="text.secondary">
          {titulo}
        </Typography>
        <Typography variant="h4" component="p" sx={{ fontWeight: 600 }}>
          {valor}
        </Typography>
        {descricao && (
          <Typography variant="body2" color="text.secondary">
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
