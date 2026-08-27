import { ActionHandler } from 'retux'
import { checkSupportedLangs, countWords } from '@/_helpers/lang-check'
import { isPopupPage } from '@/_helpers/saladict'
import { Word } from '@/_helpers/record-manager'
import { State } from '../state'
import { ActionCatalog } from '../action-catalog'

export const searchStart: ActionHandler<
  State,
  ActionCatalog,
  'SEARCH_START'
> = (state, { payload }) => {
  const { activeProfile, config, searchHistory, historyIndex } = state

  let word: Word
  const newSearchHistory: Word[] =
    payload && payload.noHistory
      ? searchHistory
      : searchHistory.slice(0, historyIndex + 1)
  let newHistoryIndex = historyIndex

  if (payload && payload.word) {
    word = payload.word
    const lastWord = searchHistory[historyIndex]

    if (!payload.noHistory && (!lastWord || lastWord.text !== word.text)) {
      newSearchHistory.push(word)
      newHistoryIndex = newSearchHistory.length - 1
    }
  } else {
    word = searchHistory[historyIndex]
  }

  if (!word) {
    if (process.env.DEBUG) {
      console.warn(`SEARCH_START: Empty word on first search`, payload)
    }
    return state
  }

  const useQuotaTranslators = shouldUseQuotaTranslators(word.text)
  const selectedDictsWithDeepL =
    useQuotaTranslators &&
    activeProfile.dicts.all.deepl &&
    !activeProfile.dicts.selected.includes('deepl')
      ? [...activeProfile.dicts.selected, 'deepl' as const]
      : activeProfile.dicts.selected
  const hasDeepLKey = Boolean(config.dictAuth.deepl.authKey.trim())
  const hasGeminiKey = Boolean(config.dictAuth.gemini.apiKey.trim())
  const startWithGemini = useQuotaTranslators && !hasDeepLKey && hasGeminiKey
  // DeepL is sentence-only. Gemini takes its place immediately when DeepL is
  // not configured, and remains its runtime fallback for invalid/quota/network
  // failures. Both stay out of word and short-term lookups.
  const selectedDicts = selectedDictsWithDeepL
    .filter(id => id !== 'gemini' && (useQuotaTranslators || id !== 'deepl'))
    .map(id => (startWithGemini && id === 'deepl' ? ('gemini' as const) : id))

  return {
    ...state,
    text: word.text,
    isShowDictPanel: true,
    isExpandMtaBox:
      activeProfile.mtaAutoUnfold === 'always' ||
      (activeProfile.mtaAutoUnfold === 'popup' && isPopupPage()),
    searchHistory: newSearchHistory,
    historyIndex: newHistoryIndex,
    renderedDicts:
      payload && payload.id
        ? // expand an folded dict item
          state.renderedDicts.map(d =>
            d.id === payload.id
              ? {
                  id: d.id,
                  searchStatus: 'SEARCHING',
                  searchResult: null
                }
              : d
          )
        : selectedDicts
            .filter(id => {
              // dicts that should be rendered
              const dict = activeProfile.dicts.all[id]
              if (id === 'youdao' && !shouldUseYoudaoDictionary(word.text)) {
                return false
              }
              if (checkSupportedLangs(dict.selectionLang, word.text)) {
                const wordCount = countWords(word.text)
                const { min, max } = dict.selectionWC
                return wordCount >= min && wordCount <= max
              }
              return false
            })
            .map(id => {
              // fold or unfold
              return {
                id,
                searchStatus:
                  checkSupportedLangs(
                    activeProfile.dicts.all[id].defaultUnfold,
                    word.text
                  ) &&
                  (!state.activeProfile.stickyFold ||
                    !state.userFoldedDicts[id])
                    ? 'SEARCHING'
                    : 'IDLE',
                searchResult: null
              }
            })
  }
}

/**
 * Reserve limited translation quotas for sentences and longer fragments.
 * English technical tokens and noun phrases (kernel fusion, GPU memory
 * allocation, std::vector<T>) stay with dictionaries and ordinary
 * translators. Chinese technical terms are commonly several characters long,
 * so sentence cues are used instead of length alone.
 */
export function shouldUseQuotaTranslators(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  const hasSentenceEnding = /[.!?。！？]\s*$/.test(trimmed)
  const cjkCharacters = trimmed.match(
    /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g
  )

  if (cjkCharacters) {
    return (
      hasSentenceEnding ||
      (cjkCharacters.length >= 8 && /[的是了在将会把被得]/.test(trimmed))
    )
  }

  // A single whitespace-free token is a word/identifier even when punctuation
  // inside it makes countWords report multiple parts (for example C++ or a.b).
  if (!/\s/.test(trimmed)) return false

  const wordCount = countWords(trimmed)
  const hasFiniteVerbCue = /\b(?:am|is|are|was|were|be|been|being|have|has|had|do|does|did|can|could|will|would|shall|should|may|might|must)\b/i.test(
    trimmed
  )

  return (
    hasSentenceEnding || wordCount >= 6 || (wordCount >= 3 && hasFiniteVerbCue)
  )
}

/**
 * Youdao Dictionary is a lexicon, not the separate Youdao translator. Keep it
 * for words and short established terms, but hide its empty header for
 * sentences and accidentally selected fragments such as "Machine learning (M".
 */
export function shouldUseYoudaoDictionary(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  const lexicalText = trimmed.replace(/[.!?。！？]+$/, '').trim()
  if (!lexicalText) return false

  const cjkCharacters = lexicalText.match(
    /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g
  )
  if (cjkCharacters) {
    return (
      cjkCharacters.length <= 8 &&
      !(cjkCharacters.length >= 6 && /[的是了在将会把被得]/.test(lexicalText))
    )
  }

  if (!/\s/.test(lexicalText)) return true

  return !/[.!?]\s*$/.test(trimmed) && countWords(lexicalText) <= 2
}

export default searchStart
