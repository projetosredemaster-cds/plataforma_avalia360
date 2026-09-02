import { useState, type FormEvent } from 'react'
import { Alert, Button, Paper, Switch, TextField, Typography, FormControlLabel } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../lib/apiClient'
import { criarCiclo } from '../../services/ciclosService'

interface ErrosCampo {
  nome?: string
  descricao?: string
  dataInicio?: string
  dataFim?: string
  minimoRespostasPares?: string
}

/**
 * Só criação (`/ciclos/novo`) — a edição de um ciclo em rascunho vive em
 * `CicloDetalhePage`, que reaproveita os mesmos campos como subcomponente
 * local. Ciclo nasce sempre em `rascunho`, sem participantes/pesquisa
 * vinculada — essas ações só existem depois de `id` existir.
 */
export function CicloFormPage() {
  const navigate = useNavigate()

  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [minimoRespostasPares, setMinimoRespostasPares] = useState('3')
  const [anonimizarRespostasPares, setAnonimizarRespostasPares] = useState(true)

  const [errosCampo, setErrosCampo] = useState<ErrosCampo>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  function validar(): boolean {
    const erros: ErrosCampo = {}
    const nomeAparado = nome.trim()
    if (nomeAparado.length < 2 || nomeAparado.length > 255) {
      erros.nome = 'Informe um nome com 2 a 255 caracteres.'
    }
    if (descricao.trim().length > 2000) {
      erros.descricao = 'A descrição pode ter no máximo 2000 caracteres.'
    }
    if (!dataInicio) {
      erros.dataInicio = 'Informe a data de início.'
    }
    if (!dataFim) {
      erros.dataFim = 'Informe a data de fim.'
    }
    if (dataInicio && dataFim && dataFim < dataInicio) {
      erros.dataFim = 'A data de fim não pode ser anterior à data de início.'
    }
    const minimoNumero = Number(minimoRespostasPares)
    if (!Number.isInteger(minimoNumero) || minimoNumero < 1) {
      erros.minimoRespostasPares = 'Informe um número inteiro maior ou igual a 1.'
    }
    setErrosCampo(erros)
    return Object.keys(erros).length === 0
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (salvando) return
    setErroGeral(null)
    if (!validar()) return

    setSalvando(true)
    try {
      const novo = await criarCiclo({
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        dataInicio,
        dataFim,
        anonimizarRespostasPares,
        minimoRespostasPares: Number(minimoRespostasPares),
      })
      navigate(`/ciclos/${novo.id}`, { replace: true })
    } catch (err) {
      setErroGeral(err instanceof ApiError ? err.message : 'Não foi possível criar o ciclo.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Paper className="mx-auto max-w-2xl p-6">
      <Typography variant="h5" component="h1" sx={{ mb: 3 }}>
        Novo ciclo de avaliação
      </Typography>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          error={Boolean(errosCampo.nome)}
          helperText={errosCampo.nome}
          disabled={salvando}
          required
          fullWidth
        />

        <TextField
          label="Descrição"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          error={Boolean(errosCampo.descricao)}
          helperText={errosCampo.descricao}
          disabled={salvando}
          multiline
          minRows={3}
          fullWidth
        />

        <div className="flex flex-wrap gap-4">
          <TextField
            label="Data de início"
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            error={Boolean(errosCampo.dataInicio)}
            helperText={errosCampo.dataInicio}
            disabled={salvando}
            required
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Data de fim"
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            error={Boolean(errosCampo.dataFim)}
            helperText={errosCampo.dataFim}
            disabled={salvando}
            required
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </div>

        <TextField
          label="Mínimo de respondentes (pares/subordinado)"
          type="number"
          value={minimoRespostasPares}
          onChange={(e) => setMinimoRespostasPares(e.target.value)}
          error={Boolean(errosCampo.minimoRespostasPares)}
          helperText={
            errosCampo.minimoRespostasPares ??
            'Quantidade mínima de respondentes exigida antes de a plataforma liberar dados agregados de pares/subordinado (regra aplicada pelo backend).'
          }
          disabled={salvando}
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
          required
        />

        <FormControlLabel
          control={
            <Switch
              checked={anonimizarRespostasPares}
              onChange={(e) => setAnonimizarRespostasPares(e.target.checked)}
              disabled={salvando}
            />
          }
          label="Anonimizar respostas de pares/subordinado (política de exposição de respostas do ciclo, aplicada pelo backend)"
        />

        {erroGeral && (
          <Alert severity="error" role="alert">
            {erroGeral}
          </Alert>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="text" onClick={() => navigate('/ciclos')} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" color="primary" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Criar ciclo'}
          </Button>
        </div>
      </form>
    </Paper>
  )
}
