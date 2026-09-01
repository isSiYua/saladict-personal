'use strict'

class SelectionController {
  constructor(options) {
    this.lookup = options.lookup
    this.getSettings = options.getSettings
    this.onResult = options.onResult
    this.onError = options.onError
    this.onClear = options.onClear
    this.setTimer = options.setTimer || setTimeout
    this.clearTimer = options.clearTimer || clearTimeout
    this.mouseSelectionKind =
      options.mouseSelectionKind == null ? 2 : options.mouseSelectionKind
    this.selectionKinds = new Set(
      options.selectionKinds || [this.mouseSelectionKind]
    )
    this.timer = null
    this.abortController = null
    this.generation = 0
  }

  clear() {
    this.generation += 1
    if (this.timer) this.clearTimer(this.timer)
    this.timer = null
    if (this.abortController) this.abortController.abort()
    this.abortController = null
    this.onClear()
  }

  handleSelectionChange(event) {
    const selections = event && event.selections
    if (!selections || selections.length !== 1 || selections[0].isEmpty) {
      this.clear()
      return
    }

    const settings = this.getSettings()
    if (!settings.enabled || !this.selectionKinds.has(event.kind)) return

    const selection = selections[0]
    const document = event.textEditor.document
    const text = document.getText(selection)
    if (!text || !text.trim()) {
      this.clear()
      return
    }

    this.generation += 1
    const generation = this.generation
    if (this.timer) this.clearTimer(this.timer)
    if (this.abortController) this.abortController.abort()
    this.abortController = null

    const snapshot = {
      uri: document.uri.toString(),
      version: document.version,
      selection,
      text
    }

    this.timer = this.setTimer(async () => {
      this.timer = null
      const abortController =
        typeof AbortController === 'function' ? new AbortController() : null
      this.abortController = abortController
      try {
        const result = await this.lookup(text, {
          sourceLanguage: 'auto',
          targetLanguage: settings.targetLanguage,
          maxChars: settings.maxSelectionChars,
          includeDictionary: settings.includeDictionary,
          signal: abortController ? abortController.signal : undefined
        })
        if (generation !== this.generation) return
        this.onResult(snapshot, result)
      } catch (error) {
        if (
          generation !== this.generation ||
          (error && error.name === 'AbortError')
        )
          return
        this.onError(snapshot, error)
      }
    }, Math.max(0, Number(settings.selectionDelay) || 0))
  }

  dispose() {
    this.clear()
  }
}

module.exports = { SelectionController }
