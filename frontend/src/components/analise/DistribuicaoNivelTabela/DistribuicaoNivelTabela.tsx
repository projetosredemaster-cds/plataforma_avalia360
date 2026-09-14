import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import type { ContagemNivel } from '../../../types/analise'

const FORMATADOR = new Intl.NumberFormat('pt-BR')

interface DistribuicaoNivelTabelaProps {
  distribuicao: ContagemNivel[]
  /** rotulos[i] é o rótulo do nível i+1 (mesmo array de `perguntas.configuracao.rotulos`) — opcional só por defesa, a API sempre envia. */
  rotulos?: string[]
}

/**
 * Componente "burro": só lê `distribuicao`/`rotulos` e renderiza, na ordem
 * recebida (já zero-preenchida e ordenada pelo backend — nunca `.sort()`
 * aqui, nunca filtra itens com `contagem: 0`).
 */
export function DistribuicaoNivelTabela({ distribuicao, rotulos }: DistribuicaoNivelTabelaProps) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Nível</TableCell>
            <TableCell>Rótulo</TableCell>
            <TableCell align="right">Respostas</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {distribuicao.map((item) => (
            <TableRow key={item.nivel}>
              <TableCell>{item.nivel}</TableCell>
              <TableCell>{rotulos?.[item.nivel - 1] ?? '—'}</TableCell>
              <TableCell align="right">
                <Box component="span" className="inline-block bg-blue-50 rounded px-3 py-1">
                  {FORMATADOR.format(item.contagem)}
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
