import React, { FC, ReactNode, useMemo } from 'react'
import { Button } from 'antd'
import Table, { ColumnsType, TableProps } from 'antd/lib/table'
import { Word, DBArea } from '@/_helpers/record-manager'
import { message } from '@/_helpers/browser-api'
import { useTranslate } from '@/_helpers/i18n'

export const colSelectionWidth = 48
const colSpeakWidth = 100
const fixedWidth = colSelectionWidth + colSpeakWidth
const colTextWidth = `calc((100vw - ${fixedWidth}px) * 3 / 7)`
const restWidth = `calc((100vw - ${fixedWidth}px) * 4 / 7)`

export interface WordTableProps
  extends Pick<
    TableProps<Word>,
    'dataSource' | 'pagination' | 'rowSelection' | 'onChange' | 'loading'
  > {
  area: DBArea
}

export const WordTable: FC<WordTableProps> = props => {
  const { t, ready } = useTranslate('wordpage')

  const tableColumns = useMemo<ColumnsType<Word>>(
    () => [
      {
        title: t('column.word'),
        dataIndex: 'text',
        key: 'text',
        width: colTextWidth,
        align: 'center',
        sorter: true,
        filters: [
          { text: t('filterWord.chs'), value: 'ch' },
          { text: t('filterWord.eng'), value: 'en' },
          { text: t('filterWord.word'), value: 'word' },
          { text: t('filterWord.phrase'), value: 'phra' }
        ]
      },
      {
        title: t('column.trans'),
        dataIndex: 'trans',
        key: 'trans',
        width: restWidth,
        render: renderTrans
      },
      {
        title: t('column.speak'),
        key: 'speak',
        width: colSpeakWidth,
        align: 'center',
        render: (_, record) => renderSpeak(t('column.speak'), record)
      }
    ],
    [ready, props.area]
  )

  return (
    <Table
      rowKey="date"
      columns={tableColumns}
      bordered={true}
      showHeader={true}
      dataSource={props.dataSource}
      pagination={props.pagination}
      rowSelection={props.rowSelection}
      onChange={props.onChange}
      loading={props.loading}
    />
  )
}

function renderParagraphs(text?: string): ReactNode {
  if (!text) {
    return ''
  }
  return text.split('\n').map((line, i) => <div key={i}>{line}</div>)
}

function renderTrans(_: any, record: Word): ReactNode {
  return renderParagraphs(getSimpleTranslation(record.trans))
}

export function getSimpleTranslation(text = ''): string {
  const translations: { id: string; text: string }[] = []
  const matcher = /\[:: (\w+) ::\]\n([\s\S]+?)(?=\n\n\[:: |\n-{15})/g
  let match: RegExpExecArray | null
  while ((match = matcher.exec(text))) {
    translations.push({ id: match[1], text: match[2].trim() })
  }
  if (!translations.length) return text.replace(/\n-{15}\s*$/g, '').trim()

  const priority = ['deepl', 'google', 'caiyun', 'youdaotrans', 'baidu']
  return (
    priority
      .map(id => translations.find(item => item.id === id))
      .find(Boolean) || translations[0]
  ).text
}

function renderSpeak(label: string, record: Word): ReactNode {
  return (
    <Button
      key={record.date}
      size="small"
      title={label}
      aria-label={label}
      onClick={() =>
        message.send({ type: 'SPEAK_TEXT', payload: { text: record.text } })
      }
    >
      🔊
    </Button>
  )
}
