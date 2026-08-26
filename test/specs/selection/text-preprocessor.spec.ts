import {
  formulaSource,
  getSmartTextFromSelection,
  mainPdfColumn,
  normalizeSelectedText
} from '@/selection/text-preprocessor'

describe('selection text preprocessing', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('joins PDF layout line breaks and hyphenated words', () => {
    expect(
      normalizeSelectedText(
        'We focused on finite-\ndimensional vectors.\nIn the following, we continue.',
        true
      )
    ).toBe(
      'We focused on finite-dimensional vectors. In the following, we continue.'
    )
  })

  it('preserves genuine PDF paragraph boundaries', () => {
    expect(
      normalizeSelectedText('First\nline.\n\nSecond\nparagraph.', true)
    ).toBe('First line.\n\nSecond paragraph.')
  })

  it('uses prose as the main column instead of a wider footer or side caption', () => {
    const main = [
      {
        text: 'The main paragraph begins here.',
        left: 100,
        right: 700,
        top: 100,
        height: 20
      },
      {
        text: 'It continues on the next line.',
        left: 100,
        right: 650,
        top: 125,
        height: 20
      }
    ]
    const filtered = mainPdfColumn([
      ...main,
      { text: 'Figure 3.8 f(x)', left: 740, right: 920, top: 125, height: 18 },
      {
        text: 'Draft feedback: https://example.com',
        left: 30,
        right: 970,
        top: 500,
        height: 15
      }
    ])
    expect(filtered).toEqual(main)
  })

  it('extracts TeX from MathJax and KaTeX metadata', () => {
    document.body.innerHTML =
      '<p id="p">An inner product <span class="katex" data-tex="\\langle u,v\\rangle">rendered</span> is useful.</p>'
    const paragraph = document.getElementById('p')!
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(getSmartTextFromSelection(selection)).toBe(
      'An inner product $\\langle u,v\\rangle$ is useful.'
    )
    expect(formulaSource(paragraph.querySelector('.katex')!)).toBe(
      '\\langle u,v\\rangle'
    )
  })

  it('expands a partial selection to the complete formula boundary', () => {
    document.body.innerHTML =
      '<p><span class="katex" data-tex="x^2 + y^2">partial rendering</span></p>'
    const formulaText = document.querySelector('.katex')!.firstChild!
    const range = document.createRange()
    range.setStart(formulaText, 2)
    range.setEnd(formulaText, 7)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(getSmartTextFromSelection(selection)).toBe('$x^2 + y^2$')
  })
})
