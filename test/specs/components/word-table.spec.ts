import { getSimpleTranslation } from '@/components/WordPage/WordTable'

describe('notebook translation display', () => {
  it('shows one concise preferred translation from legacy multi-engine text', () => {
    const oldText = [
      '[:: google ::]',
      '谷歌结果',
      '',
      '[:: deepl ::]',
      'DeepL 结果',
      '---------------',
      ''
    ].join('\n')

    expect(getSimpleTranslation(oldText)).toBe('DeepL 结果')
  })

  it('keeps a new plain notebook translation unchanged', () => {
    expect(getSimpleTranslation('第一行\n第二行')).toBe('第一行\n第二行')
  })
})
