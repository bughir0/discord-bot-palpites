/** Pergunta pronta para enviar à API */
export type ParsedQuestionDraft = {
  enunciado: string
  alternativas: string[]
  corretaIndex: number
}

const ALT_LINE = /^([A-Fa-f])[\).\:\-]\s*(.+)$/
const CORRECT_STAR = /^\*\s*([A-Fa-f])\s*$/
const CORRECT_LABEL = /^correta\s*:\s*([A-Fa-f])\s*$/i

/**
 * Interpreta blocos de texto separados por linha em branco.
 * Formato de cada bloco:
 *   Enunciado (pode ter várias linhas antes das alternativas)
 *   A) alternativa
 *   B) alternativa
 *   C) alternativa
 *   * B   ou   Correta: B
 */
export function parseBulkQuestions(text: string): { ok: ParsedQuestionDraft[]; errors: string[] } {
  const ok: ParsedQuestionDraft[] = []
  const errors: string[] = []
  const blocks = text
    .split(/\n(?:[ \t]*\n)+/)
    .map((b) => b.trim())
    .filter(Boolean)

  blocks.forEach((block, blockIdx) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return

    const preamble: string[] = []
    const alts: { letter: string; text: string }[] = []
    let correctLetter: string | null = null

    for (const line of lines) {
      const cor = line.match(CORRECT_STAR) || line.match(CORRECT_LABEL)
      if (cor) {
        correctLetter = cor[1].toUpperCase()
        continue
      }
      const am = line.match(ALT_LINE)
      if (am) {
        alts.push({ letter: am[1].toUpperCase(), text: am[2].trim() })
        continue
      }
      if (alts.length === 0) preamble.push(line)
    }

    const enunciado = preamble
      .map((l) => l.replace(/^\d+[\).\s]+/, "").trim())
      .join(" ")
      .trim()

    if (!enunciado) {
      errors.push(`Bloco ${blockIdx + 1}: falta enunciado (texto antes das linhas A), B), …).`)
      return
    }
    if (alts.length < 2) {
      errors.push(`Bloco ${blockIdx + 1}: precisa de pelo menos 2 alternativas (A), B), …).`)
      return
    }

    alts.sort((a, b) => a.letter.localeCompare(b.letter))
    const alternativas = alts.map((a) => a.text)
    const letterOrder = alts.map((a) => a.letter)
    let corretaIndex = correctLetter ? letterOrder.indexOf(correctLetter) : -1
    if (corretaIndex < 0) {
      if (correctLetter) {
        errors.push(`Bloco ${blockIdx + 1}: letra correta "${correctLetter}" não bate com alternativas.`)
        return
      }
      corretaIndex = 0
    }

    ok.push({ enunciado, alternativas, corretaIndex })
  })

  return { ok, errors }
}
