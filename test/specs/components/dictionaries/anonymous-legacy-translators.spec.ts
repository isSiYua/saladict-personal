import { getDefaultConfig } from '@/app-config'
import { getDefaultProfile } from '@/app-config/profiles'
import {
  CAIYUN_OFFICIAL_TEST_TOKEN,
  search as searchCaiyun
} from '@/components/dictionaries/caiyun/engine'
import {
  parseBaiduWebResponse,
  search as searchBaidu
} from '@/components/dictionaries/baidu/engine'
import {
  getTranslator as getYoudaoTranslator,
  search as searchYoudaoTrans
} from '@/components/dictionaries/youdaotrans/engine'
import { translateWithYoudaoWeb } from '@/components/dictionaries/youdaotrans/web'

jest.mock('@/components/dictionaries/baidu/network', () => ({
  ensureNetworkCompatibility: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/components/dictionaries/youdaotrans/web', () => ({
  translateWithYoudaoWeb: jest.fn()
}))

const translated = (engine: string) => ({
  engine,
  text: 'Machine learning is useful.',
  from: 'en',
  to: 'zh-CN',
  origin: { paragraphs: ['Machine learning is useful.'] },
  trans: { paragraphs: ['机器学习很有用。'] }
})

describe('anonymous legacy translator fallbacks', () => {
  const originalFetch = (global as any).fetch

  afterEach(() => {
    jest.restoreAllMocks()
    ;(global as any).fetch = originalFetch
  })

  it('parses Baidu web responses returned as text', () => {
    expect(
      parseBaiduWebResponse(
        JSON.stringify({ status: 0, data: [{ dst: '机器学习很有用。' }] })
      )
    ).toEqual({ status: 0, data: [{ dst: '机器学习很有用。' }] })
  })

  it('uses the official Caiyun test token when no personal token is set', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        target: ['机器学习很有用。']
      })
    })
    ;(global as any).fetch = fetchMock

    const result = await searchCaiyun(
      'Machine learning is useful.',
      getDefaultConfig(),
      getDefaultProfile(),
      { sl: 'en', tl: 'zh-CN', isPDF: false }
    )

    expect(result.result.trans.paragraphs).toEqual(['机器学习很有用。'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.interpreter.caiyunai.com/v1/translator',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Authorization': `token ${CAIYUN_OFFICIAL_TEST_TOKEN}`
        })
      })
    )
  })

  it('uses Youdao web translation when no developer credentials are set', async () => {
    ;(translateWithYoudaoWeb as jest.Mock).mockResolvedValue(
      translated('youdao')
    )

    const result = await searchYoudaoTrans(
      'Machine learning is useful.',
      getDefaultConfig(),
      getDefaultProfile(),
      { sl: 'en', tl: 'zh-CN', isPDF: false }
    )

    expect(result.result.trans.paragraphs).toEqual(['机器学习很有用。'])
    expect(translateWithYoudaoWeb).toHaveBeenCalledWith(
      getYoudaoTranslator(),
      'Machine learning is useful.',
      'en',
      'zh-CN'
    )
  })

  it('keeps Baidu personal credentials as the preferred path', async () => {
    const config = getDefaultConfig()
    ;(config.dictAuth.baidu as any).appid = 'personal-appid'
    ;(config.dictAuth.baidu as any).key = 'personal-key'
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        from: 'en',
        to: 'zh',
        trans_result: [
          {
            src: 'Machine learning is useful.',
            dst: '机器学习很有用。'
          }
        ]
      })
    })
    ;(global as any).fetch = fetchMock

    const result = await searchBaidu(
      'Machine learning is useful.',
      config,
      getDefaultProfile(),
      { sl: 'en', tl: 'zh-CN', isPDF: false }
    )

    expect(result.result.trans.paragraphs).toEqual(['机器学习很有用。'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://fanyi-api.baidu.com/api/trans/vip/translate',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('appid=personal-appid')
      })
    )
  })
})
