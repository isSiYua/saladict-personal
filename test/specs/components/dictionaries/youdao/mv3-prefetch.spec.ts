import { getDefaultConfig } from '@/app-config'
import { getDefaultProfile, ProfileMutable } from '@/app-config/profiles'
import {
  search,
  YoudaoResultLex
} from '@/components/dictionaries/youdao/engine'

describe('Dict/Youdao/MV3 prefetched page', () => {
  it('parses a dictionary page fetched by the privileged background', async () => {
    const profile = getDefaultProfile() as ProfileMutable
    profile.dicts.all.youdao.options = {
      basic: true,
      collins: false,
      discrimination: false,
      sentence: false,
      translation: false,
      related: false
    }

    const response = await search('field', getDefaultConfig(), profile, {
      isPDF: false,
      prefetchedHtml: `
          <span class="keyword">field</span>
          <div class="baav">
            <span class="pronounce">英 [fiːld]
              <a class="dictvoice" data-rel="field&type=1"></a>
            </span>
            <span class="pronounce">美 [fiːld]
              <a class="dictvoice" data-rel="field&type=2"></a>
            </span>
          </div>
          <div id="phrsListTab">
            <div class="trans-container"><ul><li>n. 领域；字段</li></ul></div>
          </div>
        `
    })

    const result = response.result as YoudaoResultLex
    expect(result.title).toBe('field')
    expect(result.prons).toHaveLength(2)
    expect(result.basic).toContain('领域；字段')
    expect(response.audio?.uk).toContain('field&type=1')
    expect(response.audio?.us).toContain('field&type=2')
  })
})
