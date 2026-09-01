'use strict'

const {
  createLookupClient,
  isEnglishDictionaryCandidate,
  normalizeSelectionText
} = require('../shared/translation-core')

const REQUEST_HEADERS = Object.freeze({
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36'
})

const CAIYUN_OFFICIAL_TEST_TOKEN = '3975l6lr5pcbvidl6jl2'
const SOURCE_CACHE_TTL = 12 * 60 * 60 * 1000
const SOURCE_CACHE_LIMIT = 240

function textOf(root, selector) {
  const node = root && root.querySelector(selector)
  return normalizeSelectionText(node ? node.textContent : '')
}

function textsOf(root, selector, limit = 12) {
  if (!root) return []
  return Array.from(root.querySelectorAll(selector))
    .map(node => normalizeSelectionText(node.textContent))
    .filter(Boolean)
    .slice(0, limit)
}

function unique(values, limit = 20) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit)
}

function parseDocument(html) {
  return new DOMParser().parseFromString(String(html || ''), 'text/html')
}

function absoluteUrl(value, origin) {
  const url = String(value || '').trim()
  if (!url) return ''
  try {
    return new URL(url, origin).href
  } catch (_) {
    return ''
  }
}

function findAudio(root, origin) {
  if (!root) return ''
  const candidate = root.querySelector(
    'source[type="audio/mpeg"][src], audio[src], [data-mp3link], [data-src-mp3], [data-pronunciation], [data-rel], [onclick]'
  )
  if (!candidate) return ''
  for (const attr of [
    'src',
    'data-mp3link',
    'data-src-mp3',
    'data-pronunciation',
    'data-rel'
  ]) {
    const value = candidate.getAttribute(attr)
    if (!value) continue
    if (attr === 'data-rel' && origin.includes('youdao.com')) {
      return `https://dict.youdao.com/dictvoice?audio=${value}`
    }
    return absoluteUrl(value, origin)
  }
  const onclick = candidate.getAttribute('onclick') || ''
  const match = onclick.match(
    /((?:https?:)?\/\/[^'"\s)]+\.mp3[^'"\s)]*|\/[^'"\s)]+\.mp3[^'"\s)]*)/
  )
  return match ? absoluteUrl(match[1], origin) : ''
}

function parseBingHtml(html) {
  const doc = parseDocument(html)
  const headword = textOf(doc, '.client_def_hd_hd')
  const phonetics = Array.from(doc.querySelectorAll('.client_def_hd_pn_list'))
    .map(node => ({
      label: textOf(node, '.client_def_hd_pn'),
      audio: findAudio(node, 'https://cn.bing.com')
    }))
    .filter(item => item.label || item.audio)

  const groups = Array.from(
    doc.querySelectorAll('.client_def_container .client_def_bar')
  )
    .slice(0, 3)
    .map(node => ({
      label: textOf(node, '.client_def_title_bar') || '释义',
      entries: unique(
        textsOf(node, '.client_def_list_item, .client_def_list_word_bar', 5)
      )
    }))
    .filter(group => group.entries.length)

  const machineTranslation = textOf(doc, '.client_trans_body .client_sen_cn')
  if (!groups.length && machineTranslation) {
    groups.push({ label: '翻译', entries: [machineTranslation] })
  }

  const forms = unique(textsOf(doc, '.client_word_change_word', 8))
  if (forms.length) groups.push({ label: '词形变化', entries: forms })

  const examples = Array.from(doc.querySelectorAll('.client_sentence_list'))
    .map(node => {
      const english = textOf(node, '.client_sen_en')
      const chinese = textOf(node, '.client_sen_cn')
      return [english, chinese].filter(Boolean).join(' — ')
    })
    .filter(Boolean)
    .slice(0, 3)
  if (examples.length) groups.push({ label: '例句', entries: examples })

  if (!headword && !groups.length) throw new Error('Bing 暂无结果')
  return {
    headword,
    phonetics,
    audio: (phonetics.find(item => item.audio) || {}).audio || '',
    groups
  }
}

function parseYoudaoHtml(html) {
  const doc = parseDocument(html)
  const headword = textOf(doc, '.keyword')
  const phonetics = Array.from(doc.querySelectorAll('.baav .pronounce'))
    .map(node => ({
      label: normalizeSelectionText(node.textContent),
      audio: findAudio(node, 'https://dict.youdao.com')
    }))
    .filter(item => item.label || item.audio)

  const groups = []
  const basic = doc.querySelector('#phrsListTab .trans-container')
  const basicEntries = unique(
    textsOf(basic, 'li, .word-exp, p', 16).length
      ? textsOf(basic, 'li, .word-exp, p', 16)
      : [normalizeSelectionText(basic ? basic.textContent : '')]
  )
  if (basicEntries.length)
    groups.push({ label: '基本释义', entries: basicEntries })

  const collinsEntries = unique(
    textsOf(doc, '#collinsResult .collinsMajorTrans', 5)
  )
  if (collinsEntries.length) {
    groups.push({ label: '柯林斯英汉', entries: collinsEntries })
  }

  const translation = textOf(doc, '#fanyiToggle .trans-container')
  if (!groups.length && translation) {
    groups.push({ label: '翻译', entries: [translation] })
  }

  if (!headword && !groups.length) throw new Error('有道暂无结果')
  return {
    headword,
    phonetics,
    audio: (phonetics.find(item => item.audio) || {}).audio || '',
    groups
  }
}

function parseYoudaoTranslationHtml(html, sourceText) {
  const doc = parseDocument(html)
  const translation = textOf(doc, '#fanyiToggle .trans-container')
  if (!translation) throw new Error('有道翻译暂无结果')
  return machineTranslationResult(sourceText, translation)
}

function machineTranslationResult(sourceText, translatedText) {
  const translation = normalizeSelectionText(translatedText)
  if (!translation) throw new Error('翻译服务暂无结果')
  return {
    headword: normalizeSelectionText(sourceText),
    phonetics: [],
    audio: '',
    isMachineTranslation: true,
    groups: [{ label: '翻译', entries: [translation] }]
  }
}

function mapMachineLanguage(language) {
  const value = String(language || 'zh-CN')
  if (value === 'zh-CN') return 'zh'
  if (value === 'zh-TW') return 'cht'
  if (value === 'ja') return 'jp'
  if (value === 'ko') return 'kor'
  if (value === 'fr') return 'fra'
  if (value === 'es') return 'spa'
  return value
}

function parseBaiduTranslation(data, sourceText) {
  const value = typeof data === 'string' ? JSON.parse(data) : data
  const entries = value && Array.isArray(value.data) ? value.data : []
  const translatedText = entries
    .map(item => normalizeSelectionText(item && item.dst))
    .filter(Boolean)
    .join('\n')
  if (value && (value.errno || value.status !== 0)) {
    throw new Error(value.errmsg || '百度翻译暂时无法连接')
  }
  return machineTranslationResult(sourceText, translatedText)
}

function parseCaiyunTranslation(data, sourceText) {
  const targets = data && Array.isArray(data.target)
    ? data.target
    : data && data.target
    ? [data.target]
    : []
  const translatedText = targets
    .map(item => normalizeSelectionText(item))
    .filter(Boolean)
    .join('\n')
  if (!translatedText) {
    throw new Error((data && data.message) || '彩云小译暂无结果')
  }
  return machineTranslationResult(sourceText, translatedText)
}

function cacheSourceLookups(sources) {
  const cache = new Map()
  const inFlight = new Map()
  return sources.map(source => {
    const lookup = source.lookup.bind(source)
    return Object.assign({}, source, {
      lookup(text, settings) {
        const key = `${source.id}\u0000${settings.targetLanguage}\u0000${text}`
        const cached = cache.get(key)
        if (cached && Date.now() - cached.createdAt < SOURCE_CACHE_TTL) {
          return Promise.resolve(cached.value)
        }
        if (inFlight.has(key)) return inFlight.get(key)
        const request = Promise.resolve(lookup(text, settings))
          .then(value => {
            cache.set(key, { createdAt: Date.now(), value })
            while (cache.size > SOURCE_CACHE_LIMIT) {
              cache.delete(cache.keys().next().value)
            }
            return value
          })
          .finally(() => inFlight.delete(key))
        inFlight.set(key, request)
        return request
      }
    })
  })
}

function parseCambridgeHtml(html) {
  const doc = parseDocument(html)
  const entries = Array.from(doc.querySelectorAll('.entry-body__el')).slice(
    0,
    4
  )
  const headword = textOf(doc, '.headword')
  const phonetics = unique(
    textsOf(doc, '.pron .ipa, .dpron-i .ipa', 6)
  ).map(label => ({ label: `/${label.replace(/^\/+|\/+$/g, '')}/`, audio: '' }))
  const audio = findAudio(doc, 'https://dictionary.cambridge.org')
  if (audio && phonetics.length) phonetics[0].audio = audio

  const groups = []
  for (const entry of entries) {
    const partOfSpeech = textOf(entry, '.posgram, .pos') || '释义'
    const definitions = Array.from(
      entry.querySelectorAll('.sense-body, .dsense')
    )
      .map(sense => {
        const definition = textOf(sense, '.def')
        const translation = textOf(sense, '.trans')
        return [definition, translation].filter(Boolean).join(' — ')
      })
      .filter(Boolean)
      .slice(0, 8)
    if (definitions.length) {
      groups.push({ label: partOfSpeech, entries: unique(definitions, 8) })
    }
  }

  if (!groups.length) {
    const translations = unique(textsOf(doc, '.trans.dtrans, .trans', 12))
    if (translations.length)
      groups.push({ label: '英汉释义', entries: translations })
  }

  if (!headword && !groups.length) throw new Error('剑桥暂无结果')
  return { headword, phonetics, audio, groups }
}

function parseOxfordHtml(html) {
  const doc = parseDocument(html)
  const root = doc.querySelector('#entryContent')
  const headword = textOf(root, '.headword')
  const partOfSpeech = textOf(root, '.top-container .pos, .webtop .pos')
  const phonetics = Array.from(
    root ? root.querySelectorAll('.top-container .phonetics > div') : []
  )
    .map((node, index) => {
      const phon = textOf(node, '.phon')
      const region = index === 0 ? '英' : '美'
      return {
        label: phon ? `${region} ${phon}` : '',
        audio: findAudio(node, 'https://www.oxfordlearnersdictionaries.com')
      }
    })
    .filter(item => item.label || item.audio)

  const definitions = Array.from(
    root ? root.querySelectorAll('.entry .sense') : []
  )
    .map(sense => {
      const definition = textOf(sense, '.def')
      const example = textOf(sense, '.examples .x, .x')
      return [definition, example ? `例：${example}` : '']
        .filter(Boolean)
        .join(' · ')
    })
    .filter(Boolean)
    .slice(0, 8)

  if (!headword && !definitions.length) throw new Error('牛津暂无结果')
  return {
    headword,
    phonetics,
    audio: (phonetics.find(item => item.audio) || {}).audio || '',
    groups: definitions.length
      ? [{ label: partOfSpeech || '释义', entries: unique(definitions, 8) }]
      : []
  }
}

function parseCollinsHtml(html) {
  const doc = parseDocument(html)
  const headword = textOf(doc, '.orth, .headword, .h2_entry')
  const phonetic = textOf(doc, '.pron, .pronunciation, .pron-info')
  const audio = findAudio(doc, 'https://www.collinsdictionary.com')
  let definitions = unique(
    textsOf(
      doc,
      '.entry.dictionary.cB .def, .entry.cB .def, .sense .definition, .ddef_d',
      8
    ),
    8
  )
  if (!definitions.length) {
    definitions = unique(
      Array.from(
        doc.querySelectorAll('.entry.dictionary.cB .sense, .entry.cB .sense')
      )
        .map(sense => {
          const clone = sense.cloneNode(true)
          clone
            .querySelectorAll(
              '.quote, .example, .type-example, .audio_play_button'
            )
            .forEach(node => node.remove())
          return normalizeSelectionText(clone.textContent)
        })
        .filter(text => text.length > 2 && text.length < 700),
      8
    )
  }
  const examples = unique(
    textsOf(
      doc,
      '.entry.dictionary.cB .quote, .sense .example, .type-example',
      4
    ),
    4
  )
  const groups = []
  if (definitions.length)
    groups.push({ label: 'COBUILD', entries: definitions })
  if (examples.length) groups.push({ label: '例句', entries: examples })
  if (!headword && !groups.length) throw new Error('柯林斯暂无结果')
  return {
    headword,
    phonetics: phonetic ? [{ label: phonetic, audio }] : [],
    audio,
    groups
  }
}

function parseFreeDictionaryJson(data) {
  const entry = Array.isArray(data) ? data[0] : null
  if (!entry) throw new Error('Free Dictionary 暂无结果')
  const phonetics = unique(
    [entry.phonetic]
      .concat((entry.phonetics || []).map(item => item && item.text))
      .filter(Boolean)
  ).map(label => ({ label, audio: '' }))
  const audioItem = (entry.phonetics || []).find(item => item && item.audio)
  const audio = audioItem ? audioItem.audio : ''
  if (audio && phonetics.length) phonetics[0].audio = audio

  const groups = (entry.meanings || [])
    .map(meaning => ({
      label: meaning.partOfSpeech || 'definition',
      entries: unique(
        (meaning.definitions || []).slice(0, 5).map(definition => {
          const parts = [normalizeSelectionText(definition.definition)]
          if (definition.example) {
            parts.push(`例：${normalizeSelectionText(definition.example)}`)
          }
          return parts.filter(Boolean).join(' · ')
        })
      )
    }))
    .filter(group => group.entries.length)
    .slice(0, 5)

  if (!groups.length && !phonetics.length) {
    throw new Error('Free Dictionary 暂无结果')
  }
  return { headword: entry.word || '', phonetics, audio, groups }
}

function parseEtymonlineHtml(html) {
  const doc = parseDocument(html)
  const descriptionNode = doc.querySelector('meta[name="description"]')
  const description = normalizeSelectionText(
    descriptionNode ? descriptionNode.getAttribute('content') : ''
  )
  const headword = textOf(doc, 'h1')
  if (
    !description ||
    /internet's go-to source for quick and reliable accounts/i.test(description)
  ) {
    throw new Error('在线词源词典暂无结果')
  }
  return {
    headword,
    phonetics: [],
    audio: '',
    groups: [{ label: '词源摘要', entries: [description] }]
  }
}

function createRequestFetch(request) {
  return async (url, options = {}) => {
    const response = await request({
      url,
      method: 'GET',
      headers: Object.assign({}, REQUEST_HEADERS, options.headers || {}),
      throw: false
    })
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      async text() {
        return response.text || ''
      },
      async json() {
        if (response.json != null) return response.json
        return JSON.parse(response.text || 'null')
      }
    }
  }
}

function createSaladictSources(options) {
  const request = options.request
  let baiduSessionExpiresAt = 0
  const google = createLookupClient({
    fetchImpl: createRequestFetch(request),
    cacheTtlMs: 12 * 60 * 60 * 1000
  })

  async function requestText(url, requestOptions = {}) {
    const response = await request({
      url,
      method: requestOptions.method || 'GET',
      headers: Object.assign({}, REQUEST_HEADERS, requestOptions.headers || {}),
      body: requestOptions.body,
      throw: false
    })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.text || ''
  }

  async function requestJson(url, requestOptions = {}) {
    const response = await request({
      url,
      method: requestOptions.method || 'GET',
      headers: Object.assign({}, REQUEST_HEADERS, requestOptions.headers || {}),
      body: requestOptions.body,
      throw: false
    })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json != null ? response.json : JSON.parse(response.text)
  }

  const sources = [
    {
      id: 'google',
      title: 'Google 翻译',
      mark: 'G',
      accent: '#4285f4',
      iconAsset: 'google.png',
      preferredHeight: 160,
      sourceUrl: text =>
        `https://translate.google.com/?sl=auto&tl=zh-CN&text=${encodeURIComponent(
          text
        )}`,
      async lookup(text, settings) {
        const result = await google.lookup(text, {
          targetLanguage: settings.targetLanguage,
          maxChars: settings.maxSelectionChars,
          includeDictionary: false
        })
        return {
          headword: text,
          phonetics: [],
          audio: '',
          isMachineTranslation: true,
          groups: [{ label: '翻译', entries: [result.translatedText] }]
        }
      }
    },
    {
      id: 'caiyun',
      title: '彩云小译',
      mark: '彩',
      accent: '#f4b63d',
      preferredHeight: 180,
      translationOnly: true,
      sourceUrl: () => 'https://fanyi.caiyunapp.com/',
      async lookup(text, settings) {
        const target = mapMachineLanguage(settings.targetLanguage)
        const data = await requestJson(
          'https://api.interpreter.caiyunai.com/v1/translator',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Authorization': `token ${CAIYUN_OFFICIAL_TEST_TOKEN}`
            },
            body: JSON.stringify({
              source: [text],
              trans_type: `auto2${target}`,
              detect: true
            })
          }
        )
        return parseCaiyunTranslation(data, text)
      }
    },
    {
      id: 'youdaotrans',
      title: '有道翻译',
      mark: '有',
      accent: '#e53e30',
      iconAsset: 'youdao.png',
      preferredHeight: 180,
      translationOnly: true,
      sourceUrl: () => 'https://fanyi.youdao.com/',
      async lookup(text) {
        return parseYoudaoTranslationHtml(
          await requestText(
            `https://dict.youdao.com/w/${encodeURIComponent(text)}`
          ),
          text
        )
      }
    },
    {
      id: 'baidu',
      title: '百度翻译',
      mark: '百',
      accent: '#315efb',
      preferredHeight: 180,
      translationOnly: true,
      sourceUrl: text =>
        `https://fanyi.baidu.com/#auto/zh/${encodeURIComponent(text)}`,
      async lookup(text, settings) {
        const home =
          'https://fanyi.baidu.com/mtpe-individual/multimodal'
        if (Date.now() >= baiduSessionExpiresAt) {
          await requestText(home, {
            headers: {
              Referer: 'https://fanyi.baidu.com/',
              Origin: 'https://fanyi.baidu.com'
            }
          })
          baiduSessionExpiresAt = Date.now() + 30 * 60 * 1000
        }
        const body = new URLSearchParams({
          from: 'auto',
          to: mapMachineLanguage(settings.targetLanguage),
          query: text,
          source: 'txt'
        }).toString()
        const data = await requestText('https://fanyi.baidu.com/transapi', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            Origin: 'https://fanyi.baidu.com',
            Referer: home
          },
          body
        })
        return parseBaiduTranslation(data, text)
      }
    },
    {
      id: 'bing',
      title: '必应词典',
      mark: 'B',
      accent: '#008373',
      iconAsset: 'bing.png',
      preferredHeight: 240,
      englishOnly: true,
      sourceUrl: text =>
        `https://cn.bing.com/dict/search?q=${encodeURIComponent(text)}`,
      async lookup(text) {
        const url =
          'https://cn.bing.com/dict/clientsearch?mkt=zh-CN&setLang=zh&form=BDVEHC&ClientVer=BDDTV3.5.1.4320&q=' +
          encodeURIComponent(text)
        return parseBingHtml(await requestText(url))
      }
    },
    {
      id: 'youdao',
      title: '有道词典',
      mark: '有',
      accent: '#e53e30',
      iconAsset: 'youdao.png',
      preferredHeight: 265,
      englishOnly: true,
      sourceUrl: text =>
        `https://dict.youdao.com/w/${encodeURIComponent(text)}`,
      async lookup(text) {
        return parseYoudaoHtml(
          await requestText(
            `https://dict.youdao.com/w/${encodeURIComponent(text)}`
          )
        )
      }
    },
    {
      id: 'cambridge',
      title: '剑桥英汉词典',
      mark: 'C',
      accent: '#f3c300',
      iconAsset: 'cambridge.png',
      preferredHeight: 265,
      englishOnly: true,
      sourceUrl: text =>
        `https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${encodeURIComponent(
          text.trim().replace(/\s+/g, '-')
        )}`,
      async lookup(text) {
        const path = encodeURIComponent(text.trim().replace(/\s+/g, '-'))
        return parseCambridgeHtml(
          await requestText(
            `https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${path}`
          )
        )
      }
    },
    {
      id: 'oaldict',
      title: '牛津高阶学习词典',
      mark: 'O',
      accent: '#18457c',
      iconAsset: 'oaldict.png',
      preferredHeight: 240,
      englishOnly: true,
      sourceUrl: text =>
        `https://www.oxfordlearnersdictionaries.com/search/english/direct/?q=${encodeURIComponent(
          text
        )}`,
      async lookup(text) {
        return parseOxfordHtml(
          await requestText(
            `https://www.oxfordlearnersdictionaries.com/search/english/direct/?q=${encodeURIComponent(
              text.replace(/\s+/g, ' ')
            )}`
          )
        )
      }
    },
    {
      id: 'cobuild',
      title: '柯林斯词典',
      mark: 'C',
      accent: '#df261c',
      iconAsset: 'cobuild.png',
      preferredHeight: 300,
      englishOnly: true,
      sourceUrl: text =>
        `https://www.collinsdictionary.com/dictionary/english/${encodeURIComponent(
          text.replace(/\s+/g, '-')
        )}`,
      async lookup(text) {
        const path = encodeURIComponent(text.replace(/\s+/g, '-'))
        try {
          const localized = parseCollinsHtml(
            await requestText(
              `https://www.collinsdictionary.com/zh/dictionary/english/${path}`
            )
          )
          if (localized.groups.some(group => group.label === 'COBUILD')) {
            return localized
          }
          try {
            const english = parseCollinsHtml(
              await requestText(
                `https://www.collinsdictionary.com/dictionary/english/${path}`
              )
            )
            return english.groups.some(group => group.label === 'COBUILD')
              ? english
              : localized
          } catch (_) {
            return localized
          }
        } catch (_) {
          return parseCollinsHtml(
            await requestText(
              `https://www.collinsdictionary.com/dictionary/english/${path}`
            )
          )
        }
      }
    },
    {
      id: 'etymonline',
      title: '在线词源词典',
      mark: 'E',
      accent: '#a45a3a',
      iconAsset: 'etymonline.png',
      preferredHeight: 265,
      englishOnly: true,
      sourceUrl: text =>
        `https://www.etymonline.com/word/${encodeURIComponent(text)}`,
      async lookup(text) {
        const candidates = [text]
        if (/^[A-Za-z]+s$/.test(text)) candidates.push(text.slice(0, -1))
        let lastError
        for (const candidate of candidates) {
          try {
            return parseEtymonlineHtml(
              await requestText(
                `https://www.etymonline.com/word/${encodeURIComponent(
                  candidate
                )}`
              )
            )
          } catch (error) {
            lastError = error
          }
        }
        throw lastError
      }
    },
    {
      id: 'freeDictionary',
      title: '英英词典',
      mark: 'D',
      accent: '#7c5ce7',
      englishOnly: true,
      sourceUrl: text =>
        `https://dictionaryapi.dev/entries/en/${encodeURIComponent(text)}`,
      async lookup(text) {
        return parseFreeDictionaryJson(
          await requestJson(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
              text.toLowerCase()
            )}`
          )
        )
      }
    }
  ].filter(source =>
    options.enabledSourceIds
      ? options.enabledSourceIds.includes(source.id)
      : true
  )
  return cacheSourceLookups(sources)
}

function applicableSources(sources, text) {
  const lexical = isEnglishDictionaryCandidate(text)
  return sources.filter(source =>
    lexical ? !source.translationOnly : !source.englishOnly
  )
}

module.exports = {
  REQUEST_HEADERS,
  applicableSources,
  createSaladictSources,
  parseBingHtml,
  parseBaiduTranslation,
  parseCaiyunTranslation,
  parseCambridgeHtml,
  parseCollinsHtml,
  parseEtymonlineHtml,
  parseFreeDictionaryJson,
  parseOxfordHtml,
  parseYoudaoHtml,
  parseYoudaoTranslationHtml
}
