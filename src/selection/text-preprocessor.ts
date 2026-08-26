import {
  getSentenceFromSelection,
  getTextFromSelection
} from 'get-selection-more'

const formulaSelector = [
  'math',
  '.MathJax',
  '.MathJax_Display',
  '.katex',
  '[data-math-source]',
  '[data-tex]',
  '[data-latex]'
].join(',')

function closestElement(node: Node): Element | null {
  return (node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement) as Element | null
}

function formulaRoot(node: Node): Element | null {
  return closestElement(node)?.closest(formulaSelector) || null
}

function expandFormulaBoundaries(range: Range): Range {
  const expanded = range.cloneRange()
  const start = formulaRoot(range.startContainer)
  const end = formulaRoot(range.endContainer)
  if (start) expanded.setStartBefore(start)
  if (end) expanded.setEndAfter(end)
  return expanded
}

export function formulaSource(element: Element): string {
  const attrs = [
    'data-math-source',
    'data-math',
    'data-tex',
    'data-latex',
    'alttext',
    'aria-label'
  ]
  for (const attr of attrs) {
    const value = element.getAttribute(attr)
    if (value && value.trim()) return value.trim()
  }

  const annotation = element.querySelector(
    'annotation[encoding="application/x-tex"], annotation[encoding="TeX"]'
  )
  if (annotation?.textContent?.trim()) return annotation.textContent.trim()

  const text = element.textContent?.trim() || ''
  return text
}

function textWithFormulaSources(range: Range): string {
  const fragment = range.cloneContents()
  const formulas = Array.from(fragment.querySelectorAll(formulaSelector))
  for (const formula of formulas) {
    if (formula.parentElement?.closest(formulaSelector)) continue
    const source = formulaSource(formula)
    formula.replaceWith(document.createTextNode(source ? ` $${source}$ ` : ' '))
  }
  return fragment.textContent || ''
}

export function isPdfTextLayer(): boolean {
  return (
    /\/assets\/pdf\/web\/viewer\.html/i.test(location.href) ||
    !!document.querySelector('.pdfViewer .textLayer')
  )
}

export function normalizeSelectedText(text: string, pdf = false): string {
  text = text
    .replace(/[\u00ad\u200b\u2060]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')

  if (!pdf) return text.replace(/[ \t]{2,}/g, ' ').trim()

  const paragraphs = text.split(/\n{2,}/).map(paragraph =>
    paragraph
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n')
      // A printed line-break after a hyphen continues the same word.
      .replace(/([\p{L}])[-‐‑]\n(?=[\p{Ll}])/gu, '$1-')
      // Every other printed line-break is layout, not a sentence boundary.
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )

  return paragraphs.filter(Boolean).join('\n\n')
}

export interface PdfLine {
  text: string
  left: number
  right: number
  top: number
  height: number
}

function selectedTextNodes(
  range: Range
): Array<{ text: string; rect: DOMRect }> {
  const root =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer
  if (!root) return []

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const chunks: Array<{ text: string; rect: DOMRect }> = []
  let node: Node | null =
    root.nodeType === Node.TEXT_NODE ? root : walker.nextNode()

  while (node) {
    try {
      if (range.intersectsNode(node) && node.textContent) {
        const start = node === range.startContainer ? range.startOffset : 0
        const end =
          node === range.endContainer
            ? range.endOffset
            : node.textContent.length
        if (end > start) {
          const part = document.createRange()
          part.setStart(node, start)
          part.setEnd(node, end)
          const rect = part.getBoundingClientRect()
          const text = node.textContent.slice(start, end)
          if (text.trim() && rect.width > 0 && rect.height > 0) {
            chunks.push({ text, rect })
          }
        }
      }
    } catch (_) {
      // Detached text-layer nodes can disappear while PDF.js rerenders a page.
    }
    node = walker.nextNode()
  }
  return chunks
}

function pdfLines(range: Range): PdfLine[] {
  const chunks = selectedTextNodes(range).sort(
    (a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left
  )
  const lines: Array<PdfLine & { chunks: typeof chunks }> = []

  for (const chunk of chunks) {
    const tolerance = Math.max(3, chunk.rect.height * 0.35)
    let line = lines.find(
      item => Math.abs(item.top - chunk.rect.top) <= tolerance
    )
    if (!line) {
      line = {
        text: '',
        left: chunk.rect.left,
        right: chunk.rect.right,
        top: chunk.rect.top,
        height: chunk.rect.height,
        chunks: []
      }
      lines.push(line)
    }
    line.chunks.push(chunk)
    line.left = Math.min(line.left, chunk.rect.left)
    line.right = Math.max(line.right, chunk.rect.right)
    line.height = Math.max(line.height, chunk.rect.height)
  }

  return lines
    .sort((a, b) => a.top - b.top)
    .map(line => ({
      ...line,
      text: line.chunks
        .sort((a, b) => a.rect.left - b.rect.left)
        .map(chunk => chunk.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    }))
}

function isPeripheralPdfLine(line: PdfLine): boolean {
  return (
    /^(figure|fig\.|table|图|表)\s*\d/i.test(line.text) ||
    /(?:draft|copyright|feedback:|https?:\/\/|www\.)/i.test(line.text) ||
    /^\s*\d{1,4}\s*$/.test(line.text)
  )
}

export function mainPdfColumn(lines: PdfLine[]): PdfLine[] {
  if (lines.length < 2) return lines
  const candidates = lines.filter(line => !isPeripheralPdfLine(line))
  const seedLines = candidates.length ? candidates : lines
  const seed = seedLines.reduce((widest, line) =>
    line.right - line.left > widest.right - widest.left ? line : widest
  )
  const margin = Math.max(8, seed.height)
  return lines.filter(line => {
    const overlaps =
      line.right >= seed.left - margin && line.left <= seed.right + margin
    const looksLikePeripheralCaption =
      /^(figure|fig\.|table|图|表)\s*\d/i.test(line.text) &&
      line.right - line.left < (seed.right - seed.left) * 0.55
    const looksLikeFooter =
      /(?:draft|copyright|feedback:|https?:\/\/|www\.)/i.test(line.text) &&
      line.top > seed.top + seed.height * 3
    return overlaps && !looksLikePeripheralCaption && !looksLikeFooter
  })
}

export function getSmartTextFromSelection(selection: Selection | null): string {
  if (!selection || selection.rangeCount <= 0) return ''
  const pdf = isPdfTextLayer()
  const range = expandFormulaBoundaries(selection.getRangeAt(0))

  if (pdf) {
    const lines = mainPdfColumn(pdfLines(range))
    if (lines.length)
      return normalizeSelectedText(lines.map(l => l.text).join('\n'), true)
  }

  const formulaAware = textWithFormulaSources(range)
  return normalizeSelectedText(
    formulaAware || getTextFromSelection(selection),
    pdf
  )
}

export function getSmartSentenceFromSelection(
  selection: Selection | null
): string {
  if (!selection) return ''
  return normalizeSelectedText(
    getSentenceFromSelection(selection),
    isPdfTextLayer()
  )
}
