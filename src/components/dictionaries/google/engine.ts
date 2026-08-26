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
export const GOOGLE_CHROME_TRANSLATE_ENDPOINT =
  'https://clients5.google.com/translate_a/t'

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

const googleServiceErrorPatterns = [
  /#af-error-page/i,
  /document\.getElementById\(["']af-error-page/i,
  /Error\s*500\s*\(Server Error\)/i,
  /Additional content will be added prior to/i,
  /your computer or network may be sending automated queries/i
]

/** Do not let Google service/error documents become visible translation text. */
export function isGoogleServiceErrorText(text: string): boolean {
  if (googleServiceErrorPatterns.some(pattern => pattern.test(text))) {
    return true
  }

  const hasErrorLead = /(?:\b500\.|That.?s an error|出现错误|服务器错误)/i.test(
    text
  )
  const hasErrorTail = /(?:That.?s all we know|这就是我们所知道的全部信息)/i.test(
    text
  )
  return hasErrorLead && hasErrorTail
}

function getUsableGoogleTranslation(text: unknown): string {
  if (typeof text !== 'string') return ''

  const normalized = text.trim()
  return normalized && !isGoogleServiceErrorText(normalized) ? normalized : ''
}

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
  if (isGoogleServiceErrorText(html)) return ''

  const match = /<div[^>]+class=["'][^"']*\bresult-container\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(
    html
  )
  if (!match) return ''

  return getUsableGoogleTranslation(
    decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ''))
  )
}

export function parseGoogleChromeTranslation(data: unknown): string {
  const parts: string[] = []

  const collectStrings = (value: unknown) => {
    if (typeof value === 'string') {
      parts.push(value)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(collectStrings)
    }
  }

  collectStrings(data)
  return getUsableGoogleTranslation(parts.join(' '))
}

export async function translateWithGoogleChrome(
  text: string,
  sl: Language,
  tl: Language
): Promise<string> {
  const response = await axios.get<unknown>(GOOGLE_CHROME_TRANSLATE_ENDPOINT, {
    params: {
      client: 'dict-chrome-ex',
      sl,
      tl,
      q: text
    }
  })
  return parseGoogleChromeTranslation(response.data)
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

async function translateWithGoogleFallbacks(
  text: string,
  sl: Language,
  tl: Language
): Promise<string> {
  for (const translate of [
    translateWithGoogleChrome,
    translateWithGoogleMobile
  ]) {
    try {
      const translatedText = await translate(text, sl, tl)
      if (translatedText) return translatedText
    } catch (error) {
      // Try the next no-key Google transport.
    }
  }

  throw new Error('NETWORK_ERROR')
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

    const translatedText = getUsableGoogleTranslation(
      result.trans && Array.isArray(result.trans.paragraphs)
        ? result.trans.paragraphs.join('\n')
        : ''
    )
    if (!translatedText) {
      throw new Error('GOOGLE_INVALID_RESPONSE')
    }

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
  } catch (error) {
    const translatedText = await translateWithGoogleFallbacks(text, sl, tl)
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
}

export async function getTTS(text: string, lang: Language): Promise<string> {
  return (await getTranslator().textToSpeech(text, lang)) || ''
}
