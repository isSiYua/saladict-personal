import { Language, TranslateResult } from '@opentranslate/translator'
import { Youdao } from '@opentranslate/youdao'
import md5 from 'md5'
import qs from 'qs'
import { ensureNetworkCompatibility } from './network'

type YoudaoWebKeyResponse = {
  code: number
  msg?: string
  data?: {
    secretKey: string
    aesKey: string
    aesIv: string
  }
}

type YoudaoWebTranslateResponse = {
  code: number
  type?: string
  translateResult?: Array<Array<{ src?: string; tgt?: string }>>
}

const YOUDAO_KEY_ENDPOINT = 'https://dict.youdao.com/webtranslate/key'
const YOUDAO_TRANSLATE_ENDPOINT = 'https://dict.youdao.com/webtranslate'
const YOUDAO_WEB_CLIENT = 'fanyideskweb'
const YOUDAO_WEB_PRODUCT = 'webfanyi'
// Public web-client bootstrap value used by fanyi.youdao.com to request a
// short-lived per-session key. It is not a developer account credential.
const YOUDAO_WEB_BOOTSTRAP_KEY = 'asdjnjfenknafdfsdfsd'

export async function translateWithYoudaoWeb(
  translator: Youdao,
  text: string,
  sl: Language,
  tl: Language
): Promise<TranslateResult> {
  await ensureNetworkCompatibility()
  const keyResponse = await getYoudaoWebKey()
  if (keyResponse.code !== 0 || !keyResponse.data) {
    throw new Error(
      `Youdao failed to issue a web key: ${keyResponse.msg || keyResponse.code}`
    )
  }

  const { secretKey, aesKey, aesIv } = keyResponse.data
  const mysticTime = String(Date.now())
  const common = buildCommonParams(
    mysticTime,
    md5(
      `client=${YOUDAO_WEB_CLIENT}&mysticTime=${mysticTime}&product=${YOUDAO_WEB_PRODUCT}&key=${secretKey}`
    )
  )

  const response = await fetch(YOUDAO_TRANSLATE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: qs.stringify({
      ...common,
      i: text,
      from: toYoudaoLanguage(sl),
      to: toYoudaoLanguage(tl),
      useTerm: false,
      dictResult: true,
      keyid: 'webfanyi',
      noCheckPrivate: false
    })
  })

  if (!response.ok) {
    throw new Error(`Youdao web translation failed: ${response.status}`)
  }

  const raw = normalizeTextResponse(await response.text())
  const decoded = await decryptYoudaoWebPayload(raw, aesKey, aesIv)
  const data = JSON.parse(decoded) as YoudaoWebTranslateResponse
  if (data.code !== 0 || !data.translateResult) {
    throw new Error(`Youdao web translation failed: ${data.code}`)
  }

  const translatedParagraphs = data.translateResult.map(row =>
    row.map(item => (item.tgt || '').trim()).join('')
  )
  if (!translatedParagraphs.some(Boolean)) {
    throw new Error('Youdao web translation returned no content.')
  }

  const responseLanguages = parseYoudaoResponseLanguages(data.type)
  const from = responseLanguages.from || sl
  const to = responseLanguages.to || tl

  return {
    engine: 'youdao',
    text,
    from,
    to,
    origin: {
      paragraphs: text.split(/\n+/),
      tts: (await translator.textToSpeech(text, from)) || undefined
    },
    trans: {
      paragraphs: translatedParagraphs,
      tts:
        (await translator.textToSpeech(translatedParagraphs.join('\n'), to)) ||
        undefined
    }
  }
}

async function getYoudaoWebKey(): Promise<YoudaoWebKeyResponse> {
  const mysticTime = String(Date.now())
  const sign = md5(
    `client=${YOUDAO_WEB_CLIENT}&mysticTime=${mysticTime}&product=${YOUDAO_WEB_PRODUCT}&key=${YOUDAO_WEB_BOOTSTRAP_KEY}`
  )
  const params = qs.stringify({
    keyid: 'webfanyi-key-getter',
    ...buildCommonParams(mysticTime, sign)
  })
  const response = await fetch(`${YOUDAO_KEY_ENDPOINT}?${params}`, {
    credentials: 'include'
  })

  if (!response.ok) {
    throw new Error(`Youdao web key request failed: ${response.status}`)
  }

  const raw = await response.text()
  return JSON.parse(raw)
}

function buildCommonParams(mysticTime: string, sign: string) {
  return {
    client: YOUDAO_WEB_CLIENT,
    product: YOUDAO_WEB_PRODUCT,
    appVersion: '1.0.0',
    vendor: 'web',
    pointParam: 'client,mysticTime,product',
    mysticTime,
    keyfrom: 'fanyi.web',
    sign
  }
}

export async function decryptYoudaoWebPayload(
  payload: string,
  aesKey: string,
  aesIv: string
) {
  const cryptoApi = getCrypto()
  const key = await cryptoApi.subtle.importKey(
    'raw',
    hexToBytes(md5(aesKey)),
    'AES-CBC',
    false,
    ['decrypt']
  )
  const decrypted = await cryptoApi.subtle.decrypt(
    {
      name: 'AES-CBC',
      iv: hexToBytes(md5(aesIv))
    },
    key,
    base64UrlToBytes(payload)
  )
  return new TextDecoder().decode(decrypted)
}

function getCrypto(): Crypto {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return crypto
  }
  throw new Error('Web Crypto is unavailable for Youdao translation.')
}

function base64UrlToBytes(value: string) {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(4 * Math.ceil(value.length / 4), '=')
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function hexToBytes(value: string) {
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = parseInt(value.slice(index, index + 2), 16)
  }
  return bytes
}

function normalizeTextResponse(value: unknown) {
  return typeof value === 'string' ? value : String(value || '')
}

function toYoudaoLanguage(lang: Language) {
  const map: Partial<Record<Language, string>> = {
    'zh-CN': 'zh-CHS',
    'zh-TW': 'zh-CHT'
  }
  return map[lang] || lang
}

function parseYoudaoResponseLanguages(type?: string) {
  if (!type) return {} as { from?: Language; to?: Language }
  const [from, to] = type.split('2')
  return {
    from: fromYoudaoLanguage(from),
    to: fromYoudaoLanguage(to)
  }
}

function fromYoudaoLanguage(lang?: string): Language | undefined {
  if (!lang) return undefined
  const normalized = lang.toLowerCase()
  if (normalized === 'zh-chs' || normalized === 'zh_cn') return 'zh-CN'
  if (normalized === 'zh-cht' || normalized === 'zh_tw') return 'zh-TW'
  return normalized as Language
}
