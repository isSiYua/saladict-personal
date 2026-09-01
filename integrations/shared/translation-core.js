'use strict'

const GOOGLE_CHROME_ENDPOINT = 'https://clients5.google.com/translate_a/t'
const GOOGLE_MOBILE_ENDPOINT = 'https://translate.google.com/m'
const FREE_DICTIONARY_ENDPOINT =
  'https://api.dictionaryapi.dev/api/v2/entries/en/'

const googleServiceErrorPatterns = [
  /#af-error-page/i,
  /document\.getElementById\(["']af-error-page/i,
  /Error\s*500\s*\(Server Error\)/i,
  /Additional content will be added prior to/i,
  /your computer or network may be sending automated queries/i
]

class LookupError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'LookupError'
    this.code = code
  }
}

function normalizeSelectionText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isGoogleServiceErrorText(value) {
  const text = String(value || '')
  if (googleServiceErrorPatterns.some(pattern => pattern.test(text)))
    return true

  const hasLead = /(?:\b500\.|That.?s an error|出现错误|服务器错误)/i.test(text)
  const hasTail = /(?:That.?s all we know|这就是我们所知道的全部信息)/i.test(
    text
  )
  return hasLead && hasTail
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function usableTranslation(value) {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  return text && !isGoogleServiceErrorText(text) ? text : ''
}

function parseGoogleChromeTranslation(data) {
  if (!Array.isArray(data)) return ''
  return usableTranslation(
    data
      .map(value => {
        if (typeof value === 'string') return value
        if (Array.isArray(value) && typeof value[0] === 'string')
          return value[0]
        return ''
      })
      .filter(Boolean)
      .join(' ')
  )
}

function parseGoogleMobileTranslation(html) {
  if (isGoogleServiceErrorText(html)) return ''
  const match = /<div[^>]+class=["'][^"']*\bresult-container\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(
    String(html || '')
  )
  if (!match) return ''
  return usableTranslation(decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '')))
}

function parseDictionaryEntries(data) {
  if (!Array.isArray(data) || data.length === 0) return null
  const entry = data[0] || {}
  const phonetics = Array.isArray(entry.phonetics) ? entry.phonetics : []
  const phonetic =
    usableTranslation(entry.phonetic) ||
    phonetics.map(item => usableTranslation(item && item.text)).find(Boolean) ||
    ''
  const audio =
    phonetics
      .map(item =>
        item && typeof item.audio === 'string' ? item.audio.trim() : ''
      )
      .find(Boolean) || ''

  const meanings = []
  for (const meaning of Array.isArray(entry.meanings) ? entry.meanings : []) {
    const definitions = (Array.isArray(meaning.definitions)
      ? meaning.definitions
      : []
    )
      .map(item => usableTranslation(item && item.definition))
      .filter(Boolean)
      .slice(0, 3)
    if (definitions.length) {
      meanings.push({
        partOfSpeech: usableTranslation(meaning.partOfSpeech),
        definitions
      })
    }
    if (meanings.length >= 4) break
  }

  if (!phonetic && !audio && meanings.length === 0) return null
  return { phonetic, audio, meanings }
}

async function ensureResponse(response) {
  if (!response || !response.ok) {
    throw new LookupError(
      'HTTP_ERROR',
      `Translation service returned HTTP ${
        response ? response.status : 'unknown'
      }`
    )
  }
  return response
}

async function translateWithChrome(
  fetchImpl,
  text,
  sourceLanguage,
  targetLanguage,
  signal
) {
  const url = new URL(GOOGLE_CHROME_ENDPOINT)
  url.searchParams.set('client', 'dict-chrome-ex')
  url.searchParams.set('sl', sourceLanguage)
  url.searchParams.set('tl', targetLanguage)
  url.searchParams.set('q', text)
  const response = await ensureResponse(
    await fetchImpl(url.toString(), {
      signal,
      headers: { Accept: 'application/json' }
    })
  )
  const translatedText = parseGoogleChromeTranslation(await response.json())
  if (!translatedText)
    throw new LookupError('INVALID_RESPONSE', 'Invalid Google response')
  return { translatedText, provider: 'Google' }
}

async function translateWithMobile(
  fetchImpl,
  text,
  sourceLanguage,
  targetLanguage,
  signal
) {
  const url = new URL(GOOGLE_MOBILE_ENDPOINT)
  url.searchParams.set('sl', sourceLanguage)
  url.searchParams.set('tl', targetLanguage)
  url.searchParams.set('q', text)
  const response = await ensureResponse(
    await fetchImpl(url.toString(), {
      signal,
      headers: { Accept: 'text/html' }
    })
  )
  const translatedText = parseGoogleMobileTranslation(await response.text())
  if (!translatedText)
    throw new LookupError('INVALID_RESPONSE', 'Invalid Google response')
  return { translatedText, provider: 'Google Mobile' }
}

async function translateWithFallbacks(
  fetchImpl,
  text,
  sourceLanguage,
  targetLanguage,
  signal
) {
  let lastError
  for (const translate of [translateWithChrome, translateWithMobile]) {
    try {
      return await translate(
        fetchImpl,
        text,
        sourceLanguage,
        targetLanguage,
        signal
      )
    } catch (error) {
      if (error && error.name === 'AbortError') throw error
      lastError = error
    }
  }
  throw lastError ||
    new LookupError('NETWORK_ERROR', 'Translation services unavailable')
}

function isEnglishDictionaryCandidate(text) {
  return /^[A-Za-z][A-Za-z'’-]{0,79}$/.test(text)
}

async function lookupEnglishDictionary(fetchImpl, text, signal) {
  if (!isEnglishDictionaryCandidate(text)) return null
  const response = await fetchImpl(
    FREE_DICTIONARY_ENDPOINT + encodeURIComponent(text.toLowerCase()),
    { signal, headers: { Accept: 'application/json' } }
  )
  if (response && response.status === 404) return null
  await ensureResponse(response)
  return parseDictionaryEntries(await response.json())
}

function createLookupClient(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new LookupError('NO_FETCH', 'This host does not provide fetch')
  }

  const now = options.now || Date.now
  const cacheTtlMs = options.cacheTtlMs || 24 * 60 * 60 * 1000
  const maxCacheEntries = options.maxCacheEntries || 300
  const cache = new Map()

  function remember(key, result) {
    cache.delete(key)
    cache.set(key, { result, expiresAt: now() + cacheTtlMs })
    while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value)
  }

  async function lookup(value, lookupOptions = {}) {
    const text = normalizeSelectionText(value)
    const maxChars = Number(lookupOptions.maxChars || 1200)
    if (!text) throw new LookupError('EMPTY_SELECTION', 'No selected text')
    if (text.length > maxChars) {
      throw new LookupError(
        'SELECTION_TOO_LONG',
        `Selection exceeds ${maxChars} characters`
      )
    }

    const sourceLanguage = lookupOptions.sourceLanguage || 'auto'
    const targetLanguage = lookupOptions.targetLanguage || 'zh-CN'
    const includeDictionary = lookupOptions.includeDictionary !== false
    const cacheKey = `${sourceLanguage}\u0000${targetLanguage}\u0000${includeDictionary}\u0000${text}`
    const cached = cache.get(cacheKey)
    if (cached && cached.expiresAt > now()) return cached.result
    if (cached) cache.delete(cacheKey)

    const translationPromise = translateWithFallbacks(
      fetchImpl,
      text,
      sourceLanguage,
      targetLanguage,
      lookupOptions.signal
    )
    const dictionaryPromise = includeDictionary
      ? lookupEnglishDictionary(fetchImpl, text, lookupOptions.signal)
      : Promise.resolve(null)

    const [translationState, dictionaryState] = await Promise.allSettled([
      translationPromise,
      dictionaryPromise
    ])
    const translation =
      translationState.status === 'fulfilled' ? translationState.value : null
    const dictionary =
      dictionaryState.status === 'fulfilled' ? dictionaryState.value : null

    if (!translation && !dictionary) {
      throw translationState.reason ||
        dictionaryState.reason ||
        new LookupError('LOOKUP_FAILED', 'No translation or dictionary result')
    }

    const result = Object.freeze({
      sourceText: text,
      translatedText: translation ? translation.translatedText : '',
      translationProvider: translation ? translation.provider : '',
      translationError:
        translationState.status === 'rejected'
          ? String(translationState.reason.message || '')
          : '',
      phonetic: dictionary ? dictionary.phonetic : '',
      audio: dictionary ? dictionary.audio : '',
      meanings: dictionary ? dictionary.meanings : []
    })
    remember(cacheKey, result)
    return result
  }

  return {
    lookup,
    clearCache() {
      cache.clear()
    },
    get cacheSize() {
      return cache.size
    }
  }
}

module.exports = {
  FREE_DICTIONARY_ENDPOINT,
  GOOGLE_CHROME_ENDPOINT,
  GOOGLE_MOBILE_ENDPOINT,
  LookupError,
  createLookupClient,
  decodeHtmlEntities,
  isEnglishDictionaryCandidate,
  isGoogleServiceErrorText,
  normalizeSelectionText,
  parseDictionaryEntries,
  parseGoogleChromeTranslation,
  parseGoogleMobileTranslation
}
