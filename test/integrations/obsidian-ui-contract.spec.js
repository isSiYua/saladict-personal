const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('Obsidian Saladict UI contract', () => {
  test('keeps every toolbar button on the Saladict bar background', () => {
    const css = read('integrations/obsidian/styles.css')
    expect(css).toContain(
      '.saladict-menuBar .saladict-menuBar-button {'
    )
    expect(css).toContain('background-color: transparent !important;')
    expect(css).toContain('background-image: none !important;')
    expect(css).toContain(
      'background-color: var(--color-brand) !important;'
    )
  })

  test('provides a detachable window that can return to the note popup', () => {
    const entry = read('integrations/obsidian/main.js')
    const css = read('integrations/obsidian/styles.css')
    expect(entry).toContain("id: 'toggle-standalone-window'")
    expect(entry).toContain('openStandaloneWindow()')
    expect(entry).toContain('restorePanelFromStandalone(options = {})')
    expect(entry).toContain('this.app.workspace.openPopoutLeaf')
    expect(entry).toContain('leaf.setViewState')
    expect(entry).toContain('view.contentEl.appendChild(this.panel)')
    expect(entry).toContain('this.hostDocument.body.appendChild(this.panel)')
    expect(css).toContain(
      '.saladict-standaloneView .saladict-obsidian-panel.isStandalone'
    )
  })

  test('uses an Obsidian-native view so theme and window lifecycle stay native', () => {
    const entry = read('integrations/obsidian/main.js')
    expect(entry).toContain('class SaladictStandaloneView extends ItemView')
    expect(entry).toContain('this.registerView(')
    expect(entry).toContain('handleStandaloneViewClosed(view)')
  })

  test('keeps a pinned popup at its current position across new selections', () => {
    const entry = read('integrations/obsidian/main.js')
    expect(entry).toContain(
      'shouldUpdatePanelAnchor(this.isPinned, this.manualPosition)'
    )
    expect(entry).toContain('this.lookupText(text, { keepPosition: this.isPinned })')
    expect(entry).toContain(
      'if (!options.keepPosition && !this.isPinned) this.manualPosition = false'
    )
    expect(entry).toContain(
      "if (this.isPinned && !this.standaloneLeaf) this.manualPosition = true"
    )
    expect(entry).toContain("this.isPinned ? '取消固定窗口' : '固定窗口'")
  })

  test('re-anchors an unpinned popup to every new selection', () => {
    const entry = read('integrations/obsidian/main.js')
    expect(entry).toContain('computeAnchoredPanelLayout')
    expect(entry).toContain("'--saladict-panel-available-height'")
    expect(entry).toContain('if (this.manualPosition && !options.force) return')
    expect(entry).toContain('if (!options.force && this.currentPoint)')
  })

  test('starts zero-delay selection lookup synchronously', () => {
    const entry = read('integrations/obsidian/main.js')
    expect(entry).toContain('if (delay === 0) startLookup()')
    expect(entry).toContain('selectionDelay: 0')
  })

  test('shows complete sentence translation without preview masking', () => {
    const entry = read('integrations/obsidian/main.js')
    const css = read('integrations/obsidian/styles.css')
    expect(entry).toContain("this.panel.classList.toggle('isTranslationMode'")
    expect(entry).toContain('if (refs.translationMode) {')
    expect(entry).toContain('initiallyFolded: translationMode && index > 0')
    expect(css).toContain(
      '.saladict-dictItem.isMachineTranslation .saladict-headword {'
    )
    expect(css).toContain('font-size: max(9px, calc(var(--saladict-panel-font-size, 13px) - 1px));')
  })

  test('provides Edge-compatible settings import and export controls', () => {
    const entry = read('integrations/obsidian/main.js')
    expect(entry).toContain(
      'chooseSettingsImport(onComplete, ownerDocument = this.hostDocument)'
    )
    expect(entry).toContain(
      'exportSettingsFile(ownerDocument = this.hostDocument)'
    )
    expect(entry).toContain('this.containerEl.ownerDocument')
    expect(entry).toContain("ownerDocument.createElement('input')")
    expect(entry).toContain("input.accept = '.saladict,.json,application/json,text/plain'")
    expect(entry).toContain("button.setButtonText('导出 .saladict')")
  })
})
