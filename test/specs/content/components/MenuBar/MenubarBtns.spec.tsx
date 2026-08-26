import React from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import {
  SpeakTextBtn,
  SpeechPauseBtn
} from '@/content/components/MenuBar/MenubarBtns'

describe('MenuBar speech controls', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(container)
    })
    container.remove()
  })

  it('keeps play and pause as two independent buttons', () => {
    const speak = jest.fn()
    const togglePause = jest.fn()

    renderControls(false, speak, togglePause)
    const buttons = container.querySelectorAll('button')

    expect(buttons).toHaveLength(2)
    expect(buttons[0].title).toBe('朗读当前单词或句子')
    expect(buttons[1].title).toBe('暂停朗读')

    act(() => buttons[0].click())
    expect(speak).toHaveBeenCalledTimes(1)
    expect(togglePause).not.toHaveBeenCalled()

    act(() => buttons[1].click())
    expect(togglePause).toHaveBeenCalledTimes(1)
    expect(speak).toHaveBeenCalledTimes(1)
  })

  it('changes only the separate pause button to resume state', () => {
    renderControls(true, jest.fn(), jest.fn())
    const buttons = container.querySelectorAll('button')

    expect(buttons[0].title).toBe('朗读当前单词或句子')
    expect(buttons[0].hasAttribute('aria-pressed')).toBe(false)
    expect(buttons[1].title).toBe('继续朗读')
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true')
  })

  function renderControls(
    isPaused: boolean,
    speak: () => void,
    togglePause: () => void
  ) {
    const labels: Record<string, string> = {
      'tip.speakText': '朗读当前单词或句子',
      'tip.pauseSpeech': '暂停朗读',
      'tip.resumeSpeech': '继续朗读'
    }
    const t = ((key: string) => labels[key]) as any

    act(() => {
      ReactDOM.render(
        <>
          <SpeakTextBtn t={t} onClick={speak} />
          <SpeechPauseBtn t={t} isPaused={isPaused} onClick={togglePause} />
        </>,
        container
      )
    })
  }
})
