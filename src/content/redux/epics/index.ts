import { combineEpics } from 'redux-observable'
import { from, EMPTY } from 'rxjs'
import { map, mapTo, mergeMap, concatMap, pairwise } from 'rxjs/operators'

import {
  saveWord,
  deleteWords,
  getWordsByText
} from '@/_helpers/record-manager'

import { StoreAction, StoreState } from '../modules'
import { ofType } from './utils'

import searchStartEpic from './searchStart.epic'
import newSelectionEpic from './newSelection.epic'
import { translateNotebookText } from '@/_helpers/translateCtx'
import { message } from '@/_helpers/browser-api'
import { restoreMathExpressions } from '@/components/MachineTrans/engine'

const machineTranslatorIds = new Set([
  'deepl',
  'google',
  'caiyun',
  'youdaotrans',
  'baidu',
  'tencent',
  'bingtrans',
  'deeplx',
  'alibaba',
  'niutrans',
  'volc'
])

function currentPanelTranslation(state: StoreState): string {
  const completed = state.renderedDicts.filter(
    dict => dict.searchStatus === 'FINISH' && machineTranslatorIds.has(dict.id)
  )
  completed.sort((a, b) => (a.id === 'deepl' ? -1 : b.id === 'deepl' ? 1 : 0))
  for (const dict of completed) {
    const paragraphs = dict.searchResult?.trans?.paragraphs
    if (Array.isArray(paragraphs) && paragraphs.some(Boolean)) {
      return restoreMathExpressions(paragraphs.join('\n')).trim()
    }
  }
  return ''
}

export const epics = combineEpics<StoreAction, StoreAction, StoreState>(
  /** Start searching text. This will also send to Redux. */
  (action$, state$) =>
    action$.pipe(
      ofType('BOWL_ACTIVATED'),
      map(
        () =>
          state$.value.selection.word
            ? {
                type: 'SEARCH_START',
                payload: { word: state$.value.selection.word }
              }
            : { type: 'SEARCH_START' } // this should never be reached
      )
    ),
  (action$, state$) =>
    action$.pipe(
      ofType('SWITCH_HISTORY'),
      mapTo({ type: 'SEARCH_START', payload: { noHistory: true } })
    ),
  (action$, state$) =>
    state$.pipe(
      map(state => state.isShowDictPanel),
      pairwise(),
      mergeMap(([oldShow, newShow]) => {
        if (oldShow && !newShow) {
          message.send({ type: 'STOP_AUDIO' })
        }
        return EMPTY
      })
    ),
  (action$, state$) =>
    action$.pipe(
      ofType('ADD_TO_NOTEBOOK'),
      // Serialize rapid shortcut presses so add -> remove cannot race.
      concatMap(() => {
        return from(
          (async () => {
            const state = state$.value
            const word = state.searchHistory[state.historyIndex]
            const shouldFavorite = state.isFav
            if (word) {
              try {
                if (shouldFavorite) {
                  const panelTranslation = currentPanelTranslation(state)
                  const trans =
                    panelTranslation ||
                    (await translateNotebookText(word.text, state.config))
                  await saveWord('notebook', { ...word, trans })
                } else {
                  const matches = await getWordsByText('notebook', word.text)
                  if (matches.length > 0) {
                    await deleteWords(
                      'notebook',
                      matches.map(match => match.date)
                    )
                  }
                }
                return null
              } catch (e) {
                console.warn(e)
                return !shouldFavorite
              }
            }
            return !shouldFavorite
          })()
        ).pipe(
          mergeMap(rollbackState =>
            rollbackState == null
              ? EMPTY
              : from([
                  {
                    type: 'WORD_IN_NOTEBOOK',
                    payload: rollbackState
                  } as const
                ])
          )
        )
      })
    ),
  newSelectionEpic,
  searchStartEpic
)

export default epics
