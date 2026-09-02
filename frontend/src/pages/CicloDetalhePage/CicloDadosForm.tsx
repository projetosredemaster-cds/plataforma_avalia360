import { useState } from 'react'
import { Alert, Button, Card, CardContent, FormControlLabel, Switch, TextField, Typography } from '@mui/material'
import { ApiError } from '../../lib/apiClient'
import { atualizarCiclo } from '../../services/ciclosService'
import type { Ciclo } from '../../types/ciclo'

interface ErrosCampo {
  nome?: string
  descricao?: string
  dataInicio?: string
  dataFim?: string
  minimoRespostasPares?: string
}

interface CicloDadosFormProps {
  ciclo: Ciclo
  onAtualizado: (ciclo: Ciclo) => void
}

/**
 * Cabeçalho editável de `CicloDetalhePage`. Subcomponente local (não
 * exportado fora desta pasta), mesmo critério já usado para `PaginaEditor`
 * em `PesquisaConstrutorPage`. Editável apenas quando `ciclo.status ===
 * 'rascunho'` — essa restrição é reforçada de verdade pelo backend
 * (`PUT /api/ciclos/:id` → `409 CICLO_NAO_EDITAVEL` fora de rascunho), então,
 * diferente da trava equivalente em `PesquisaConstrutorPage`, esta não
 * precisa ser documentada como "só client-side".
 */
export function CicloDadosForm({ ciclo, onAtualizado }: CicloDadosFormProps) {
  const somenteLeitura = ciclo.status !== 'rascunho'

  const [nome, setNome] = useState(ciclo.nome)
  const [descricao, setDescricao] = useState(ciclo.descricao ?? '')
  const [dataInicio, setDataInicio] = useState(ciclo.dataInicio)
  const [dataFim, setDataFim] = useState(ciclo.dataFim)
  const [minimoRespostasPares, setMinimoRespostasPares] = useState(String(ciclo.minimoRespostasPares))
  const [anonimizarRespostasPares, setAnonimizarRespostasPares] = useState(ciclo.anonimizarRespostasPares)

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

  async function handleSalvar() {
    setErroGeral(null)
    if (!validar()) return
    setSalvando(true)
    try {
      const atualizado = await atualizarCiclo(ciclo.id, {
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        dataInicio,
        dataFim,
        anonimizarRespostasPares,
        minimoRespostasPares: Number(minimoRespostasPares),
      })
      onAtualizado(atualizado)
    } catch (err) {
      setErroGeral(err instanceof ApiError ? err.message : 'Não foi possível salvar as alterações.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <Typography variant="subtitle1">Dados do ciclo</Typography>

        {somenteLeitura && (
          <Alert severity="info">Este ciclo está {ciclo.status === 'ativo' ? 'ativo' : 'encerrado'} e não pode mais ser editado.</Alert>
        )}

        <TextField
          label="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          error={Boolean(errosCampo.nome)}
          helperText={errosCampo.nome}
          disabled={somenteLeitura || salvando}
          required
          fullWidth
        />

        <TextField
          label="Descrição"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          error={Boolean(errosCampo.descricao)}
          helperText={errosCampo.descricao}
          disabled={somenteLeitura || salvando}
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
            disabled={somenteLeitura || salvando}
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
            disabled={somenteLeitura || salvando}
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
          disabled={somenteLeitura || salvando}
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
          required
        />

        <FormControlLabel
          control={
            <Switch
              checked={anonimizarRespostasPares}
              onChange={(e) => setAnonimizarRespostasPares(e.target.checked)}
              disabled={somenteLeitura || salvando}
            />
          }
          label="Anonimizar respostas de pares/subordinado (política de exposição de respostas do ciclo, aplicada pelo backend)"
        />

        {erroGeral && (
          <Alert severity="error" role="alert">
            {erroGeral}
          </Alert>
        )}

        {!somenteLeitura && (
          <div className="flex justify-end">
            <Button variant="contained" color="primary" onClick={handleSalvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
