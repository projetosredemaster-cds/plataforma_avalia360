import { Box, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import type { PalavraFrequencia } from '../../../types/analise'

interface ListaFrequenciaPalavrasProps {
  palavras: PalavraFrequencia[]
}


export function ListaFrequenciaPalavras({ palavras }: ListaFrequenciaPalavrasProps) {
  const frequenciaMaxima = palavras.length > 0 ? Math.max(...palavras.map((item) => item.frequencia)) : 0

  return (
    <TableContainer sx={{ maxHeight: 560, overflowY: 'auto' }}>
      <Table size="small">
        <TableBody>
          {palavras.map((item) => {
            const largura = frequenciaMaxima > 0 ? Math.round((item.frequencia / frequenciaMaxima) * 100) : 0
            return (
              <TableRow key={item.palavra}>
                <TableCell sx={{ width: '35%', whiteSpace: 'nowrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {item.palavra}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box className="flex items-center gap-3">
                    <Box
                      sx={{
                        height: 10,
                        borderRadius: 1,
                        bgcolor: 'primary.main',
                        width: `${largura}%`,
                        minWidth: 4,
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {item.frequencia}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
