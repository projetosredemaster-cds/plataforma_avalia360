import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import type { ContagemOpcao } from '../../../types/analise'

const FORMATADOR = new Intl.NumberFormat('pt-BR')

interface DistribuicaoOpcaoTabelaProps {
  distribuicao: ContagemOpcao[]
}

/**
 * Componente "burro": só lê `distribuicao` e renderiza, na ordem recebida
 * (já reflete `perguntas.configuracao.opcoes` — nunca reordenar
 * alfabeticamente nem por contagem, nunca filtrar itens com `contagem: 0`).
 */
export function DistribuicaoOpcaoTabela({ distribuicao }: DistribuicaoOpcaoTabelaProps) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Opção</TableCell>
            <TableCell align="right">Respostas</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {distribuicao.map((item) => (
            <TableRow key={item.opcao}>
              <TableCell sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>{item.opcao}</TableCell>
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
