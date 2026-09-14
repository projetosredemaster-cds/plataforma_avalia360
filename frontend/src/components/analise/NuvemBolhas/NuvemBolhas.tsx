import { useEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import cloud from 'd3-cloud'
import type { PalavraFrequencia } from '../../../types/analise'

interface NuvemBolhasProps {
  palavras: PalavraFrequencia[]
  /** Altura da área de desenho fora do Modo TV. Dentro do Modo TV, a página passa `'100%'`. */
  altura?: number | string
}

interface DimensoesContainer {
  largura: number
  altura: number
}

interface PalavraPosicionada {
  texto: string
  tamanho: number
  x: number
  y: number
  intensidade: number
}

interface PalavraLayout {
  text: string
  size: number
  frequenciaOriginal: number
  x?: number
  y?: number
  rotate?: number
}

const TAMANHO_FONTE_MINIMO = 14
const TAMANHO_FONTE_MAXIMO = 72
const INTENSIDADE_MINIMA = 0.45
const LIMIAR_VARIACAO_DIMENSAO = 0.05
const DEBOUNCE_RESIZE_MS = 200

/**
 * Nuvem de palavras propriamente dita (tamanho ∝ frequência), consumindo o
 * mesmo array `palavras` já carregado por `AnaliseNuvemPalavrasPage` — sem
 * nenhuma chamada de API própria, sem reordenar/filtrar/agrupar (o array
 * passado para `d3.layout.cloud().words(...)` é construído por `.map()`,
 * transformação 1:1). Tamanho e cor de cada palavra derivam só da
 * `frequencia` daquele item específico do array recebido; o posicionamento
 * espacial (x/y/rotação) é decidido internamente pelo algoritmo de
 * empacotamento do `d3-cloud`, não é "reordenar a lista" no sentido do guard
 * rail de anonimização (ver task-frontend.md desta rodada).
 */
export function NuvemBolhas({ palavras, altura = 560 }: NuvemBolhasProps) {
  const theme = useTheme()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dimensoes, setDimensoes] = useState<DimensoesContainer | null>(null)
  const [palavrasPosicionadas, setPalavrasPosicionadas] = useState<PalavraPosicionada[]>([])

  // ResizeObserver: fonte de dimensões reais do contêiner, com debounce e
  // atualização só quando a variação exceder o limiar (~5%) — evita
  // recalcular o layout do d3-cloud a cada pixel/frame de transição.
  useEffect(() => {
    const elemento = containerRef.current
    if (!elemento) return

    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect

      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        setDimensoes((atual) => {
          if (!atual) return { largura: width, altura: height }
          const variacaoLargura = atual.largura > 0 ? Math.abs(width - atual.largura) / atual.largura : 1
          const variacaoAltura = atual.altura > 0 ? Math.abs(height - atual.altura) / atual.altura : 1
          if (variacaoLargura < LIMIAR_VARIACAO_DIMENSAO && variacaoAltura < LIMIAR_VARIACAO_DIMENSAO) {
            return atual
          }
          return { largura: width, altura: height }
        })
      }, DEBOUNCE_RESIZE_MS)
    })

    observer.observe(elemento)
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    // Sem dimensão válida ainda (primeira medição do ResizeObserver) ou sem
    // palavras: não há layout a calcular. Não reseta `palavrasPosicionadas`
    // aqui (evitaria setState síncrono no corpo do efeito) — o render below
    // já ignora esse estado quando `dimensoesValidas` é falso.
    if (!dimensoes || dimensoes.largura <= 0 || dimensoes.altura <= 0 || palavras.length === 0) {
      return
    }

    const frequencias = palavras.map((item) => item.frequencia)
    const frequenciaMinima = Math.min(...frequencias)
    const frequenciaMaxima = Math.max(...frequencias)

    function escalaTamanho(frequencia: number): number {
      if (frequenciaMaxima === frequenciaMinima) return (TAMANHO_FONTE_MINIMO + TAMANHO_FONTE_MAXIMO) / 2
      const proporcao = (frequencia - frequenciaMinima) / (frequenciaMaxima - frequenciaMinima)
      return TAMANHO_FONTE_MINIMO + Math.sqrt(proporcao) * (TAMANHO_FONTE_MAXIMO - TAMANHO_FONTE_MINIMO)
    }

    function fatorIntensidade(frequencia: number): number {
      if (frequenciaMaxima === frequenciaMinima) return 1
      const proporcao = (frequencia - frequenciaMinima) / (frequenciaMaxima - frequenciaMinima)
      return INTENSIDADE_MINIMA + Math.sqrt(proporcao) * (1 - INTENSIDADE_MINIMA)
    }

    // 1:1 por .map() — preserva todos os itens e a frequência original de
    // cada um; nunca .sort()/.filter() sobre `palavras`.
    const palavrasParaLayout: PalavraLayout[] = palavras.map((item) => ({
      text: item.palavra,
      size: escalaTamanho(item.frequencia),
      frequenciaOriginal: item.frequencia,
    }))

    let cancelado = false

    const layout = cloud<PalavraLayout>()
      .size([dimensoes.largura, dimensoes.altura])
      .words(palavrasParaLayout)
      .padding(4)
      .rotate(() => 0)
      .font('Figtree, "Segoe UI", Roboto, Helvetica, Arial, sans-serif')
      .fontSize((d) => d.size ?? TAMANHO_FONTE_MINIMO)
      .on('end', (palavrasCalculadas) => {
        if (cancelado) return
        setPalavrasPosicionadas(
          palavrasCalculadas.map((item) => ({
            texto: item.text ?? '',
            tamanho: item.size ?? TAMANHO_FONTE_MINIMO,
            x: item.x ?? 0,
            y: item.y ?? 0,
            intensidade: fatorIntensidade(item.frequenciaOriginal),
          })),
        )
      })

    layout.start()

    return () => {
      cancelado = true
      layout.stop()
    }
  }, [dimensoes, palavras])

  const dimensoesValidas = Boolean(dimensoes && dimensoes.largura > 0 && dimensoes.altura > 0)
  const chaveRemount = dimensoes
    ? `${Math.round(dimensoes.largura / 10) * 10}x${Math.round(dimensoes.altura / 10) * 10}`
    : 'sem-dimensao'

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: altura }}>
      <svg key={chaveRemount} width="100%" height="100%">
        <g transform={dimensoes ? `translate(${dimensoes.largura / 2}, ${dimensoes.altura / 2})` : undefined}>
          {dimensoesValidas &&
            palavrasPosicionadas.map((item) => (
              <text
                key={item.texto}
                textAnchor="middle"
                x={item.x}
                y={item.y}
                fontSize={item.tamanho}
                fontFamily="Figtree, sans-serif"
                fontWeight={600}
                fill={alpha(theme.palette.primary.main, item.intensidade)}
              >
                {item.texto}
              </text>
            ))}
        </g>
      </svg>
    </Box>
  )
}
