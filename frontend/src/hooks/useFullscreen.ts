import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

interface UseFullscreenResult<T extends HTMLElement> {
  containerRef: RefObject<T | null>
  isFullscreen: boolean
  isSupported: boolean
  entrar: () => Promise<void>
  sair: () => Promise<void>
}

/**
 * Hook genérico de estado semântico de Fullscreen API — só entra/sai/
 * sincroniza `isFullscreen` com o elemento apontado por `containerRef`.
 * Não contém nenhuma lógica de dimensões/resize (isso é responsabilidade de
 * quem consome o hook, ex. `NuvemBolhas` com seu próprio `ResizeObserver`) e
 * não é específico de nenhuma feature — reaproveitável por qualquer página
 * futura que precise do mesmo padrão de "modo TV"/tela cheia sobre um
 * elemento específico (nunca `document.documentElement`).
 */
export function useFullscreen<T extends HTMLElement>(): UseFullscreenResult<T> {
  const containerRef = useRef<T | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSupported] = useState(
    () => typeof document.fullscreenEnabled === 'boolean' && document.fullscreenEnabled,
  )

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  const entrar = useCallback(async () => {
    if (!isSupported || !containerRef.current) return
    await containerRef.current.requestFullscreen()
  }, [isSupported])

  const sair = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    }
  }, [])

  return { containerRef, isFullscreen, isSupported, entrar, sair }
}
