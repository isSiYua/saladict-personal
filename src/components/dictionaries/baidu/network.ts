import { createCookieHeaderNetworkCompatibility } from '../network-compat'

const BAIDU_WEB_HOME = 'https://fanyi.baidu.com/mtpe-individual/multimodal'

export const ensureNetworkCompatibility = createCookieHeaderNetworkCompatibility(
  {
    origin: 'https://fanyi.baidu.com',
    originHeader: 'https://fanyi.baidu.com',
    referer: BAIDU_WEB_HOME,
    cookieDomain: '.baidu.com',
    cookieOperation: 'set',
    topLevelSite: 'https://baidu.com',
    urls: ['https://fanyi.baidu.com/*'],
    ruleId: 32004,
    ruleRegexFilter: '^https://fanyi\\.baidu\\.com/.*',
    resourceTypes: ['xmlhttprequest'],
    fallbackCookieNames: [
      'BAIDUID',
      'BAIDUID_BFESS',
      'AIT_PERSONAL_VERSION',
      'AIT_ENTERPRISE_VERSION'
    ]
  }
)
