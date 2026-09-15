import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

interface UseFullscreenResult<T extends HTMLElement> {
  containerRef: RefObject<T | null>
  isFullscreen: boolean
  isSupported: boolean
  entrar: () => Promise<void>
  sair: () => Promise<void>
}

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
