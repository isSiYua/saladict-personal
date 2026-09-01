const {
  clampPanelPosition,
  computeAnchoredPanelLayout,
  computePanelPosition,
  findMarkdownViewForTarget,
  isEligibleSelectionTarget,
  shouldUpdatePanelAnchor,
  shouldPreviewFold
} = require('../../integrations/obsidian/dom-utils')

describe('Obsidian popup DOM helpers', () => {
  test('accepts editor and reading-view selections but not plugin UI', () => {
    document.body.innerHTML = `
      <div class="markdown-source-view"><span id="source">word</span></div>
      <div class="markdown-preview-view"><span id="preview">word</span></div>
      <div class="saladict-obsidian-panel"><span id="panel">word</span></div>
      <div><span id="sidebar">word</span></div>
    `
    expect(isEligibleSelectionTarget(document.querySelector('#source'))).toBe(
      true
    )
    expect(isEligibleSelectionTarget(document.querySelector('#preview'))).toBe(
      true
    )
    expect(isEligibleSelectionTarget(document.querySelector('#panel'))).toBe(
      false
    )
    expect(isEligibleSelectionTarget(document.querySelector('#sidebar'))).toBe(
      false
    )
  })

  test('finds the editor owning a selection while the standalone leaf is active', () => {
    document.body.innerHTML = `
      <div id="standalone"></div>
      <div id="editor"><span id="selection">weights</span></div>
    `
    const selection = document.querySelector('#selection')
    const standaloneView = {
      getViewType: () => 'saladict-standalone-view',
      containerEl: document.querySelector('#standalone')
    }
    const markdownView = {
      getViewType: () => 'markdown',
      containerEl: document.querySelector('#editor'),
      editor: { getSelection: () => 'weights' }
    }
    const workspace = {
      iterateAllLeaves(callback) {
        callback({ view: standaloneView })
        callback({ view: markdownView })
      }
    }

    expect(findMarkdownViewForTarget(workspace, selection)).toBe(markdownView)
    expect(
      findMarkdownViewForTarget(workspace, document.body)
    ).toBeNull()
  })

  test('places the popup above the pointer at the bottom edge', () => {
    expect(
      computePanelPosition({
        x: 850,
        y: 760,
        panelWidth: 400,
        panelHeight: 300,
        viewportWidth: 900,
        viewportHeight: 800
      })
    ).toEqual({ left: 488, top: 446 })
  })

  test('clamps the popup inside the top-left viewport margin', () => {
    expect(
      computePanelPosition({
        x: -50,
        y: -50,
        panelWidth: 300,
        panelHeight: 200,
        viewportWidth: 900,
        viewportHeight: 800
      })
    ).toEqual({ left: 12, top: 12 })
  })

  test('keeps a dragged popup fully inside the viewport', () => {
    expect(
      clampPanelPosition({
        left: 840,
        top: 730,
        panelWidth: 360,
        panelHeight: 280,
        viewportWidth: 1000,
        viewportHeight: 800
      })
    ).toEqual({ left: 632, top: 512 })
  })

  test('updates selection anchors except for a manually positioned pinned popup', () => {
    expect(shouldUpdatePanelAnchor(false, false)).toBe(true)
    expect(shouldUpdatePanelAnchor(false, true)).toBe(true)
    expect(shouldUpdatePanelAnchor(true, false)).toBe(true)
    expect(shouldUpdatePanelAnchor(true, true)).toBe(false)
  })

  test('anchors a tall popup below a selection in the upper half', () => {
    expect(
      computeAnchoredPanelLayout({
        x: 120,
        y: 110,
        panelWidth: 400,
        panelHeight: 700,
        preferredMaxHeight: 640,
        viewportWidth: 1000,
        viewportHeight: 800
      })
    ).toEqual({
      left: 134,
      top: 124,
      maxHeight: 640,
      verticalPlacement: 'below',
      horizontalPlacement: 'right'
    })
  })

  test('anchors the same popup above a distant lower selection', () => {
    expect(
      computeAnchoredPanelLayout({
        x: 860,
        y: 690,
        panelWidth: 400,
        panelHeight: 700,
        preferredMaxHeight: 640,
        viewportWidth: 1000,
        viewportHeight: 800
      })
    ).toEqual({
      left: 446,
      top: 36,
      maxHeight: 640,
      verticalPlacement: 'above',
      horizontalPlacement: 'left'
    })
  })

  test('folds only content that exceeds its preferred preview height', () => {
    expect(shouldPreviewFold(274, 265)).toBe(true)
    expect(shouldPreviewFold(273, 265)).toBe(false)
    expect(shouldPreviewFold(120, 265)).toBe(false)
  })
})
