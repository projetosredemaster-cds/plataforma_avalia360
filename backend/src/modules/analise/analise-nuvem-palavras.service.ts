import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { ErroHttp } from '../../common/erro-http'
import { ehUuidValido } from '../../common/uuid'
import type { ColaboradorAutenticado } from '../../types/express'
import { buscarCicloOuFalhar } from '../ciclos-avaliacao/ciclos-avaliacao.service'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'
import { Resposta } from '../respostas/resposta.entity'
import { ItemResposta } from '../respostas/item-resposta.entity'
import { Pergunta } from '../perguntas/pergunta.entity'
import {
  PAPEIS_COM_ACESSO,
  buscarUniversoCiclos,
  calcularGateClima,
  calcularGateParesSubordinado,
  calcularMetricasComplementares,
  buscarMinimosPorCiclo,
  buscarTextosClima,
  buscarTextosParesSubordinado,
  classificarPorTipo,
  validarDataQuery,
} from './analise-comum'
import type { MetricasComplementares, PeriodoConsulta } from './analise-comum'

/**
 * REGRA MAIS SENSÍVEL DO PROJETO (ver task-backend.md/spec.md de "Nuvem de
 * Palavras" e skill `backend-anonimizacao-respostas`): mesmo a saída sendo
 * frequência agregada de palavras (não texto corrido), o gate de
 * `pares`/`subordinado` (COUNT(DISTINCT avaliador_id) >=
 * ciclos_avaliacao.minimo_respostas_pares) e o gate de `clima_geral` (ciclo
 * inteiro) se aplicam INTEGRALMENTE, sem bypass para admin/gestor_rh — os
 * únicos papéis com acesso a este endpoint. `anonimizar_respostas_pares`
 * NUNCA é lida por este arquivo (guard rail crítico nº 1 do plano) — a única
 * coluna de `ciclos_avaliacao` tocada é `minimo_respostas_pares`, via
 * `buscarMinimosPorCiclo` (analise-comum.ts). Nenhuma identidade de
 * avaliador/avaliado chega perto do tokenizador (guard rail crítico nº 2):
 * `buscarTextosIdentificados360` abaixo não faz nenhum join com
 * `Colaborador` e o array final `palavras` não carrega nenhum campo de
 * origem (nem `avaliadoId`, nem `cicloId`, nem `tipoRelacionamento`).
 */

/** Piso de caracteres — abaixo disso a palavra é descartada mesmo que não
 * seja stopword (fragmentos/conectores curtos que escapam da lista, ex.
 * "tô", "vc", "né", siglas de 1-2 letras). Confirmado: 3+ caracteres. */
const TAMANHO_MINIMO_PALAVRA = 3

/** Top N por frequência — spec seção 3.5, decisão de produto fechada. */
const LIMITE_PALAVRAS = 50

/**
 * Lista estática de stopwords em português — sem dependência externa (o
 * projeto não usa nenhuma lib de NLP hoje, spec seção 4). Cobre artigos,
 * preposições (+ contrações), conjunções, pronomes (pessoais, possessivos,
 * demonstrativos), formas comuns de ser/estar/ter/haver e advérbios/
 * indefinidos de altíssima frequência em português — não é uma lista
 * linguisticamente exaustiva, é dimensionada para o caso de uso (respostas
 * curtas de pesquisa de avaliação/clima), revisável em iteração futura sem
 * exigir nova spec (é detalhe de implementação, não decisão de produto).
 */
const STOPWORDS_PT = new Set<string>([
  // artigos
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  // preposições e contrações
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'num', 'numa', 'nuns', 'numas', 'por', 'pelo', 'pela', 'pelos', 'pelas',
  'para', 'com', 'sem', 'sob', 'sobre', 'entre', 'até', 'após', 'ante',
  'perante', 'contra', 'desde', 'durante', 'mediante', 'trás',
  // conjunções e conectores
  'e', 'ou', 'mas', 'porém', 'contudo', 'todavia', 'entretanto',
  'portanto', 'logo', 'pois', 'porque', 'que', 'se', 'quando', 'enquanto',
  'embora', 'conforme', 'como', 'nem', 'senão', 'então', 'assim', 'caso',
  // pronomes pessoais, possessivos, demonstrativos
  'eu', 'tu', 'ele', 'ela', 'nós', 'vós', 'eles', 'elas', 'me', 'te',
  'lhe', 'lhes', 'vos', 'mim', 'comigo', 'contigo', 'consigo', 'conosco',
  'convosco', 'meu', 'minha', 'meus', 'minhas', 'teu', 'tua', 'teus',
  'tuas', 'seu', 'sua', 'seus', 'suas', 'nosso', 'nossa', 'nossos',
  'nossas', 'vosso', 'vossa', 'vossos', 'vossas', 'este', 'esta', 'estes',
  'estas', 'esse', 'essa', 'esses', 'essas', 'aquele', 'aquela',
  'aqueles', 'aquelas', 'isto', 'isso', 'aquilo',
  // formas comuns de ser / estar / ter / haver
  'é', 'são', 'era', 'eram', 'foi', 'foram', 'ser', 'sendo', 'sido',
  'está', 'estão', 'estava', 'estavam', 'esteve', 'estive', 'estar',
  'estando', 'estado', 'tem', 'têm', 'tinha', 'tinham', 'teve',
  'tiveram', 'ter', 'tendo', 'tido', 'há', 'havia', 'houve',
  // advérbios, indefinidos e outros de altíssima frequência
  'não', 'sim', 'muito', 'muita', 'muitos', 'muitas', 'pouco', 'pouca',
  'poucos', 'poucas', 'mais', 'menos', 'tão', 'tanto', 'tanta', 'tantos',
  'tantas', 'todo', 'toda', 'todos', 'todas', 'algum', 'alguma',
  'alguns', 'algumas', 'nenhum', 'nenhuma', 'nenhuns', 'nenhumas',
  'outro', 'outra', 'outros', 'outras', 'mesmo', 'mesma', 'mesmos',
  'mesmas', 'próprio', 'própria', 'próprios', 'próprias', 'cada',
  'qualquer', 'quaisquer', 'qual', 'quais', 'quem', 'onde', 'aonde',
  'aqui', 'ali', 'lá', 'cá', 'hoje', 'ontem', 'amanhã', 'agora',
  'sempre', 'nunca', 'talvez', 'apenas', 'só', 'somente', 'também',
  'ainda', 'já', 'bem', 'mal', 'aí',
])

export interface PalavraFrequencia {
  palavra: string
  frequencia: number
}

export interface NuvemPalavrasAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  palavras: PalavraFrequencia[]
  metricas: MetricasComplementares
  motivoVazio: 'bloqueado_minimo_respondentes' | 'sem_dado' | null
}

export interface BuscarNuvemPalavrasDto {
  de: unknown
  ate: unknown
  cicloId?: unknown
}

/**
 * Identidade NUNCA é necessária aqui (diferente de `buscarIdentificadas360`
 * de "Avaliações") — só o texto é extraído. autoavaliacao/gestor/externo não
 * têm terceiro a proteger (spec seção 2), então nenhum gate se aplica, mas a
 * query nem sequer junta `Colaborador` (guard rail crítico nº 2).
 */
async function buscarTextosIdentificados360(ids: string[], periodo: PeriodoConsulta): Promise<string[]> {
  if (ids.length === 0) return []

  const linhas = await AppDataSource.getRepository(ItemResposta)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', {
      tipoPergunta: 'texto_aberto',
    })
    .innerJoin(Resposta, 'resposta', 'resposta.id = item.resposta_id')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.id = resposta.envio_id')
    .innerJoin(RelacionamentoAvaliacao, 'rel', 'rel.id = envio.relacionamento_id')
    .select("item.valor ->> 'texto'", 'texto')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('rel.tipo_relacionamento IN (:...tipos)', { tipos: ['autoavaliacao', 'gestor', 'externo'] })
    .andWhere('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .andWhere("item.valor ->> 'texto' IS NOT NULL AND item.valor ->> 'texto' <> ''")
    .getRawMany<{ texto: string }>()

  return linhas.map((l) => l.texto)
}

/**
 * Acentuação: NÃO normalizada nesta v1 (spec seção 4/seção 9 item 2,
 * decisão fechada) — mantém a grafia após lowercase. `\p{L}+` (Unicode
 * property escape, requer flag `u`) extrai sequências de letras, descartando
 * pontuação/dígitos/símbolos automaticamente como separadores.
 */
function tokenizarTexto(texto: string): string[] {
  const tokens = texto.toLowerCase().match(/\p{L}+/gu) ?? []
  return tokens.filter((palavra) => palavra.length >= TAMANHO_MINIMO_PALAVRA && !STOPWORDS_PT.has(palavra))
}

function contarFrequencia(textos: string[]): PalavraFrequencia[] {
  const contagem = new Map<string, number>()
  for (const texto of textos) {
    for (const palavra of tokenizarTexto(texto)) {
      contagem.set(palavra, (contagem.get(palavra) ?? 0) + 1)
    }
  }
  return [...contagem.entries()]
    .map(([palavra, frequencia]) => ({ palavra, frequencia }))
    .sort((a, b) => b.frequencia - a.frequencia || a.palavra.localeCompare(b.palavra, 'pt-BR'))
    .slice(0, LIMITE_PALAVRAS)
}

/**
 * Única função exportada do módulo — nuvem de palavras (visualização LISTA)
 * agregada da Análise, sempre restrita a admin/gestor_rh (`garantirPapel`
 * como primeira linha, única checagem de papel de toda a função — sem
 * bypass do gate de anonimização para nenhum papel).
 */
export async function buscarNuvemPalavras(
  ator: ColaboradorAutenticado,
  dto: BuscarNuvemPalavrasDto,
): Promise<NuvemPalavrasAnalise> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const de = validarDataQuery(dto.de, 'de')
  const ate = validarDataQuery(dto.ate, 'ate')
  if (ate < de) {
    throw new ErroHttp(422, 'PERIODO_INVALIDO', 'Campo "ate" deve ser maior ou igual a "de".')
  }

  let cicloId: string | null = null
  if (dto.cicloId !== undefined && dto.cicloId !== null && dto.cicloId !== '') {
    const cicloIdNormalizado = typeof dto.cicloId === 'string' ? dto.cicloId.trim() : dto.cicloId
    if (!ehUuidValido(cicloIdNormalizado)) {
      throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "cicloId" deve ser um uuid válido.')
    }
    await buscarCicloOuFalhar(cicloIdNormalizado)
    cicloId = cicloIdNormalizado
  }

  const periodo: PeriodoConsulta = { de, ate }
  const idsUniverso = await buscarUniversoCiclos(periodo, cicloId ?? undefined)

  if (idsUniverso.length === 0) {
    return {
      periodo,
      cicloId,
      palavras: [],
      metricas: { totalEnvios: 0, totalRespostas: 0, tempoMedioResposta: { horas: 0, amostras: 0 } },
      // Ciclo filtrado nem sequer está na vigência do período — ausência de
      // dado, não há gate a considerar. Sem cicloId no filtro, permanece null
      // (nunca inferir motivo quando a consulta cobre múltiplos ciclos).
      motivoVazio: cicloId !== null ? 'sem_dado' : null,
    }
  }

  const { idsAval360, idsClima } = await classificarPorTipo(idsUniverso)

  const [textosIdentificados, gateParesSubordinado, gateClima, minimosPorCiclo, metricas] = await Promise.all([
    buscarTextosIdentificados360(idsAval360, periodo),
    calcularGateParesSubordinado(idsAval360, periodo),
    calcularGateClima(idsClima, periodo),
    buscarMinimosPorCiclo(idsUniverso),
    calcularMetricasComplementares(idsAval360, idsClima, periodo),
  ])

  // GATE primeiro, busca de texto só para os grupos JÁ liberados — nunca
  // buscar-depois-filtrar (regra mais sensível do projeto).
  const gruposLiberados360 = gateParesSubordinado.filter(
    (g) => g.totalRespondentes >= (minimosPorCiclo.get(g.cicloId) ?? 3),
  )
  const textosPorGrupo360 = await buscarTextosParesSubordinado(gruposLiberados360, periodo)
  const textosParesSubordinado = [...textosPorGrupo360.values()].flat().map((item) => item.texto)

  const idsClimaLiberados = gateClima
    .filter((g) => g.totalRespondentes >= (minimosPorCiclo.get(g.cicloId) ?? 3))
    .map((g) => g.cicloId)
  const textosPorCicloClima = await buscarTextosClima(idsClimaLiberados, periodo)
  const textosClima = [...textosPorCicloClima.values()].flat().map((item) => item.texto)

  // Fusão deliberada numa única lista (spec seção 3.6) — sem segmentação por
  // pergunta, sem distinção de origem no resultado final (guard rail nº 2).
  const todosOsTextos = [...textosIdentificados, ...textosParesSubordinado, ...textosClima]
  const palavras = contarFrequencia(todosOsTextos)

  // Motivo categórico do vazio — só quando o filtro é de UM ciclo específico
  // e a lista final ficou vazia. Nunca nenhuma contagem numérica sai daqui,
  // só o enum (reversão pontual e justificada da decisão original de "Nuvem
  // de Palavras", ver CLAUDE.md/spec.md seção 2 — consistência com o estado
  // equivalente já exposto por "Avaliações"). "Ausência de dado" (ninguém
  // respondeu nada, nenhum grupo existe) nunca vira "bloqueado" — só quando
  // existe de fato um grupo abaixo do mínimo configurado.
  let motivoVazio: NuvemPalavrasAnalise['motivoVazio'] = null
  if (cicloId !== null && palavras.length === 0) {
    if (idsAval360.includes(cicloId)) {
      const linhasDoCiclo = gateParesSubordinado.filter((g) => g.cicloId === cicloId)
      const minimo = minimosPorCiclo.get(cicloId) ?? 3
      // `g.totalRespondentes > 0` é defensivo: `calcularGateParesSubordinado`
      // (INNER JOIN com Resposta) nunca retorna linha com 0 hoje, mas mantém
      // a mesma guarda explícita do branch de clima abaixo por simetria,
      // caso essa invariante mude no futuro em outro consumidor.
      const temGrupoBloqueado = linhasDoCiclo.some((g) => g.totalRespondentes > 0 && g.totalRespondentes < minimo)
      motivoVazio = temGrupoBloqueado ? 'bloqueado_minimo_respondentes' : 'sem_dado'
    } else if (idsClima.includes(cicloId)) {
      const linhaClima = gateClima.find((g) => g.cicloId === cicloId)
      const minimo = minimosPorCiclo.get(cicloId) ?? 3
      const bloqueado = !!linhaClima && linhaClima.totalRespondentes > 0 && linhaClima.totalRespondentes < minimo
      motivoVazio = bloqueado ? 'bloqueado_minimo_respondentes' : 'sem_dado'
    } else {
      // Ciclo sem pesquisa vinculada (não entrou em nenhum dos dois grupos).
      motivoVazio = 'sem_dado'
    }
  }

  return { periodo, cicloId, palavras, metricas, motivoVazio }
}
