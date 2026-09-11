import { MenuItem, TextField } from '@mui/material'
import { useEffect, useState } from 'react'
import { listarCiclos } from '../../../services/ciclosService'
import type { Ciclo } from '../../../types/ciclo'

interface SeletorCicloProps {
  cicloId: string | null
  onChange: (cicloId: string | null) => void
}

const STATUS_SELECIONAVEIS = new Set<Ciclo['status']>(['ativo', 'encerrado'])

export function SeletorCiclo({ cicloId, onChange }: SeletorCicloProps) {
  const [ciclos, setCiclos] = useState<Ciclo[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let cancelado = false
    listarCiclos()
      .then((todos) => {
        if (!cancelado) setCiclos(todos.filter((c) => STATUS_SELECIONAVEIS.has(c.status)))
      })
      .catch(() => {
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
  }, [])

  const cicloOrfao = cicloId !== null && !ciclos.some((c) => c.id === cicloId)

  return (
    <TextField
      select
      label="Ciclo"
      size="small"
      value={cicloId ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      sx={{ minWidth: 240 }}
    >
      <MenuItem value="">Todos os ciclos</MenuItem>
      {ciclos.map((c) => (
        <MenuItem key={c.id} value={c.id}>
          {c.nome}
        </MenuItem>
      ))}
      {}
      {cicloOrfao && (
        <MenuItem value={cicloId as string} disabled>
          {carregando ? 'Carregando…' : 'Ciclo selecionado indisponível para este filtro'}
        </MenuItem>
      )}
    </TextField>
  )
}
