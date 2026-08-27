import axios from 'axios'
import AxiosMockAdapter from 'axios-mock-adapter'
import { getDefaultConfig } from '@/app-config'
import { getDefaultProfile } from '@/app-config/profiles'
import {
  GOOGLE_CHROME_TRANSLATE_ENDPOINT,
  GOOGLE_MOBILE_TRANSLATE_ENDPOINT,
  getTranslator,
  isGoogleServiceErrorText,
  parseGoogleChromeTranslation,
  parseGoogleMobileTranslation,
  search,
  translateWithGoogleChrome,
  translateWithGoogleMobile
} from '@/components/dictionaries/google/engine'

const google500ErrorPage = `
  <style>.result-container { display: block; }</style>
  <div id="af-error-page">
    <script>document.getElementById('af-error-page').style.display = 'none'</script>
    <title>Error 500 (Server Error)!!1</title>
    <p>500. That's an error. That's all we know.</p>
  </div>
`

describe('google translator', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('parses the translated text from the mobile page', () => {
    expect(
      parseGoogleMobileTranslation(
        '<div class="result-container">机器学习很有用。&#39;确实&#39;</div>'
      )
    ).toBe("机器学习很有用。'确实'")
  })

  it('rejects the Google 500 page instead of rendering its CSS and scripts', () => {
    expect(isGoogleServiceErrorText(google500ErrorPage)).toBe(true)
    expect(parseGoogleMobileTranslation(google500ErrorPage)).toBe('')
    expect(parseGoogleChromeTranslation(google500ErrorPage)).toBe('')
  })

  it('keeps a legitimate translation that contains a phrase from the error page', () => {
    expect(isGoogleServiceErrorText("That's all we know.")).toBe(false)
    expect(parseGoogleChromeTranslation(["That's all we know."])).toBe(
      "That's all we know."
    )
  })

  it('parses the no-key Chrome translation response', () => {
    expect(parseGoogleChromeTranslation(['机器学习'])).toBe('机器学习')
    expect(parseGoogleChromeTranslation([['第一句'], ['第二句']])).toBe(
      '第一句 第二句'
    )
  })

  it('does not expose detected-language metadata as translation text', () => {
    expect(
      parseGoogleChromeTranslation([
        [
          '对于大多数主题，结构将是这样的：我们将 4 小时课程的大部分时间花在传统的课堂讲座上，最后介绍本周的练习。',
          'en'
        ]
      ])
    ).not.toMatch(/\ben\s*$/)
    expect(
      parseGoogleChromeTranslation([
        ['进入 generative models 与 Variational Autoencoder', 'zh-CN']
      ])
    ).toBe('进入 generative models 与 Variational Autoencoder')
  })

  it('requests the no-key Google Chrome fallback', async () => {
    const mock = new AxiosMockAdapter(axios)
    mock.onGet(GOOGLE_CHROME_TRANSLATE_ENDPOINT).reply(200, ['你好'])

    await expect(
      translateWithGoogleChrome('hello', 'en', 'zh-CN')
    ).resolves.toBe('你好')
    expect(mock.history.get[0].params).toEqual({
      client: 'dict-chrome-ex',
      sl: 'en',
      tl: 'zh-CN',
      q: 'hello'
    })
    mock.restore()
  })

  it('requests the no-key Google mobile fallback', async () => {
    const mock = new AxiosMockAdapter(axios)
    mock
      .onGet(GOOGLE_MOBILE_TRANSLATE_ENDPOINT)
      .reply(200, '<div class="result-container">你好</div>')

    await expect(
      translateWithGoogleMobile('hello', 'en', 'zh-CN')
    ).resolves.toBe('你好')
    expect(mock.history.get[0].params).toEqual({
      sl: 'en',
      tl: 'zh-CN',
      q: 'hello'
    })
    mock.restore()
  })

  it('returns the Chrome fallback when the legacy API is blocked', async () => {
    const mock = new AxiosMockAdapter(axios)
    jest
      .spyOn(getTranslator(), 'translate')
      .mockRejectedValueOnce(new Error('legacy Google endpoint blocked'))
    mock.onGet(GOOGLE_CHROME_TRANSLATE_ENDPOINT).reply(200, ['你好'])

    const result = await search(
      'hello',
      getDefaultConfig(),
      getDefaultProfile(),
      { sl: 'en', tl: 'zh-CN', isPDF: false }
    )

    expect(result.result.id).toBe('google')
    expect(result.result.trans.paragraphs).toEqual(['你好'])
    mock.restore()
  })

  it('falls through an invalid Chrome response to the mobile page', async () => {
    const mock = new AxiosMockAdapter(axios)
    jest
      .spyOn(getTranslator(), 'translate')
      .mockRejectedValueOnce(new Error('legacy Google endpoint blocked'))
    mock.onGet(GOOGLE_CHROME_TRANSLATE_ENDPOINT).reply(200, google500ErrorPage)
    mock
      .onGet(GOOGLE_MOBILE_TRANSLATE_ENDPOINT)
      .reply(200, '<div class="result-container">移动回退</div>')

    const result = await search(
      'hello',
      getDefaultConfig(),
      getDefaultProfile(),
      { sl: 'en', tl: 'zh-CN', isPDF: false }
    )

    expect(result.result.trans.paragraphs).toEqual(['移动回退'])
    expect(mock.history.get.map(request => request.url)).toEqual([
      GOOGLE_CHROME_TRANSLATE_ENDPOINT,
      GOOGLE_MOBILE_TRANSLATE_ENDPOINT
    ])
    mock.restore()
  })

  it('rejects a legacy result that contains the Google service error page', async () => {
    const mock = new AxiosMockAdapter(axios)
    jest.spyOn(getTranslator(), 'translate').mockResolvedValueOnce({
      engine: 'google',
      text: 'hello',
      from: 'en',
      to: 'zh-CN',
      origin: { paragraphs: ['hello'] },
      trans: { paragraphs: [google500ErrorPage] }
    } as any)
    mock.onGet(GOOGLE_CHROME_TRANSLATE_ENDPOINT).reply(200, ['你好'])

    const result = await search(
      'hello',
      getDefaultConfig(),
      getDefaultProfile(),
      { sl: 'en', tl: 'zh-CN', isPDF: false }
    )

    expect(result.result.trans.paragraphs).toEqual(['你好'])
    mock.restore()
  })

  it('reports a network failure when every Google transport returns an error page', async () => {
    const mock = new AxiosMockAdapter(axios)
    jest
      .spyOn(getTranslator(), 'translate')
      .mockRejectedValueOnce(new Error('legacy Google endpoint blocked'))
    mock.onGet(GOOGLE_CHROME_TRANSLATE_ENDPOINT).reply(200, google500ErrorPage)
    mock.onGet(GOOGLE_MOBILE_TRANSLATE_ENDPOINT).reply(200, google500ErrorPage)

    await expect(
      search('hello', getDefaultConfig(), getDefaultProfile(), {
        sl: 'en',
        tl: 'zh-CN',
        isPDF: false
      })
    ).rejects.toThrow('NETWORK_ERROR')
    mock.restore()
  })
})
