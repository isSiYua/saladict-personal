import { switchMap, mergeMap, map, share, switchMapTo } from 'rxjs/operators'
import { merge, concat, from, of, EMPTY } from 'rxjs'
import { StoreAction } from '../modules'
import { Epic, ofType } from './utils'
import { isInNotebook } from '@/_helpers/record-manager'
import { message } from '@/_helpers/browser-api'
import { isPDFPage } from '@/_helpers/saladict'
import { DictID } from '@/app-config'
import { MessageResponse } from '@/typings/message'

export const searchStartEpic: Epic = (action$, state$) =>
  action$.pipe(
    ofType('SEARCH_START'),
    switchMap(({ payload }) => {
      const { searchHistory, historyIndex, renderedDicts } = state$.value
      const word = searchHistory[historyIndex]

      const toStart = new Set<DictID>()
      for (const d of renderedDicts) {
        if (d.searchStatus === 'SEARCHING') {
          toStart.add(d.id)
        }
      }

      const searchResults$$ = merge(
        ...[...toStart].map(
          (id): Promise<MessageResponse<'FETCH_DICT_RESULT'>> =>
            message
              .send<'FETCH_DICT_RESULT'>({
                type: 'FETCH_DICT_RESULT',
                payload: {
                  id,
                  text: word.text,
                  payload:
                    payload && payload.payload
                      ? { isPDF: isPDFPage(), ...payload.payload }
                      : { isPDF: isPDFPage() }
                }
              })
              .catch(() => ({ id, result: null }))
        )
      ).pipe(share())

      const playAudio$ =
        payload && payload.id
          ? EMPTY
          : from(
              message
                .send({ type: 'SPEAK_TEXT', payload: { text: word.text } })
                .catch(() => undefined)
            ).pipe(switchMapTo(EMPTY))

      return merge(
        from(isInNotebook(word).catch(() => false)).pipe(
          map(
            (isInNotebook): StoreAction => ({
              type: 'WORD_IN_NOTEBOOK',
              payload: isInNotebook
            })
          )
        ),
        searchResults$$.pipe(
          mergeMap(({ id, result, catalog }) => {
            const resultAction: StoreAction = {
              type: 'SEARCH_END',
              payload: { id, result, catalog }
            }
            const geminiApiKey = state$.value.config.dictAuth.gemini.apiKey.trim()

            if (
              id === 'deepl' &&
              result?.credentialError === 'quota' &&
              geminiApiKey
            ) {
              return concat(
                of<StoreAction>({ type: 'GEMINI_FALLBACK_START' }),
                from(
                  message
                    .send<'FETCH_DICT_RESULT'>({
                      type: 'FETCH_DICT_RESULT',
                      payload: {
                        id: 'gemini',
                        text: word.text,
                        payload:
                          payload && payload.payload
                            ? { isPDF: isPDFPage(), ...payload.payload }
                            : { isPDF: isPDFPage() }
                      }
                    })
                    .catch(
                      (): MessageResponse<'FETCH_DICT_RESULT'> => ({
                        id: 'gemini',
                        result: null
                      })
                    )
                ).pipe(
                  map(
                    ({ result, catalog }): StoreAction => ({
                      type: 'SEARCH_END',
                      payload: { id: 'gemini', result, catalog }
                    })
                  )
                )
              )
            }

            return of(resultAction)
          })
        ),
        playAudio$
      )
    })
  )

export default searchStartEpic
