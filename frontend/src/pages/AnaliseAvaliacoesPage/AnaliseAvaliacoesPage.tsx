import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Paper,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useSearchParams } from 'react-router-dom'
import { AvaliacaoIdentificadaCard } from '../../components/analise/AvaliacaoIdentificadaCard/AvaliacaoIdentificadaCard'
import { AvisoLimitacaoAnonimizacao } from '../../components/analise/AvisoLimitacaoAnonimizacao/AvisoLimitacaoAnonimizacao'
import { GrupoClimaCard } from '../../components/analise/GrupoClimaCard/GrupoClimaCard'
import { GrupoParesSubordinadoCard } from '../../components/analise/GrupoParesSubordinadoCard/GrupoParesSubordinadoCard'
import { SeletorCiclo } from '../../components/analise/SeletorCiclo/SeletorCiclo'
import { ApiError } from '../../lib/apiClient'
import { buscarAvaliacoesAnalise } from '../../services/analiseService'
import type { AvaliacoesAnalise } from '../../types/analise'
import { agruparIdentificadasPorPergunta, agruparPorCiclo } from './agrupamento'
import { hojeYMD, inicioAnoCorrenteYMD } from './formatadores'

export function AnaliseAvaliacoesPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [de, setDe] = useState(() => inicioAnoCorrenteYMD())
  const [ate, setAte] = useState(() => hojeYMD())
  const [cicloId, setCicloId] = useState<string | null>(() => searchParams.get('cicloId'))

  const [dados, setDados] = useState<AvaliacoesAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [resultadoVersao, setResultadoVersao] = useState(0)

  const periodoInvalido = ate < de

  const executarBusca = useCallback(
    async (overrides?: { cicloId?: string | null }) => {
      const cicloIdAtual = overrides?.cicloId !== undefined ? overrides.cicloId : cicloId

      if (ate < de) return

      setCarregando(true)
      setErro(null)
      try {
        const resultado = await buscarAvaliacoesAnalise({ de, ate, cicloId: cicloIdAtual ?? undefined })
        setDados(resultado)
        setResultadoVersao((v) => v + 1)
      } catch (err) {
        if (err instanceof ApiError && err.codigo === 'CICLO_NAO_ENCONTRADO') {
          setErro('O ciclo filtrado não foi encontrado. Remova o filtro de ciclo e tente novamente.')
        } else {
          setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar as avaliações.')
        }
      } finally {
        setCarregando(false)
      }
    },
    [de, ate, cicloId],
  )

  useEffect(() => {
    // Carga inicial via API — não é dado derivável durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    executarBusca()
    // Fetch intencionalmente só-no-mount: `executarBusca` muda a cada tecla em
    // "De"/"Até"/troca de ciclo, incluí-la no array de deps repetiria a busca a
    // cada edição do formulário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    executarBusca()
  }

  function handleCicloChange(novoCicloId: string | null) {
    setCicloId(novoCicloId)
    setSearchParams(novoCicloId ? { cicloId: novoCicloId } : {}, { replace: true })
    executarBusca({ cicloId: novoCicloId })
  }

  const gruposPorCiclo = useMemo(() => (dados ? agruparPorCiclo(dados) : []), [dados])

  const vazio =
    !!dados &&
    dados.avaliacao360.identificadas.length === 0 &&
    dados.avaliacao360.paresSubordinado.length === 0 &&
    dados.climaGeral.length === 0

  const existeGrupoLiberado =
    !!dados &&
    (dados.avaliacao360.paresSubordinado.some((g) => g.liberado) || dados.climaGeral.some((g) => g.liberado))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="h5" component="h1">
          Avaliações
        </Typography>
      </div>

      <Paper component="form" onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3 p-4">
        <TextField
          label="De"
          type="date"
          size="small"
          value={de}
          onChange={(e) => setDe(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Até"
          type="date"
          size="small"
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          error={periodoInvalido}
          helperText={periodoInvalido ? 'A data final não pode ser anterior à data inicial.' : ' '}
          slotProps={{
            inputLabel: { shrink: true },
            formHelperText: {
              sx: {
                position: 'absolute',
                bottom: -20,
                left: 0,
                whiteSpace: 'nowrap',
              },
            },
          }}
        />
        <SeletorCiclo cicloId={cicloId} onChange={handleCicloChange} />
        <Button type="submit" variant="contained" disabled={periodoInvalido || carregando}>
          Aplicar filtro
        </Button>
      </Paper>

      {!carregando && !erro && existeGrupoLiberado && <AvisoLimitacaoAnonimizacao />}

      {carregando && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, indice) => (
            <Skeleton key={indice} variant="rounded" height={120} />
          ))}
        </div>
      )}

      {!carregando && erro && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Typography role="alert" color="error">
            {erro}
          </Typography>
          <Button variant="contained" color="primary" onClick={() => executarBusca()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {!carregando && !erro && vazio && (
        <Alert severity="info">Nenhuma resposta de texto aberto encontrada para o período/filtro selecionado.</Alert>
      )}

      {!carregando && !erro && dados && !vazio && (
        <div className="flex flex-col gap-3">
          {gruposPorCiclo.map((grupoCiclo) => (
            <Accordion key={`${resultadoVersao}-${grupoCiclo.cicloId}`} defaultExpanded={Boolean(cicloId)}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                  {grupoCiclo.nomeCiclo}
                </Typography>
              </AccordionSummary>
              <AccordionDetails className="flex flex-col gap-6">
                {grupoCiclo.identificadas.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <Typography variant="subtitle2">Avaliação 360 — respostas identificadas</Typography>
                    {agruparIdentificadasPorPergunta(grupoCiclo.identificadas).map((g) => (
                      <div key={g.perguntaId} className="flex flex-col gap-2">
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, overflowWrap: 'break-word', wordBreak: 'break-word' }}
                        >
                          {g.perguntaEnunciado}
                        </Typography>
                        <div className="flex flex-col gap-2">
                          {g.itens.map((item, indice) => (
                            <AvaliacaoIdentificadaCard
                              key={`${item.avaliadoId}-${item.avaliadorId}-${indice}`}
                              item={item}
                              ocultarEnunciado
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {grupoCiclo.paresSubordinado.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <Typography variant="subtitle2">Avaliação 360 — pares e subordinados</Typography>
                    <div className="flex flex-col gap-2">
                      {grupoCiclo.paresSubordinado.map((grupo, indice) => (
                        <GrupoParesSubordinadoCard
                          key={`${grupo.avaliadoId}-${grupo.tipoRelacionamento}-${indice}`}
                          grupo={grupo}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {grupoCiclo.climaGeral.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <Typography variant="subtitle2">Clima e Satisfação</Typography>
                    <div className="flex flex-col gap-2">
                      {grupoCiclo.climaGeral.map((grupo, indice) => (
                        <GrupoClimaCard key={indice} grupo={grupo} />
                      ))}
                    </div>
                  </div>
                )}
              </AccordionDetails>
            </Accordion>
          ))}
        </div>
      )}
    </div>
  )
}
