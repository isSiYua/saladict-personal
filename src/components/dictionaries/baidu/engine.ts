import { SearchFunction, GetSrcPageFunction } from '../helpers'
import memoizeOne from 'memoize-one'
import { Baidu } from '@opentranslate/baidu'
import { Language, TranslateResult } from '@opentranslate/translator'
import qs from 'qs'
import md5 from 'md5'
import {
  MachineTranslateResult,
  MachineTranslatePayload,
  getMTArgs,
  machineResult
} from '@/components/MachineTrans/engine'
import { BaiduLanguage } from './config'
import {
  getAxiosCredentialError,
  credentialErrorResult,
  credentialRequiredResult
} from '../machine-custom'
import { ensureNetworkCompatibility } from './network'

const BAIDU_WEB_HOME = 'https://fanyi.baidu.com/mtpe-individual/multimodal'
const BAIDU_WEB_ENDPOINT = 'https://fanyi.baidu.com/transapi'
let baiduWebSessionExpiresAt = 0

type BaiduWebResponse = {
  status?: number
  errno?: number
  errmsg?: string
  from?: string
  to?: string
  data?: Array<{ src?: string; dst?: string }>
}

export const getTranslator = memoizeOne(
  () =>
    new Baidu({
      env: 'ext',
      config:
        process.env.BAIDU_APPID && process.env.BAIDU_KEY
          ? {
              appid: process.env.BAIDU_APPID,
              key: process.env.BAIDU_KEY
            }
          : undefined
    })
)

export const getSrcPage: GetSrcPageFunction = (text, config, profile) => {
  const lang =
    profile.dicts.all.baidu.options.tl === 'default'
      ? config.langCode === 'zh-CN'
        ? 'zh'
        : config.langCode === 'zh-TW'
        ? 'cht'
        : 'en'
      : profile.dicts.all.baidu.options.tl

  return `https://fanyi.baidu.com/#auto/${lang}/${text}`
}

export type BaiduResult = MachineTranslateResult<'baidu'>

export const search: SearchFunction<
  BaiduResult,
  MachineTranslatePayload<BaiduLanguage>
> = async (rawText, config, profile, payload) => {
  const translator = getTranslator()
  const langcodes = translator.getSupportLanguages()

  const appid = config.dictAuth.baidu.appid.trim()
  const key = config.dictAuth.baidu.key.trim()

  const { sl, tl, text } = await getMTArgs(
    translator,
    rawText,
    profile.dicts.all.baidu,
    config,
    payload
  )

  const translatorConfig = appid && key ? { appid, key } : undefined

  try {
    const result = translatorConfig
      ? await translateWithBaiduApiFetch(
          translator,
          text,
          sl,
          tl,
          translatorConfig
        )
      : await translateWithBaiduWeb(translator, text, sl, tl)
    return machineResult(
      {
        result: {
          id: 'baidu',
          slInitial: profile.dicts.all.baidu.options.slInitial,
          sl: result.from,
          tl: result.to,
          searchText: result.origin,
          trans: result.trans
        },
        audio: {
          py: result.trans.tts,
          us: result.trans.tts
        }
      },
      translator.getSupportLanguages()
    )
  } catch (e) {
    if (process.env.DEBUG) {
      console.warn('[Saladict][Baidu] translation failed', e)
    }
    const credentialError =
      getAxiosCredentialError(e) || getBaiduApiCredentialError(e)
    if (translatorConfig && credentialError) {
      return credentialErrorResult('baidu', credentialError, langcodes)
    }
    if (!translatorConfig && isBaiduWebAccessRejected(e)) {
      return credentialRequiredResult('baidu', langcodes)
    }
    return machineResult(
      {
        result: {
          id: 'baidu',
          slInitial: 'hide',
          sl,
          tl,
          searchText: { paragraphs: [''] },
          trans: { paragraphs: [''] }
        }
      },
      langcodes
    )
  }
}

type BaiduApiResponse = {
  from?: string
  to?: string
  trans_result?: Array<{ src?: string; dst?: string }>
  error_code?: string
  error_msg?: string
}

class BaiduApiError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message || `Baidu API failed: ${code}`)
  }
}

async function translateWithBaiduApiFetch(
  translator: Baidu,
  text: string,
  sl: Language,
  tl: Language,
  config: { appid: string; key: string }
): Promise<TranslateResult> {
  const salt = `${Date.now()}${Math.floor(Math.random() * 100000)}`
  const response = await fetch(
    'https://fanyi-api.baidu.com/api/trans/vip/translate',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: qs.stringify({
        q: text,
        from: openTranslateLanguageToBaiduWeb(sl),
        to: openTranslateLanguageToBaiduWeb(tl),
        appid: config.appid,
        salt,
        sign: md5(`${config.appid}${text}${salt}${config.key}`)
      })
    }
  )

  if (!response.ok) {
    throw new Error(`Baidu API request failed: ${response.status}`)
  }

  const data = (await response.json()) as BaiduApiResponse
  if (data.error_code) {
    throw new BaiduApiError(data.error_code, data.error_msg)
  }
  if (!data.trans_result || !data.trans_result.some(item => item.dst)) {
    throw new Error('Baidu API returned no content.')
  }

  const from = baiduWebLanguageToOpenTranslate(data.from) || sl
  const to = baiduWebLanguageToOpenTranslate(data.to) || tl
  const translatedParagraphs = data.trans_result.map(item => item.dst || '')
  return {
    engine: 'baidu',
    text,
    from,
    to,
    origin: {
      paragraphs: data.trans_result.map(item => item.src || text),
      tts: await translator.textToSpeech(text, from)
    },
    trans: {
      paragraphs: translatedParagraphs,
      tts: await translator.textToSpeech(translatedParagraphs.join(' '), to)
    }
  }
}

function getBaiduApiCredentialError(e: unknown) {
  if (!(e instanceof BaiduApiError)) return undefined
  if (['52003', '54001'].includes(e.code)) return 'invalid' as const
  if (['54003', '54004', '54005'].includes(e.code)) return 'quota' as const
  return undefined
}

function isBaiduWebAccessRejected(e: unknown) {
  return e instanceof Error && /"errno":1022/.test(e.message)
}

export async function translateWithBaiduWeb(
  translator: Baidu,
  text: string,
  sl: Language,
  tl: Language
): Promise<TranslateResult> {
  let response = await requestBaiduWebTranslation(text, sl, tl)

  if (response.errno === 1022) {
    response = await requestBaiduWebTranslation(text, sl, tl, true)
  }

  if (response.status !== 0 || response.errno || !response.data) {
    throw new Error(
      `${response.errmsg || 'Baidu web translation failed.'} (${JSON.stringify({
        status: response.status,
        errno: response.errno,
        from: response.from,
        to: response.to
      })})`
    )
  }

  const sourceParagraphs = response.data.map(item => item.src || text)
  const translatedParagraphs = response.data.map(item => item.dst || '')
  if (!translatedParagraphs.some(Boolean)) {
    throw new Error('Baidu web translation returned no content.')
  }

  const from = baiduWebLanguageToOpenTranslate(response.from) || sl
  const to = baiduWebLanguageToOpenTranslate(response.to) || tl

  return {
    engine: 'baidu',
    text,
    from,
    to,
    origin: {
      paragraphs: sourceParagraphs,
      tts: await translator.textToSpeech(text, from)
    },
    trans: {
      paragraphs: translatedParagraphs,
      tts: await translator.textToSpeech(translatedParagraphs.join(' '), to)
    }
  }
}

async function requestBaiduWebTranslation(
  text: string,
  sl: Language,
  tl: Language,
  forceSession = false
): Promise<BaiduWebResponse> {
  await ensureNetworkCompatibility()

  if (forceSession || Date.now() >= baiduWebSessionExpiresAt) {
    const sessionResponse = await fetch(BAIDU_WEB_HOME, {
      credentials: 'include'
    })
    if (!sessionResponse.ok) {
      throw new Error(`Baidu web session failed: ${sessionResponse.status}`)
    }
    // The warm-up response creates BAIDUID cookies. Refresh the MV3 header
    // rule so the immediately following background request receives them.
    await ensureNetworkCompatibility()
    baiduWebSessionExpiresAt = Date.now() + 30 * 60 * 1000
  }

  const response = await fetch(BAIDU_WEB_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: qs.stringify({
      from: openTranslateLanguageToBaiduWeb(sl),
      to: openTranslateLanguageToBaiduWeb(tl),
      query: text,
      source: 'txt'
    })
  })

  if (!response.ok) {
    throw new Error(`Baidu web translation failed: ${response.status}`)
  }

  return parseBaiduWebResponse(await response.text())
}

export function parseBaiduWebResponse(data: unknown): BaiduWebResponse {
  if (typeof data === 'string') {
    return JSON.parse(data)
  }
  return data as BaiduWebResponse
}

function openTranslateLanguageToBaiduWeb(lang: Language) {
  const map: Partial<Record<Language, string>> = {
    'zh-CN': 'zh',
    'zh-TW': 'cht',
    ja: 'jp',
    ko: 'kor',
    fr: 'fra',
    es: 'spa'
  }
  return map[lang] || lang
}

function baiduWebLanguageToOpenTranslate(lang?: string): Language | undefined {
  if (!lang) return undefined
  const map: { [lang: string]: Language } = {
    zh: 'zh-CN',
    cht: 'zh-TW',
    jp: 'ja',
    kor: 'ko',
    fra: 'fr',
    spa: 'es'
  }
  return map[lang] || (lang as Language)
}
