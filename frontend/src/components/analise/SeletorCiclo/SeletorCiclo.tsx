import { MenuItem, TextField } from '@mui/material'
import { useEffect, useState } from 'react'
import { listarCiclos } from '../../../services/ciclosService'
import type { Ciclo } from '../../../types/ciclo'

interface SeletorCicloProps {
  cicloId: string | null
  onChange: (cicloId: string | null) => void
}

const STATUS_SELECIONAVEIS = new Set<Ciclo['status']>(['ativo', 'encerrado'])

/**
 * Select simples (sem busca interna) de ciclo — usado por `AnaliseVisaoGeralPage`
 * e `AnaliseAvaliacoesPage`. Só lista ciclos `ativo`/`encerrado` (nunca
 * `rascunho`). Trocar a seleção chama `onChange` imediatamente — quem decide o que
 * fazer com isso (novo fetch, `setSearchParams`) é a página, não este componente.
 * NUNCA chama `onChange` sozinho por conta de carregamento ou de um `cicloId`
 * (prop) que não esteja na lista — ver o `MenuItem` de fallback abaixo.
 */
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
        // Best-effort — falha aqui não deve quebrar a página; o filtro de ciclo
        // simplesmente fica indisponível (só "Todos os ciclos" segue utilizável).
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
      {/* `cicloId` (prop, vindo de deep link/URL) não está entre os ciclos
          selecionáveis — ainda em carregamento, ou o ciclo está em `rascunho`
          (CiclosListPage permite o deep link mesmo nesse status). Renderizado
          desabilitado só para o <TextField select> ter uma opção correspondente
          ao `value` atual e não "engolir" o filtro silenciosamente nem disparar
          nenhum onChange — o usuário troca manualmente se quiser. */}
      {cicloOrfao && (
        <MenuItem value={cicloId as string} disabled>
          {carregando ? 'Carregando…' : 'Ciclo selecionado indisponível para este filtro'}
        </MenuItem>
      )}
    </TextField>
  )
}
