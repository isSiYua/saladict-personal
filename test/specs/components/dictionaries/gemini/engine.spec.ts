import AxiosMockAdapter from 'axios-mock-adapter'
import axios from 'axios'
import { getDefaultConfig } from '@/app-config'
import { getDefaultProfile } from '@/app-config/profiles'
import {
  GEMINI_FREE_API_ENDPOINT,
  buildGeminiPayload,
  parseGeminiTranslatedText,
  search
} from '@/components/dictionaries/gemini/engine'

describe('gemini free translator', () => {
  it('builds a translation-only request and parses multipart text', () => {
    const payload = buildGeminiPayload({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN'
    })

    expect(payload.contents[0].parts[0].text).toContain(
      'Translate from en to zh-CN:\nhello'
    )
    expect(payload.systemInstruction.parts[0].text).toContain(
      'Return only the translated text'
    )
    expect(
      parseGeminiTranslatedText({
        candidates: [
          { content: { parts: [{ text: '你' }, { text: '好' }] } }
        ]
      })
    ).toBe('你好')
  })

  it('requires an API key without sending a request', async () => {
    const mock = new AxiosMockAdapter(axios)
    const result = await search(
      'hello',
      getDefaultConfig(),
      getDefaultProfile(),
      { isPDF: false, sl: 'en', tl: 'zh-CN' }
    )

    expect(result.result.id).toBe('gemini')
    expect(result.result.credentialError).toBe('missing')
    expect(mock.history.post).toHaveLength(0)
    mock.restore()
  })

  it('translates with the free-tier key in its own Gemini card', async () => {
    const mock = new AxiosMockAdapter(axios)
    mock.onPost(GEMINI_FREE_API_ENDPOINT).reply(200, {
      candidates: [{ content: { parts: [{ text: '你好' }] } }]
    })
    const config = getDefaultConfig()
    ;(config.dictAuth as any).gemini.apiKey = 'gemini-free-key'

    const result = await search('hello', config, getDefaultProfile(), {
      isPDF: false,
      sl: 'en',
      tl: 'zh-CN'
    })

    expect(result.result.id).toBe('gemini')
    expect(result.result.trans.paragraphs).toEqual(['你好'])
    expect(mock.history.post).toHaveLength(1)
    mock.restore()
  })

  it('reports free-tier quota exhaustion without a paid fallback', async () => {
    const mock = new AxiosMockAdapter(axios)
    mock.onPost(GEMINI_FREE_API_ENDPOINT).reply(429, {
      error: { status: 'RESOURCE_EXHAUSTED' }
    })
    const config = getDefaultConfig()
    ;(config.dictAuth as any).gemini.apiKey = 'gemini-free-key'

    const result = await search('hello', config, getDefaultProfile(), {
      isPDF: false,
      sl: 'en',
      tl: 'zh-CN'
    })

    expect(result.result.credentialError).toBe('quota')
    expect(mock.history.post).toHaveLength(1)
    mock.restore()
  })
})
