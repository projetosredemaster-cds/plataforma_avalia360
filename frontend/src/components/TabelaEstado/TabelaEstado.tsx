import { Alert, Button, Skeleton, TableCell, TableRow } from '@mui/material'

interface TabelaEstadoProps {
  /** Número de colunas da tabela (para o `colSpan` das linhas de estado). */
  colSpan: number
  carregando: boolean
  erro?: string | null
  vazio: boolean
  mensagemVazio: string
  onTentarNovamente?: () => void
  linhasSkeleton?: number
}

/**
 * Encapsula os 3 estados repetidos entre `ColaboradoresListPage` e
 * `EquipesListPage`: loading (linhas de `Skeleton`), erro (`Alert` com
 * "Tentar novamente") e vazio (mensagem centralizada). Renderiza `null`
 * quando nenhum dos 3 estados se aplica — a página cuida de renderizar as
 * linhas de dados normalmente nesse caso.
 */
export function TabelaEstado({
  colSpan,
  carregando,
  erro,
  vazio,
  mensagemVazio,
  onTentarNovamente,
  linhasSkeleton = 3,
}: TabelaEstadoProps) {
  if (carregando) {
    return (
      <>
        {Array.from({ length: linhasSkeleton }).map((_, index) => (
          <TableRow key={index}>
            <TableCell colSpan={colSpan}>
              <Skeleton variant="rounded" height={32} />
            </TableCell>
          </TableRow>
        ))}
      </>
    )
  }

  if (erro) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan}>
          <Alert
            severity="error"
            role="alert"
            action={
              onTentarNovamente ? (
                <Button color="inherit" size="small" onClick={onTentarNovamente}>
                  Tentar novamente
                </Button>
              ) : undefined
            }
          >
            {erro}
          </Alert>
        </TableCell>
      </TableRow>
    )
  }

  if (vazio) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} align="center" sx={{ py: 6, color: 'text.secondary' }}>
          {mensagemVazio}
        </TableCell>
      </TableRow>
    )
  }

  return null
}
