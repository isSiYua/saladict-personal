import { SearchFunction, GetSrcPageFunction } from '../helpers'
import memoizeOne from 'memoize-one'
import { Google } from '@opentranslate/google'
import {
  MachineTranslateResult,
  MachineTranslatePayload,
  getMTArgs,
  machineResult
} from '@/components/MachineTrans/engine'
import { GoogleLanguage } from './config'
import { Language } from '@opentranslate/languages'
import axios from 'axios'
import {
  normalizeMachineLanguage,
  successMachineResult
} from '../machine-custom'

export const GOOGLE_MOBILE_TRANSLATE_ENDPOINT = 'https://translate.google.com/m'

export const getTranslator = memoizeOne(() => new Google({ env: 'ext' }))

export const getSrcPage: GetSrcPageFunction = (text, config, profile) => {
  const domain = 'com'
  const lang =
    profile.dicts.all.google.options.tl === 'default'
      ? config.langCode
      : profile.dicts.all.google.options.tl

  return `https://translate.google.${domain}/#auto/${lang}/${text}`
}

export type GoogleResult = MachineTranslateResult<'google'>

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, value: string) =>
      String.fromCharCode(parseInt(value, 10))
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

export function parseGoogleMobileTranslation(html: string): string {
  const match = /<div[^>]+class=["'][^"']*\bresult-container\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(
    html
  )
  if (!match) return ''

  return decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '')).trim()
}

export async function translateWithGoogleMobile(
  text: string,
  sl: Language,
  tl: Language
): Promise<string> {
  const response = await axios.get<string>(GOOGLE_MOBILE_TRANSLATE_ENDPOINT, {
    params: { sl, tl, q: text },
    responseType: 'text'
  })
  return parseGoogleMobileTranslation(response.data)
}

export const search: SearchFunction<
  GoogleResult,
  MachineTranslatePayload<GoogleLanguage>
> = async (rawText, config, profile, payload) => {
  const options = profile.dicts.all.google.options

  const translator = getTranslator()

  const { sl, tl, text } = await getMTArgs(
    translator,
    rawText,
    profile.dicts.all.google,
    config,
    payload
  )

  try {
    const result = await translator.translate(text, sl, tl, {
      concurrent: options.concurrent,
      apiAsFallback: true,
      order: ['cn', 'com']
    })
    return machineResult(
      {
        result: {
          id: 'google',
          sl: result.from,
          tl: result.to,
          slInitial: profile.dicts.all.google.options.slInitial,
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
    try {
      const translatedText = await translateWithGoogleMobile(text, sl, tl)
      if (translatedText) {
        return successMachineResult({
          id: 'google',
          sl: normalizeMachineLanguage(sl),
          tl: normalizeMachineLanguage(tl),
          slInitial: profile.dicts.all.google.options.slInitial,
          sourceText: text,
          translatedText,
          langcodes: translator.getSupportLanguages()
        })
      }
    } catch (fallbackError) {}

    return machineResult(
      {
        result: {
          id: 'google',
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

export async function getTTS(text: string, lang: Language): Promise<string> {
  return (await getTranslator().textToSpeech(text, lang)) || ''
}
