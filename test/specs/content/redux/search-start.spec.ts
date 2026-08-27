import { getDefaultConfig } from '@/app-config'
import { getDefaultProfile } from '@/app-config/profiles'
import { newWord } from '@/_helpers/record-manager'
import {
  searchStart,
  shouldUseQuotaTranslators,
  shouldUseYoudaoDictionary
} from '@/content/redux/modules/action-handlers/search-start'

describe('search start dictionaries', () => {
  it.each([
    ['tensor', false],
    ['C++', false],
    ['self-attention', false],
    ['kernel fusion', false],
    ['machine learning model', false],
    ['GPU memory allocation', false],
    ['机器学习', false],
    ['This is useful', true],
    ['It works.', true],
    ['这个模型运行得非常快', true]
  ])('classifies quota translation text %s', (text, expected) => {
    expect(shouldUseQuotaTranslators(text)).toBe(expected)
  })

  it.each([
    ['tensor', true],
    ['tensor.', true],
    ['machine learning', true],
    ['机器学习', true],
    ['Machine learning (M', false],
    ['The tensor is stored in memory.', false],
    ['这个模型运行得非常快', false]
  ])('classifies Youdao Dictionary text %s', (text, expected) => {
    expect(shouldUseYoudaoDictionary(text)).toBe(expected)
  })

  it('keeps DeepL visible after importing a profile that did not select it', () => {
    const activeProfile = getDefaultProfile()
    ;(activeProfile.dicts as any).selected = activeProfile.dicts.selected.filter(
      id => id !== 'deepl'
    )
    const state = {
      activeProfile,
      config: getDefaultConfig(),
      searchHistory: [],
      historyIndex: -1,
      userFoldedDicts: {},
      text: '',
      isShowDictPanel: false,
      isExpandMtaBox: false,
      renderedDicts: []
    } as any

    const result = searchStart(state, {
      type: 'SEARCH_START',
      payload: {
        word: newWord({ text: 'A complete sentence for translation.' })
      }
    } as any)

    expect(result.renderedDicts.map(dict => dict.id)).toContain('deepl')
  })

  it('starts Gemini directly when a sentence has no DeepL key but has a Gemini key', () => {
    const activeProfile = getDefaultProfile()
    const config = getDefaultConfig()
    ;(config.dictAuth.deepl as any).authKey = ''
    ;(config.dictAuth.gemini as any).apiKey = 'gemini-free-key'
    const state = {
      activeProfile,
      config,
      searchHistory: [],
      historyIndex: -1,
      userFoldedDicts: {},
      text: '',
      isShowDictPanel: false,
      isExpandMtaBox: false,
      renderedDicts: []
    } as any

    const result = searchStart(state, {
      type: 'SEARCH_START',
      payload: {
        word: newWord({ text: 'A complete sentence for translation.' })
      }
    } as any)

    expect(result.renderedDicts.map(dict => dict.id)).toContain('gemini')
    expect(result.renderedDicts.map(dict => dict.id)).not.toContain('deepl')
  })

  it('keeps DeepL primary when both translator keys are configured', () => {
    const activeProfile = getDefaultProfile()
    const config = getDefaultConfig()
    ;(config.dictAuth.deepl as any).authKey = 'deepl-key:fx'
    ;(config.dictAuth.gemini as any).apiKey = 'gemini-free-key'
    const state = {
      activeProfile,
      config,
      searchHistory: [],
      historyIndex: -1,
      userFoldedDicts: {},
      text: '',
      isShowDictPanel: false,
      isExpandMtaBox: false,
      renderedDicts: []
    } as any

    const result = searchStart(state, {
      type: 'SEARCH_START',
      payload: {
        word: newWord({ text: 'A complete sentence for translation.' })
      }
    } as any)

    expect(result.renderedDicts.map(dict => dict.id)).toContain('deepl')
    expect(result.renderedDicts.map(dict => dict.id)).not.toContain('gemini')
  })

  it('keeps all imported translators and does not show Gemini before fallback', () => {
    const activeProfile = getDefaultProfile()
    ;(activeProfile.dicts as any).selected = [
      'youdao',
      'google',
      'caiyun',
      'youdaotrans',
      'baidu'
    ]
    const state = {
      activeProfile,
      config: getDefaultConfig(),
      searchHistory: [],
      historyIndex: -1,
      userFoldedDicts: {},
      text: '',
      isShowDictPanel: false,
      isExpandMtaBox: false,
      renderedDicts: []
    } as any

    const result = searchStart(state, {
      type: 'SEARCH_START',
      payload: {
        word: newWord({ text: 'A complete sentence for translation.' })
      }
    } as any)

    expect(result.renderedDicts.map(dict => dict.id)).toEqual([
      'google',
      'caiyun',
      'youdaotrans',
      'baidu',
      'deepl'
    ])
    expect(result.renderedDicts.map(dict => dict.id)).not.toContain('gemini')
  })

  it('does not render DeepL or Gemini for a word lookup', () => {
    const activeProfile = getDefaultProfile()
    ;(activeProfile.dicts as any).selected = [
      'youdao',
      'google',
      'caiyun',
      'youdaotrans',
      'deepl',
      'gemini'
    ]
    const state = {
      activeProfile,
      config: getDefaultConfig(),
      searchHistory: [],
      historyIndex: -1,
      userFoldedDicts: {},
      text: '',
      isShowDictPanel: false,
      isExpandMtaBox: false,
      renderedDicts: []
    } as any

    const result = searchStart(state, {
      type: 'SEARCH_START',
      payload: { word: newWord({ text: 'tensor' }) }
    } as any)

    expect(result.renderedDicts.map(dict => dict.id)).toEqual([
      'youdao',
      'google',
      'caiyun',
      'youdaotrans'
    ])
  })
})
