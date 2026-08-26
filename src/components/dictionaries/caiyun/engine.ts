import { SearchFunction, GetSrcPageFunction } from '../helpers'
import memoizeOne from 'memoize-one'
import { Caiyun } from '@opentranslate/caiyun'
import { Language, TranslateResult } from '@opentranslate/translator'
import {
  MachineTranslateResult,
  MachineTranslatePayload,
  getMTArgs,
  machineResult
} from '@/components/MachineTrans/engine'
import { getTranslator as getBaiduTranslator } from '../baidu/engine'
import { CaiyunLanguage } from './config'
import {
  credentialErrorResult,
  getAxiosCredentialError
} from '../machine-custom'

// Caiyun publishes this token specifically for API evaluation. It is not a
// user credential and availability is not guaranteed. A user-supplied token,
// when present, always takes precedence.
export const CAIYUN_OFFICIAL_TEST_TOKEN = '3975l6lr5pcbvidl6jl2'

export const getTranslator = memoizeOne(
  () =>
    new Caiyun({
      env: 'ext',
      config: process.env.CAIYUN_TOKEN
        ? {
            token: process.env.CAIYUN_TOKEN
          }
        : undefined
    })
)

export const getSrcPage: GetSrcPageFunction = () => {
  return 'https://fanyi.caiyunapp.com/'
}

export type CaiyunResult = MachineTranslateResult<'caiyun'>

export const search: SearchFunction<
  CaiyunResult,
  MachineTranslatePayload<CaiyunLanguage>
> = async (rawText, config, profile, payload) => {
  const translator = getTranslator()
  const langcodes = translator.getSupportLanguages()

  const userCaiYunToken = config.dictAuth.caiyun.token.trim()
  const caiYunToken = userCaiYunToken || CAIYUN_OFFICIAL_TEST_TOKEN

  let { sl, tl, text } = await getMTArgs(
    translator,
    rawText,
    profile.dicts.all.caiyun,
    config,
    payload
  )

  const baiduTranslator = getBaiduTranslator()

  let baiduResult: TranslateResult | undefined

  try {
    // Caiyun's lang detection is broken
    baiduResult = await baiduTranslator.translate(text, sl, tl)
    if (langcodes.includes(baiduResult.from)) {
      sl = baiduResult.from
    }
  } catch (e) {}

  try {
    const result = await translateWithCaiyunFetch(
      translator,
      text,
      sl,
      tl,
      caiYunToken
    )
    result.origin.tts = await baiduTranslator.textToSpeech(
      result.origin.paragraphs.join('\n'),
      result.from
    )
    result.trans.tts = await baiduTranslator.textToSpeech(
      result.trans.paragraphs.join('\n'),
      result.to
    )
    return machineResult(
      {
        result: {
          id: 'caiyun',
          sl: result.from,
          tl: result.to,
          slInitial: profile.dicts.all.caiyun.options.slInitial,
          searchText: result.origin,
          trans: result.trans
        },
        audio: {
          py: result.trans.tts,
          us: result.trans.tts
        }
      },
      langcodes
    )
  } catch (e) {
    console.error('[Saladict][Caiyun] translation failed', e)
    const credentialError = getAxiosCredentialError(e)
    if (userCaiYunToken && credentialError) {
      return credentialErrorResult('caiyun', credentialError, langcodes)
    }
    return machineResult(
      {
        result: {
          id: 'caiyun',
          sl,
          tl,
          slInitial: 'hide',
          searchText: { paragraphs: [''] },
          trans: { paragraphs: [''] }
        }
      },
      translator.getSupportLanguages()
    )
  }
}

type CaiyunWebResponse = {
  target?: string[]
  message?: string
  rc?: number
}

export async function translateWithCaiyunFetch(
  translator: Caiyun,
  text: string,
  sl: Language,
  tl: Language,
  token: string
): Promise<TranslateResult> {
  const source = text.split(/\n+/)
  const response = await fetch(
    'https://api.interpreter.caiyunai.com/v1/translator',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Authorization': `token ${token}`
      },
      body: JSON.stringify({
        source,
        trans_type: `${toCaiyunLanguage(sl)}2${toCaiyunLanguage(tl)}`,
        detect: sl === 'auto'
      })
    }
  )

  if (!response.ok) {
    throw new Error(`Caiyun translation failed: ${response.status}`)
  }

  const data = (await response.json()) as CaiyunWebResponse
  if (!data.target || !data.target.some(Boolean)) {
    throw new Error(data.message || 'Caiyun translation returned no content.')
  }

  const from = sl === 'auto' ? await translator.detect(text) : sl
  return {
    engine: 'caiyun',
    text,
    from,
    to: tl,
    origin: {
      paragraphs: source,
      tts: await translator.textToSpeech(text, from)
    },
    trans: {
      paragraphs: data.target,
      tts: await translator.textToSpeech(data.target.join(' '), tl)
    }
  }
}

function toCaiyunLanguage(lang: Language) {
  const map: Partial<Record<Language, string>> = {
    'zh-CN': 'zh'
  }
  return map[lang] || lang
}
