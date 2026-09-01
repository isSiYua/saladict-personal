'use strict'

const vscode = require('vscode')
const childProcess = require('child_process')
const { createLookupClient } = require('../shared/translation-core')
const { SelectionController } = require('./selection-controller')
const { renderErrorMarkdown, renderHoverMarkdown } = require('./hover-renderer')

const FAVORITES_KEY = 'saladict.favorites.v1'
let controller
let activeSpeech

function getSettings() {
  const config = vscode.workspace.getConfiguration('saladict')
  return {
    enabled: config.get('automaticSelectionTranslation', true),
    targetLanguage: config.get('targetLanguage', 'zh-CN'),
    selectionDelay: config.get('selectionDelay', 220),
    maxSelectionChars: config.get('maxSelectionChars', 1200),
    includeDictionary: config.get('includeEnglishDictionary', true)
  }
}

function getFavorites(context) {
  return context.globalState.get(FAVORITES_KEY, [])
}

function isFavorite(context, text) {
  return getFavorites(context).some(item => item.text === text)
}

function sameSelection(editor, snapshot) {
  if (!editor || editor.document.uri.toString() !== snapshot.uri) return false
  if (
    editor.document.version !== snapshot.version ||
    editor.selections.length !== 1
  )
    return false
  const selection = editor.selection
  return (
    selection.start.isEqual(snapshot.selection.start) &&
    selection.end.isEqual(snapshot.selection.end)
  )
}

function createTrustedMarkdown(value) {
  const markdown = new vscode.MarkdownString(value, true)
  markdown.supportThemeIcons = true
  markdown.isTrusted = {
    enabledCommands: ['saladict.speak', 'saladict.toggleFavorite']
  }
  return markdown
}

function speak(text) {
  if (!text || !String(text).trim()) return
  if (activeSpeech && !activeSpeech.killed) activeSpeech.kill()
  const value = String(text).slice(0, 2000)
  if (process.platform === 'darwin') {
    activeSpeech = childProcess.spawn('/usr/bin/say', [value], {
      stdio: 'ignore'
    })
  } else if (process.platform === 'win32') {
    const escaped = value.replace(/'/g, "''")
    activeSpeech = childProcess.spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${escaped}')`
      ],
      { stdio: 'ignore', windowsHide: true }
    )
  } else {
    activeSpeech = childProcess.spawn('spd-say', [value], { stdio: 'ignore' })
  }
  activeSpeech.once('error', () => {
    vscode.window.showWarningMessage(
      'Saladict：当前系统没有可用的语音朗读程序。'
    )
  })
}

function activate(context) {
  const lookupClient = createLookupClient({ fetchImpl: globalThis.fetch })
  const output = vscode.window.createOutputChannel('Saladict')
  let current = null

  controller = new SelectionController({
    lookup: lookupClient.lookup,
    getSettings,
    mouseSelectionKind: vscode.TextEditorSelectionChangeKind.Mouse,
    selectionKinds: [
      vscode.TextEditorSelectionChangeKind.Mouse,
      vscode.TextEditorSelectionChangeKind.Keyboard
    ],
    onClear() {
      current = null
    },
    onResult(snapshot, result) {
      output.appendLine(
        `[lookup] success chars=${
          snapshot.text.length
        } provider=${result.translationProvider || 'dictionary'}`
      )
      current = { snapshot, result, error: null }
      const editor = vscode.window.activeTextEditor
      if (sameSelection(editor, snapshot)) {
        vscode.commands.executeCommand('editor.action.showHover')
      }
    },
    onError(snapshot, error) {
      output.appendLine(
        `[lookup] failed chars=${snapshot.text.length} error=${String(
          (error && error.message) || error
        )}`
      )
      current = { snapshot, result: null, error }
      const editor = vscode.window.activeTextEditor
      if (sameSelection(editor, snapshot)) {
        vscode.commands.executeCommand('editor.action.showHover')
      }
    }
  })

  const selector = [
    { scheme: 'file' },
    { scheme: 'untitled' },
    { scheme: 'vscode-notebook-cell' }
  ]
  context.subscriptions.push(
    output,
    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        if (!current || current.snapshot.uri !== document.uri.toString())
          return undefined
        if (!current.snapshot.selection.contains(position)) return undefined
        const body = current.error
          ? renderErrorMarkdown(current.error)
          : renderHoverMarkdown(current.result, {
              favorite: isFavorite(context, current.result.sourceText)
            })
        return new vscode.Hover(
          createTrustedMarkdown(body),
          current.snapshot.selection
        )
      }
    }),
    vscode.window.onDidChangeTextEditorSelection(event => {
      if (event.selections.length === 1 && !event.selections[0].isEmpty) {
        output.appendLine(
          `[selection] kind=${String(event.kind)} chars=${
            event.textEditor.document.getText(event.selections[0]).length
          }`
        )
      }
      controller.handleSelectionChange(event)
    }),
    vscode.commands.registerCommand('saladict.speak', value => speak(value)),
    vscode.commands.registerCommand('saladict.toggleFavorite', async value => {
      const text = String(value || '').trim()
      if (!text) return
      const favorites = getFavorites(context).slice()
      const index = favorites.findIndex(item => item.text === text)
      if (index >= 0) {
        favorites.splice(index, 1)
      } else {
        const result =
          current && current.result && current.result.sourceText === text
            ? current.result
            : { sourceText: text, translatedText: '', phonetic: '' }
        favorites.unshift({
          text,
          translation: result.translatedText || '',
          phonetic: result.phonetic || '',
          updatedAt: new Date().toISOString()
        })
      }
      await context.globalState.update(FAVORITES_KEY, favorites.slice(0, 1000))
      if (
        current &&
        vscode.window.activeTextEditor &&
        sameSelection(vscode.window.activeTextEditor, current.snapshot)
      ) {
        vscode.commands.executeCommand('editor.action.showHover')
      }
    }),
    vscode.commands.registerCommand('saladict.openFavorites', async () => {
      const favorites = getFavorites(context)
      if (!favorites.length) {
        vscode.window.showInformationMessage('Saladict：还没有收藏词条。')
        return
      }
      const picked = await vscode.window.showQuickPick(
        favorites.map(item => ({
          label: item.text,
          description: item.phonetic || '',
          detail: item.translation || '',
          item
        })),
        {
          placeHolder: 'Saladict 收藏词条（选择后复制）',
          matchOnDescription: true,
          matchOnDetail: true
        }
      )
      if (picked) {
        const output = [picked.item.text, picked.item.translation]
          .filter(Boolean)
          .join('\n')
        await vscode.env.clipboard.writeText(output)
        vscode.window.showInformationMessage(
          `Saladict：已复制 ${picked.item.text}`
        )
      }
    }),
    vscode.commands.registerCommand(
      'saladict.toggleAutomaticTranslation',
      async () => {
        const config = vscode.workspace.getConfiguration('saladict')
        const enabled = config.get('automaticSelectionTranslation', true)
        await config.update(
          'automaticSelectionTranslation',
          !enabled,
          vscode.ConfigurationTarget.Global
        )
        vscode.window.showInformationMessage(
          `Saladict 自动划词翻译已${enabled ? '关闭' : '开启'}。`
        )
      }
    ),
    { dispose: () => controller.dispose() }
  )
}

function deactivate() {
  if (controller) controller.dispose()
  if (activeSpeech && !activeSpeech.killed) activeSpeech.kill()
}

module.exports = { activate, deactivate, getSettings, sameSelection }
