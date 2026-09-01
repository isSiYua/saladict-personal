'use strict'

function isEligibleSelectionTarget(target) {
  if (!target || typeof target.closest !== 'function') return false
  if (target.closest('.saladict-obsidian-panel')) return false
  if (target.closest('input, textarea, select, [contenteditable="true"]')) {
    return Boolean(target.closest('.markdown-source-view, .cm-editor'))
  }
  return Boolean(
    target.closest(
      '.markdown-source-view, .markdown-preview-view, .markdown-reading-view, .cm-editor'
    )
  )
}

function findMarkdownViewForTarget(workspace, target) {
  if (
    !workspace ||
    typeof workspace.iterateAllLeaves !== 'function' ||
    !target
  ) {
    return null
  }

  let matchedView = null
  workspace.iterateAllLeaves(leaf => {
    if (matchedView) return
    const view = leaf && leaf.view
    if (
      !view ||
      typeof view.getViewType !== 'function' ||
      view.getViewType() !== 'markdown' ||
      !view.containerEl ||
      typeof view.containerEl.contains !== 'function'
    ) {
      return
    }
    if (view.containerEl.contains(target)) matchedView = view
  })
  return matchedView
}

function computePanelPosition(options) {
  const margin = options.margin == null ? 12 : options.margin
  const offset = options.offset == null ? 14 : options.offset
  const width = Math.max(0, options.panelWidth || 0)
  const height = Math.max(0, options.panelHeight || 0)
  const viewportWidth = Math.max(0, options.viewportWidth || 0)
  const viewportHeight = Math.max(0, options.viewportHeight || 0)

  let left = (options.x || 0) + offset
  let top = (options.y || 0) + offset
  if (top + height + margin > viewportHeight) {
    top = (options.y || 0) - height - offset
  }
  left = Math.max(margin, Math.min(left, viewportWidth - width - margin))
  top = Math.max(margin, Math.min(top, viewportHeight - height - margin))
  return { left, top }
}

function computeAnchoredPanelLayout(options) {
  const margin = options.margin == null ? 12 : options.margin
  const offset = options.offset == null ? 14 : options.offset
  const minHeight = options.minHeight == null ? 150 : options.minHeight
  const width = Math.max(0, options.panelWidth || 0)
  const height = Math.max(0, options.panelHeight || 0)
  const viewportWidth = Math.max(0, options.viewportWidth || 0)
  const viewportHeight = Math.max(0, options.viewportHeight || 0)
  const x = Number.isFinite(options.x) ? options.x : 0
  const y = Number.isFinite(options.y) ? options.y : 0
  const viewportMaxHeight = Math.max(0, viewportHeight - margin * 2)
  const preferredMaxHeight = Math.min(
    viewportMaxHeight,
    Math.max(minHeight, options.preferredMaxHeight || viewportMaxHeight)
  )

  const spaceBelow = Math.max(0, viewportHeight - y - offset - margin)
  const spaceAbove = Math.max(0, y - offset - margin)
  const placeBelow = spaceBelow >= spaceAbove
  const selectedSpace = placeBelow ? spaceBelow : spaceAbove
  const maxHeight = Math.min(
    viewportMaxHeight,
    Math.max(Math.min(minHeight, viewportMaxHeight), selectedSpace),
    preferredMaxHeight
  )
  const renderedHeight = Math.min(height, maxHeight)

  const spaceRight = Math.max(0, viewportWidth - x - offset - margin)
  const spaceLeft = Math.max(0, x - offset - margin)
  const placeRight = spaceRight >= width || spaceRight >= spaceLeft
  const desiredLeft = placeRight ? x + offset : x - offset - width
  const desiredTop = placeBelow ? y + offset : y - offset - renderedHeight
  const point = clampPanelPosition({
    left: desiredLeft,
    top: desiredTop,
    panelWidth: width,
    panelHeight: renderedHeight,
    viewportWidth,
    viewportHeight,
    margin
  })

  return {
    left: point.left,
    top: point.top,
    maxHeight,
    verticalPlacement: placeBelow ? 'below' : 'above',
    horizontalPlacement: placeRight ? 'right' : 'left'
  }
}

function clampPanelPosition(options) {
  const margin = options.margin == null ? 8 : options.margin
  const width = Math.max(0, options.panelWidth || 0)
  const height = Math.max(0, options.panelHeight || 0)
  const viewportWidth = Math.max(0, options.viewportWidth || 0)
  const viewportHeight = Math.max(0, options.viewportHeight || 0)
  return {
    left: Math.max(
      margin,
      Math.min(options.left || 0, viewportWidth - width - margin)
    ),
    top: Math.max(
      margin,
      Math.min(options.top || 0, viewportHeight - height - margin)
    )
  }
}

function shouldPreviewFold(contentHeight, preferredHeight, tolerance = 8) {
  return (
    Number.isFinite(contentHeight) &&
    Number.isFinite(preferredHeight) &&
    contentHeight > preferredHeight + tolerance
  )
}

function shouldUpdatePanelAnchor(isPinned, manualPosition) {
  return !isPinned || !manualPosition
}

module.exports = {
  clampPanelPosition,
  computeAnchoredPanelLayout,
  computePanelPosition,
  findMarkdownViewForTarget,
  isEligibleSelectionTarget,
  shouldUpdatePanelAnchor,
  shouldPreviewFold
}
