import { SearchFunction, GetSrcPageFunction } from '../helpers'
import memoizeOne from 'memoize-one'
import { Youdao } from '@opentranslate/youdao'
import {
  MachineTranslateResult,
  MachineTranslatePayload,
  getMTArgs,
  machineResult
} from '@/components/MachineTrans/engine'
import { YoudaotransLanguage } from './config'
import {
  credentialErrorResult,
  getAxiosCredentialError
} from '../machine-custom'
import { translateWithYoudaoWeb } from './web'

export const getTranslator = memoizeOne(
  () =>
    new Youdao({
      env: 'ext',
      config:
        process.env.YOUDAO_APPKEY && process.env.YOUDAO_KEY
          ? {
              appKey: process.env.YOUDAO_APPKEY,
              key: process.env.YOUDAO_KEY
            }
          : undefined
    })
)

export const getSrcPage: GetSrcPageFunction = (text, config, profile) => {
  return `http://fanyi.youdao.com`
}

export type YoudaotransResult = MachineTranslateResult<'youdaotrans'>

export const search: SearchFunction<
  YoudaotransResult,
  MachineTranslatePayload<YoudaotransLanguage>
> = async (rawText, config, profile, payload) => {
  const translator = getTranslator()
  const langcodes = translator.getSupportLanguages()

  const appKey = config.dictAuth.youdaotrans.appKey.trim()
  const key = config.dictAuth.youdaotrans.key.trim()

  const { sl, tl, text } = await getMTArgs(
    translator,
    rawText,
    profile.dicts.all.youdaotrans,
    config,
    payload
  )

  const translatorConfig = appKey && key ? { appKey, key } : undefined

  try {
    const result = translatorConfig
      ? await translator.translate(text, sl, tl, translatorConfig)
      : await translateWithYoudaoWeb(translator, text, sl, tl)
    return machineResult(
      {
        result: {
          id: 'youdaotrans',
          sl: result.from,
          tl: result.to,
          slInitial: profile.dicts.all.youdaotrans.options.slInitial,
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
    console.error('[Saladict][Youdao Translate] translation failed', e)
    const credentialError = getAxiosCredentialError(e)
    if (translatorConfig && credentialError) {
      return credentialErrorResult('youdaotrans', credentialError, langcodes)
    }
    return machineResult(
      {
        result: {
          id: 'youdaotrans',
          sl,
          tl,
          slInitial: 'hide',
          searchText: { paragraphs: [''] },
          trans: { paragraphs: [''] }
        }
      },
      langcodes
    )
  }
}
