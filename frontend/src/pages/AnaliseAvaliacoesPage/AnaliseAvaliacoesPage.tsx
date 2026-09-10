import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Alert, Button, Chip, Paper, Skeleton, TextField, Typography } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { AvaliacaoIdentificadaCard } from '../../components/analise/AvaliacaoIdentificadaCard/AvaliacaoIdentificadaCard'
import { AvisoLimitacaoAnonimizacao } from '../../components/analise/AvisoLimitacaoAnonimizacao/AvisoLimitacaoAnonimizacao'
import { GrupoClimaCard } from '../../components/analise/GrupoClimaCard/GrupoClimaCard'
import { GrupoParesSubordinadoCard } from '../../components/analise/GrupoParesSubordinadoCard/GrupoParesSubordinadoCard'
import { ApiError } from '../../lib/apiClient'
import { buscarCiclo } from '../../services/ciclosService'
import { buscarAvaliacoesAnalise } from '../../services/analiseService'
import type { AvaliacaoIdentificada, AvaliacoesAnalise, TipoRelacionamentoIdentificado } from '../../types/analise'
import { hojeYMD, inicioAnoCorrenteYMD } from './formatadores'

const SECOES_IDENTIFICADAS: { tipo: TipoRelacionamentoIdentificado; titulo: string }[] = [
  { tipo: 'autoavaliacao', titulo: 'Autoavaliação' },
  { tipo: 'gestor', titulo: 'Gestor' },
  { tipo: 'externo', titulo: 'Externo' },
]

function agruparPorTipo(itens: AvaliacaoIdentificada[]): Record<TipoRelacionamentoIdentificado, AvaliacaoIdentificada[]> {
  return {
    autoavaliacao: itens.filter((i) => i.tipoRelacionamento === 'autoavaliacao'),
    gestor: itens.filter((i) => i.tipoRelacionamento === 'gestor'),
    externo: itens.filter((i) => i.tipoRelacionamento === 'externo'),
  }
}

/**
 * Lista de respostas individuais de perguntas `texto_aberto` (avaliação 360 +
 * clima organizacional). `autoavaliacao`/`gestor`/`externo` saem sempre
 * identificados (sem terceiro a proteger). `pares`/`subordinado`/clima só
 * saem quando o grupo atinge `minimoNecessario` respondentes — ESTE LIMIAR
 * NÃO TEM BYPASS PARA NENHUM PAPEL, nem admin/gestor_rh (spec, seção 2).
 * Todo estado liberado/bloqueado, a ordem dos textos e a presença/ausência de
 * identidade já vêm prontos da API — esta página só formata/exibe.
 */
export function AnaliseAvaliacoesPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [de, setDe] = useState(() => inicioAnoCorrenteYMD())
  const [ate, setAte] = useState(() => hojeYMD())
  const [cicloId, setCicloId] = useState<string | null>(() => searchParams.get('cicloId'))
  const [nomeCiclo, setNomeCiclo] = useState<string | null>(null)

  const [dados, setDados] = useState<AvaliacoesAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!cicloId) return
    let cancelado = false
    buscarCiclo(cicloId)
      .then((ciclo) => {
        if (!cancelado) setNomeCiclo(ciclo.nome)
      })
      .catch(() => {
        // Best-effort — falha aqui nunca vira o `erro` principal da página,
        // mesmo padrão de AnaliseVisaoGeralPage.
      })
    return () => {
      cancelado = true
    }
  }, [cicloId])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    executarBusca()
  }

  function handleRemoverFiltroCiclo() {
    setCicloId(null)
    setNomeCiclo(null)
    setSearchParams({}, { replace: true })
    executarBusca({ cicloId: null })
  }

  const identificadasPorTipo = useMemo(
    () => (dados ? agruparPorTipo(dados.avaliacao360.identificadas) : null),
    [dados],
  )

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
        <div className="flex flex-wrap items-center gap-2">
          <Typography variant="h5" component="h1">
            Avaliações
          </Typography>
          {cicloId && (
            <Chip
              label={`Filtrado por ciclo: ${nomeCiclo ?? cicloId}`}
              onDelete={handleRemoverFiltroCiclo}
              size="small"
            />
          )}
        </div>
      </div>

      <Paper component="form" onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 p-4">
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
          slotProps={{ inputLabel: { shrink: true } }}
        />
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
        <div className="flex flex-col gap-6">
          {identificadasPorTipo && dados.avaliacao360.identificadas.length > 0 && (
            <div className="flex flex-col gap-3">
              <Typography variant="subtitle1">Avaliação 360 — respostas identificadas</Typography>
              {SECOES_IDENTIFICADAS.map(
                ({ tipo, titulo }) =>
                  identificadasPorTipo[tipo].length > 0 && (
                    <div key={tipo} className="flex flex-col gap-2">
                      <Typography variant="subtitle2" color="text.secondary">
                        {titulo}
                      </Typography>
                      <div className="flex flex-col gap-2">
                        {identificadasPorTipo[tipo].map((item, indice) => (
                          <AvaliacaoIdentificadaCard
                            key={`${item.avaliadoId}-${item.avaliadorId}-${item.perguntaId}-${indice}`}
                            item={item}
                          />
                        ))}
                      </div>
                    </div>
                  ),
              )}
            </div>
          )}

          {dados.avaliacao360.paresSubordinado.length > 0 && (
            <div className="flex flex-col gap-3">
              <Typography variant="subtitle1">Avaliação 360 — pares e subordinados</Typography>
              <div className="flex flex-col gap-2">
                {dados.avaliacao360.paresSubordinado.map((grupo, indice) => (
                  <GrupoParesSubordinadoCard
                    key={`${grupo.avaliadoId}-${grupo.cicloId}-${grupo.tipoRelacionamento}-${indice}`}
                    grupo={grupo}
                  />
                ))}
              </div>
            </div>
          )}

          {dados.climaGeral.length > 0 && (
            <div className="flex flex-col gap-3">
              <Typography variant="subtitle1">Clima e Satisfação</Typography>
              <div className="flex flex-col gap-2">
                {dados.climaGeral.map((grupo, indice) => (
                  <GrupoClimaCard key={`${grupo.cicloId}-${indice}`} grupo={grupo} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
