import React, { FC } from 'react'
import { useTranslate } from '@/_helpers/i18n'
import { message } from '@/_helpers/browser-api'
import { DictID } from '@/app-config'

import './_style.scss'

export interface DictTitleProps {
  dictID: DictID
  /** Supported languages */
  dictLangs: string
}

const langCodes = ['en', 'zhs', 'zht', 'ja', 'kor', 'fr', 'de', 'es'] as const

const geminiIcon =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse"><stop stop-color="#4285f4"/><stop offset=".5" stop-color="#9b72cb"/><stop offset="1" stop-color="#d96570"/></linearGradient></defs><path fill="url(#g)" d="M16 2c1.3 7.7 6.3 12.7 14 14-7.7 1.3-12.7 6.3-14 14C14.7 22.3 9.7 17.3 2 16 9.7 14.7 14.7 9.7 16 2Z"/></svg>'
  )

function getDictIcon(dictID: DictID): string {
  // Gemini is an added personal translator and has no upstream PNG asset.
  // Keep it explicit so webpack never tries to resolve a missing module.
  return dictID === 'gemini'
    ? geminiIcon
    : require('@/components/dictionaries/' + dictID + '/favicon.png')
}

export const DictTitle: FC<DictTitleProps> = ({ dictID, dictLangs }) => {
  const { t } = useTranslate(['options', 'dicts'])
  const title = t(`dicts:${dictID}.name`)

  return (
    <span className="saladict-dict-title">
      <span>
        <img
          className="saladict-dict-title-icon"
          src={getDictIcon(dictID)}
          alt={`logo ${title}`}
        />
        <a
          className="saladict-dict-title-link"
          href="#"
          onClick={e => {
            e.stopPropagation()
            e.preventDefault()
            openDictSrcPage(dictID, dictLangs)
          }}
        >
          {title}
        </a>
      </span>
      <span>
        {dictLangs.split('').map((c, i) =>
          +c ? (
            <span className="saladict-dict-langs-char" key={langCodes[i]}>
              {t(`dict.lang.${langCodes[i]}`)}
            </span>
          ) : null
        )}
      </span>
    </span>
  )
}

export const DictTitleMemo = React.memo(DictTitle)

function openDictSrcPage(dictID: DictID, dictLangs: string) {
  const text = +dictLangs[0]
    ? 'salad'
    : +dictLangs[1] || +dictLangs[2]
    ? '沙拉'
    : +dictLangs[3]
    ? 'サラダ'
    : +dictLangs[4]
    ? '샐러드'
    : 'salad'

  message.send({
    type: 'OPEN_DICT_SRC_PAGE',
    payload: {
      id: dictID,
      text
    }
  })
}
