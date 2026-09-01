const {
  SelectionController
} = require('../../integrations/vscode/selection-controller')

function selection(text, options = {}) {
  return {
    isEmpty: !text,
    start: options.start || { line: 0, character: 0 },
    end: options.end || { line: 0, character: text.length }
  }
}

function event(text, options = {}) {
  const selected = selection(text, options)
  return {
    kind: options.kind == null ? 2 : options.kind,
    selections: [selected],
    textEditor: {
      document: {
        uri: { toString: () => options.uri || 'file:///test.py' },
        version: options.version || 1,
        getText: () => text
      }
    }
  }
}

describe('VS Code selection controller', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  test('translates one non-empty mouse selection after it settles', async () => {
    const lookup = jest.fn(async text => ({ sourceText: text }))
    const onResult = jest.fn()
    const controller = new SelectionController({
      lookup,
      getSettings: () => ({
        enabled: true,
        targetLanguage: 'zh-CN',
        selectionDelay: 220,
        maxSelectionChars: 1200,
        includeDictionary: true
      }),
      onResult,
      onError: jest.fn(),
      onClear: jest.fn()
    })

    controller.handleSelectionChange(event('another'))
    expect(lookup).not.toHaveBeenCalled()
    jest.advanceTimersByTime(219)
    expect(lookup).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    await Promise.resolve()
    await Promise.resolve()
    expect(lookup).toHaveBeenCalledWith(
      'another',
      expect.objectContaining({ targetLanguage: 'zh-CN', maxChars: 1200 })
    )
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'another', uri: 'file:///test.py' }),
      { sourceText: 'another' }
    )
  })

  test('does not translate keyboard selections', () => {
    const lookup = jest.fn()
    const controller = new SelectionController({
      lookup,
      getSettings: () => ({ enabled: true }),
      onResult: jest.fn(),
      onError: jest.fn(),
      onClear: jest.fn()
    })
    controller.handleSelectionChange(event('another', { kind: 1 }))
    jest.runAllTimers()
    expect(lookup).not.toHaveBeenCalled()
  })

  test('can opt into keyboard selections for editor accessibility', async () => {
    const lookup = jest.fn(async text => ({ sourceText: text }))
    const controller = new SelectionController({
      lookup,
      getSettings: () => ({ enabled: true, selectionDelay: 0 }),
      selectionKinds: [1, 2],
      onResult: jest.fn(),
      onError: jest.fn(),
      onClear: jest.fn()
    })
    controller.handleSelectionChange(event('another', { kind: 1 }))
    jest.runAllTimers()
    await Promise.resolve()
    expect(lookup).toHaveBeenCalledWith('another', expect.any(Object))
  })

  test('only publishes the newest selection result', async () => {
    const pending = []
    const lookup = jest.fn(
      text => new Promise(resolve => pending.push({ text, resolve }))
    )
    const onResult = jest.fn()
    const controller = new SelectionController({
      lookup,
      getSettings: () => ({
        enabled: true,
        selectionDelay: 10,
        maxSelectionChars: 1200,
        targetLanguage: 'zh-CN',
        includeDictionary: true
      }),
      onResult,
      onError: jest.fn(),
      onClear: jest.fn()
    })

    controller.handleSelectionChange(event('first'))
    jest.advanceTimersByTime(10)
    controller.handleSelectionChange(event('second', { version: 2 }))
    jest.advanceTimersByTime(10)
    pending[0].resolve({ sourceText: 'first' })
    pending[1].resolve({ sourceText: 'second' })
    await Promise.resolve()
    await Promise.resolve()
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult.mock.calls[0][1].sourceText).toBe('second')
  })

  test('empty selection cancels pending work and clears the hover state', () => {
    const onClear = jest.fn()
    const lookup = jest.fn()
    const controller = new SelectionController({
      lookup,
      getSettings: () => ({ enabled: true, selectionDelay: 100 }),
      onResult: jest.fn(),
      onError: jest.fn(),
      onClear
    })
    controller.handleSelectionChange(event('pending'))
    controller.handleSelectionChange(event(''))
    jest.runAllTimers()
    expect(lookup).not.toHaveBeenCalled()
    expect(onClear).toHaveBeenCalled()
  })
})
