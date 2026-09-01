import { useState } from 'react'
import { Alert, Button, Card, CardContent, Chip } from '@mui/material'
import type { Competencia } from '../../types/competencia'
import type { ConfiguracaoLikert, ConfiguracaoPessoa, PerguntaPayload } from '../../types/pesquisa'
import {
  PerguntaMatrizEditor,
  type PerguntaMatrizValor,
} from '../../components/perguntas/PerguntaMatriz/PerguntaMatrizEditor'
import {
  PerguntaPessoaEditor,
  type PerguntaPessoaValor,
} from '../../components/perguntas/PerguntaPessoa/PerguntaPessoaEditor'
import { validarConfiguracaoPessoa, validarPerguntaMatriz } from '../../components/perguntas/validacaoPergunta'

type TipoRascunho = 'matriz' | 'pessoa'
type RascunhoValor = PerguntaMatrizValor | PerguntaPessoaValor

const TIPO_LABEL: Record<TipoRascunho, string> = {
  matriz: 'Matriz',
  pessoa: 'Pessoa',
}

const CONFIG_LIKERT_DEFAULT: ConfiguracaoLikert = { niveis: 5, rotulos: ['1', '2', '3', '4', '5'] }
const CONFIG_PESSOA_DEFAULT: ConfiguracaoPessoa = { filtroRelacionamento: [] }

interface PerguntaRascunhoCardProps {
  tipo: TipoRascunho
  /** Buscada uma vez pela página pai — este card nunca chama a API. */
  competencias: Competencia[]
  criando: boolean
  erro: string | null
  onSalvar: (payload: PerguntaPayload) => Promise<void>
  onCancelar: () => void
}

/**
 * Card de pergunta `matriz`/`pessoa` ainda não persistida — nenhum desses
 * dois tipos tem default válido para `competenciaIds`/`filtroRelacionamento`
 * (o backend exige não-vazio), então o card fica em rascunho puramente
 * local (nenhuma chamada à API) até a validação passar e o usuário clicar
 * em "Salvar", que dispara o primeiro `criarPergunta`.
 */
export function PerguntaRascunhoCard({ tipo, competencias, criando, erro, onSalvar, onCancelar }: PerguntaRascunhoCardProps) {
  const [valor, setValor] = useState<RascunhoValor>(
    tipo === 'matriz'
      ? { enunciado: '', obrigatoria: true, configuracao: CONFIG_LIKERT_DEFAULT, competenciaIds: [] }
      : { enunciado: '', obrigatoria: true, configuracao: CONFIG_PESSOA_DEFAULT },
  )

  const valido =
    valor.enunciado.trim().length > 0 &&
    (tipo === 'matriz'
      ? validarPerguntaMatriz((valor as PerguntaMatrizValor).configuracao, (valor as PerguntaMatrizValor).competenciaIds)
      : validarConfiguracaoPessoa((valor as PerguntaPessoaValor).configuracao))

  async function handleSalvar() {
    if (!valido) return
    const payload: PerguntaPayload =
      tipo === 'matriz'
        ? {
            tipo: 'matriz',
            enunciado: valor.enunciado,
            obrigatoria: valor.obrigatoria,
            configuracao: (valor as PerguntaMatrizValor).configuracao,
            competenciaIds: (valor as PerguntaMatrizValor).competenciaIds,
          }
        : {
            tipo: 'pessoa',
            enunciado: valor.enunciado,
            obrigatoria: valor.obrigatoria,
            configuracao: (valor as PerguntaPessoaValor).configuracao,
          }
    await onSalvar(payload)
  }

  return (
    <Card variant="outlined" sx={{ borderStyle: 'dashed' }}>
      <CardContent className="flex flex-col gap-3">
        <Chip label={`${TIPO_LABEL[tipo]} (nova)`} size="small" color="secondary" variant="outlined" />

        {tipo === 'matriz' ? (
          <PerguntaMatrizEditor valor={valor as PerguntaMatrizValor} onChange={setValor} competencias={competencias} />
        ) : (
          <PerguntaPessoaEditor valor={valor as PerguntaPessoaValor} onChange={setValor} />
        )}

        {erro && (
          <Alert severity="error" role="alert">
            {erro}
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button onClick={onCancelar} disabled={criando}>
            Cancelar
          </Button>
          <Button variant="contained" color="primary" onClick={handleSalvar} disabled={!valido || criando}>
            {criando ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
