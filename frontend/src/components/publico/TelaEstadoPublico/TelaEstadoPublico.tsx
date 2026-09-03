import { Button, Card, CardContent, Chip, Typography } from '@mui/material'

export type SeveridadeEstadoPublico = 'erro' | 'bloqueio' | 'sucesso'

interface AcaoSecundaria {
  rotulo: string
  onClick: () => void
}

interface TelaEstadoPublicoProps {
  severidade: SeveridadeEstadoPublico
  titulo: string
  mensagem: string
  acaoSecundaria?: AcaoSecundaria
}

const CHIP_POR_SEVERIDADE: Record<SeveridadeEstadoPublico, { label: string; color: 'error' | 'warning' | 'success' }> = {
  erro: { label: 'Não foi possível continuar', color: 'error' },
  bloqueio: { label: 'Acesso bloqueado', color: 'warning' },
  sucesso: { label: 'Concluído', color: 'success' },
}

/**
 * Casco genérico full-page, reaproveitado para todos os estados terminais da
 * coleta pública (link inválido, bloqueado, ciclo/pesquisa inativos,
 * expirado, já respondido, sessão inválida/expirada/usada, erro genérico de
 * rede) e para a tela de sucesso final — só variando texto/severidade. Nunca
 * exibe nenhum dado sobre outros respondentes.
 */
export function TelaEstadoPublico({ severidade, titulo, mensagem, acaoSecundaria }: TelaEstadoPublicoProps) {
  const chip = CHIP_POR_SEVERIDADE[severidade]

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <Card className="w-full max-w-[440px]">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <img src="/logo.jpg" alt="Avalia360" className="w-[200px]" />
          <Chip label={chip.label} color={chip.color} variant="filled" />
          <Typography variant="h6" component="h1">
            {titulo}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {mensagem}
          </Typography>
          {acaoSecundaria && (
            <Button variant="contained" color="primary" onClick={acaoSecundaria.onClick} sx={{ mt: 1 }}>
              {acaoSecundaria.rotulo}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
