import axios from 'axios'
import AxiosMockAdapter from 'axios-mock-adapter'
import { getDefaultConfig } from '@/app-config'
import { getDefaultProfile } from '@/app-config/profiles'
import {
  GOOGLE_MOBILE_TRANSLATE_ENDPOINT,
  getTranslator,
  parseGoogleMobileTranslation,
  search,
  translateWithGoogleMobile
} from '@/components/dictionaries/google/engine'

describe('google translator', () => {
  it('parses the translated text from the mobile page', () => {
    expect(
      parseGoogleMobileTranslation(
        '<div class="result-container">机器学习很有用。&#39;确实&#39;</div>'
      )
    ).toBe("机器学习很有用。'确实'")
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

  it('returns the mobile fallback when the legacy API is blocked', async () => {
    const mock = new AxiosMockAdapter(axios)
    jest
      .spyOn(getTranslator(), 'translate')
      .mockRejectedValueOnce(new Error('legacy Google endpoint blocked'))
    mock
      .onGet(GOOGLE_MOBILE_TRANSLATE_ENDPOINT)
      .reply(200, '<div class="result-container">你好</div>')

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
})
