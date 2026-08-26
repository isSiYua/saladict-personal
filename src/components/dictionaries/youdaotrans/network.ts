import { createCookieHeaderNetworkCompatibility } from '../network-compat'

export const ensureNetworkCompatibility = createCookieHeaderNetworkCompatibility(
  {
    origin: 'https://fanyi.youdao.com',
    originHeader: 'https://fanyi.youdao.com',
    referer: 'https://fanyi.youdao.com/',
    cookieDomain: '.youdao.com',
    topLevelSite: 'https://youdao.com',
    urls: ['https://dict.youdao.com/*', 'https://dict-trans.youdao.com/*'],
    ruleId: 32005,
    ruleRegexFilter: '^https://dict(?:-trans)?\\.youdao\\.com/.*',
    resourceTypes: ['xmlhttprequest'],
    fallbackCookieNames: ['OUTFOX_SEARCH_USER_ID']
  }
)
