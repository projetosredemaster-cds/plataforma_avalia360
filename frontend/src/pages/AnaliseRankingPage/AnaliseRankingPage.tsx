import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  IconButton,
  MenuItem,
  Paper,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { RankingTabela } from '../../components/analise/RankingTabela/RankingTabela'
import { SeletorCiclo } from '../../components/analise/SeletorCiclo/SeletorCiclo'
import { CARGO_OPCOES } from '../../constants/colaborador'
import { ApiError } from '../../lib/apiClient'
import { buscarRankingAnalise } from '../../services/analiseService'
import { listarEquipes } from '../../services/equipesService'
import type { Equipe } from '../../types/colaborador'
import type { MetricaRanking, ModoRanking, OrdemRanking, RankingAnalise } from '../../types/analise'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

function lerModo(valor: string | null): ModoRanking {
  return valor === 'equipe' ? 'equipe' : 'avaliado'
}
function lerMetrica(valor: string | null): MetricaRanking {
  return valor === 'matriz' ? 'matriz' : 'likert'
}
function lerOrdem(valor: string | null): OrdemRanking {
  return valor === 'asc' ? 'asc' : 'desc'
}

export function AnaliseRankingPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [cicloId, setCicloId] = useState<string | null>(() => searchParams.get('cicloId'))
  const [modo, setModo] = useState<ModoRanking>(() => lerModo(searchParams.get('modo')))
  const [cargo, setCargo] = useState<string | null>(() => searchParams.get('cargo'))
  const [equipeId, setEquipeId] = useState<string | null>(() => searchParams.get('equipeId'))
  const [ordenarPor, setOrdenarPor] = useState<MetricaRanking>(() => lerMetrica(searchParams.get('ordenarPor')))
  const [ordem, setOrdem] = useState<OrdemRanking>(() => lerOrdem(searchParams.get('ordem')))

  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [dados, setDados] = useState<RankingAnalise | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    listarEquipes().then(setEquipes).catch(() => {})
  }, [])

  function sincronizarUrl(next: {
    cicloId: string | null
    modo: ModoRanking
    cargo: string | null
    equipeId: string | null
    ordenarPor: MetricaRanking
    ordem: OrdemRanking
  }) {
    const params: Record<string, string> = {}
    if (next.cicloId) params.cicloId = next.cicloId
    if (next.modo !== 'avaliado') params.modo = next.modo
    if (next.cargo && next.modo === 'avaliado') params.cargo = next.cargo
    if (next.equipeId) params.equipeId = next.equipeId
    if (next.ordenarPor !== 'likert') params.ordenarPor = next.ordenarPor
    if (next.ordem !== 'desc') params.ordem = next.ordem
    setSearchParams(params, { replace: true })
  }

  const executarBusca = useCallback(
    async (overrides?: {
      cicloId?: string | null
      modo?: ModoRanking
      cargo?: string | null
      equipeId?: string | null
      ordenarPor?: MetricaRanking
      ordem?: OrdemRanking
    }) => {
      const atual = {
        cicloId: overrides?.cicloId !== undefined ? overrides.cicloId : cicloId,
        modo: overrides?.modo ?? modo,
        cargo: overrides?.cargo !== undefined ? overrides.cargo : cargo,
        equipeId: overrides?.equipeId !== undefined ? overrides.equipeId : equipeId,
        ordenarPor: overrides?.ordenarPor ?? ordenarPor,
        ordem: overrides?.ordem ?? ordem,
      }

      if (!atual.cicloId) {
        setDados(null)
        setErro(null)
        setCarregando(false)
        return
      }

      setCarregando(true)
      setErro(null)
      try {
        const resultado = await buscarRankingAnalise({
          cicloId: atual.cicloId,
          modo: atual.modo,
          cargo: atual.modo === 'avaliado' && atual.cargo ? atual.cargo : undefined,
          equipeId: atual.equipeId ?? undefined,
          ordenarPor: atual.ordenarPor,
          ordem: atual.ordem,
        })
        setDados(resultado)
      } catch (err) {
        if (err instanceof ApiError && err.codigo === 'CICLO_NAO_ENCONTRADO') {
          setErro('O ciclo selecionado não foi encontrado. Selecione outro ciclo.')
        } else if (err instanceof ApiError && err.codigo === 'CICLO_NAO_E_AVALIACAO_360') {
          setErro('Ranking só está disponível para ciclos de avaliação 360°. Selecione outro ciclo.')
        } else if (err instanceof ApiError && err.codigo === 'FILTRO_INCOMPATIVEL_COM_MODO') {
          setErro('O filtro de cargo não é compatível com o modo Equipes. Remova o filtro de cargo e tente novamente.')
        } else {
          setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar o ranking.')
        }
      } finally {
        setCarregando(false)
      }
    },
    [cicloId, modo, cargo, equipeId, ordenarPor, ordem],
  )

  useEffect(() => {

    executarBusca()

  }, [])

  function handleCicloChange(novoCicloId: string | null) {
    setCicloId(novoCicloId)
    sincronizarUrl({ cicloId: novoCicloId, modo, cargo, equipeId, ordenarPor, ordem })
    executarBusca({ cicloId: novoCicloId })
  }

  function handleModoChange(novoModo: ModoRanking) {

    const novoCargo = novoModo === 'equipe' ? null : cargo
    setModo(novoModo)
    setCargo(novoCargo)
    sincronizarUrl({ cicloId, modo: novoModo, cargo: novoCargo, equipeId, ordenarPor, ordem })
    executarBusca({ modo: novoModo, cargo: novoCargo })
  }

  function handleCargoChange(novoCargo: string | null) {
    setCargo(novoCargo)
    sincronizarUrl({ cicloId, modo, cargo: novoCargo, equipeId, ordenarPor, ordem })
    executarBusca({ cargo: novoCargo })
  }

  function handleEquipeChange(novoEquipeId: string | null) {
    setEquipeId(novoEquipeId)
    sincronizarUrl({ cicloId, modo, cargo, equipeId: novoEquipeId, ordenarPor, ordem })
    executarBusca({ equipeId: novoEquipeId })
  }

  function handleOrdenarPorChange(metrica: MetricaRanking) {
    const novoOrdem: OrdemRanking = ordenarPor === metrica ? (ordem === 'desc' ? 'asc' : 'desc') : 'desc'
    setOrdenarPor(metrica)
    setOrdem(novoOrdem)
    sincronizarUrl({ cicloId, modo, cargo, equipeId, ordenarPor: metrica, ordem: novoOrdem })
    executarBusca({ ordenarPor: metrica, ordem: novoOrdem })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-start gap-2">
        <Typography variant="h5" component="h1">
          Ranking
        </Typography>

        <Tooltip title="Apresenta a média das avaliações por colaborador e por equipe. Somente em pesquisas 360" arrow placement="top">
          <IconButton size="medium" aria-label="Avaliações" sx={{ p: 0.25 }}>
              <InfoOutlinedIcon fontSize="medium" color="action" />
            </IconButton>
          </Tooltip>
      </div>
      
      <Paper className="flex flex-wrap items-center gap-3 p-4">
        <SeletorCiclo cicloId={cicloId} onChange={handleCicloChange} />

        <ToggleButtonGroup
          size="small"
          exclusive
          value={modo}
          onChange={(_, valor) => valor && handleModoChange(valor as ModoRanking)}
        >
          <ToggleButton value="avaliado">Avaliados</ToggleButton>
          <ToggleButton value="equipe">Equipes</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          select
          label="Cargo"
          size="small"
          disabled={modo === 'equipe'}
          value={cargo ?? ''}
          onChange={(e) => handleCargoChange(e.target.value === '' ? null : e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">Todos os cargos</MenuItem>
          {CARGO_OPCOES.map((opcao) => (
            <MenuItem key={opcao} value={opcao}>
              {opcao}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label="Equipe"
          size="small"
          value={equipeId ?? ''}
          onChange={(e) => handleEquipeChange(e.target.value === '' ? null : e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">Todas as equipes</MenuItem>
          {equipes.map((equipe) => (
            <MenuItem key={equipe.id} value={equipe.id}>
              {equipe.nome}
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      {!cicloId && !carregando && (
        <Alert severity="info">Selecione um ciclo para ver o ranking.</Alert>
      )}

      {cicloId && carregando && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, indice) => (
            <Skeleton key={indice} variant="rounded" height={40} />
          ))}
        </div>
      )}

      {cicloId && !carregando && erro && (
        <Alert severity="error">{erro}</Alert>
      )}

      {cicloId && !carregando && !erro && dados && dados.linhas.length === 0 && (
        <Alert severity="info">Nenhum {modo === 'avaliado' ? 'avaliado' : 'equipe'} encontrado para o ciclo/filtro selecionado.</Alert>
      )}

      {cicloId && !carregando && !erro && dados && dados.linhas.length > 0 && (
        <RankingTabela dados={dados} onOrdenarPorChange={handleOrdenarPorChange} />
      )}
    </div>
  )
}
