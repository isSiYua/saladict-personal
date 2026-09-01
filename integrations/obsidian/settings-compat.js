'use strict'

const EDGE_CONFIG_VERSION = 15
const OBSIDIAN_SCHEMA_VERSION = 2
const OBSIDIAN_PROFILE_ID = 'obsidian-portable'
const PORTABLE_SOURCE_IDS = Object.freeze([
  'youdao',
  'bing',
  'google',
  'caiyun',
  'youdaotrans',
  'baidu',
  'oaldict',
  'cambridge',
  'cobuild',
  'etymonline'
])

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value)
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, number))
    : fallback
}

function normalizeSourceIds(value, fallback) {
  if (!Array.isArray(value)) return Array.from(fallback || [])
  return Array.from(
    new Set(value.filter(id => PORTABLE_SOURCE_IDS.includes(id)))
  )
}

function findActiveProfile(storage) {
  if (!isObject(storage)) return null
  if (storage.activeProfileID && isObject(storage[storage.activeProfileID])) {
    return storage[storage.activeProfileID]
  }
  const first = Array.isArray(storage.profileIDList)
    ? storage.profileIDList.find(item => item && isObject(storage[item.id]))
    : null
  return first ? storage[first.id] : null
}

function portableSettings(settings) {
  return {
    automaticSelectionTranslation: Boolean(
      settings.automaticSelectionTranslation
    ),
    autoSpeakOnSelection: Boolean(settings.autoSpeakOnSelection),
    targetLanguage: String(settings.targetLanguage || 'zh-CN'),
    selectionDelay: clampNumber(settings.selectionDelay, 0, 0, 2000),
    maxSelectionChars: clampNumber(
      settings.maxSelectionChars,
      1200,
      20,
      10000
    ),
    includeEnglishDictionary: Boolean(settings.includeEnglishDictionary),
    panelWidth: clampNumber(settings.panelWidth, 450, 250, 1200),
    panelMaxHeightRatio: clampNumber(
      settings.panelMaxHeightRatio,
      80,
      20,
      100
    ),
    fontSize: clampNumber(settings.fontSize, 13, 8, 30),
    darkMode: ['follow', 'light', 'dark'].includes(settings.darkMode)
      ? settings.darkMode
      : 'follow',
    defaultPinned: Boolean(settings.defaultPinned),
    autoHidePanel: Boolean(settings.autoHidePanel),
    pronunciationAccent:
      settings.pronunciationAccent === 'us' ? 'us' : 'uk',
    enabledSourceIds: normalizeSourceIds(
      settings.enabledSourceIds,
      PORTABLE_SOURCE_IDS
    ),
    sourceOrder: normalizeSourceIds(
      settings.sourceOrder,
      PORTABLE_SOURCE_IDS
    )
  }
}

function applyPortableValues(target, values) {
  if (!isObject(values)) return target
  const portable = portableSettings(Object.assign({}, target, values))
  return Object.assign(target, portable)
}

function importSaladictSettings(storage, currentSettings) {
  if (!isObject(storage)) throw new Error('设置文件不是有效的 JSON 对象。')
  const hasEdgeConfig = isObject(storage.baseconfig)
  const hasObsidianConfig = isObject(storage.saladictObsidian)
  if (!hasEdgeConfig && !hasObsidianConfig) {
    throw new Error('没有找到 Saladict 设置。')
  }

  const next = portableSettings(currentSettings)
  const config = hasEdgeConfig ? storage.baseconfig : {}
  if (typeof config.active === 'boolean') {
    next.automaticSelectionTranslation = config.active
  }
  next.panelWidth = clampNumber(
    config.panelWidth,
    next.panelWidth,
    250,
    1200
  )
  next.panelMaxHeightRatio = clampNumber(
    config.panelMaxHeightRatio,
    next.panelMaxHeightRatio,
    20,
    100
  )
  next.fontSize = clampNumber(config.fontSize, next.fontSize, 8, 30)
  if (['follow', 'light', 'dark'].includes(config.darkMode)) {
    next.darkMode = config.darkMode
  }
  if (typeof config.defaultPinned === 'boolean') {
    next.defaultPinned = config.defaultPinned
  }
  if (isObject(config.mode) && typeof config.mode.autoHide === 'boolean') {
    next.autoHidePanel = config.mode.autoHide
  }
  if (
    isObject(config.autopron) &&
    isObject(config.autopron.en) &&
    (config.autopron.en.accent === 'uk' ||
      config.autopron.en.accent === 'us')
  ) {
    next.pronunciationAccent = config.autopron.en.accent
    next.autoSpeakOnSelection = Boolean(config.autopron.en.dict)
  }

  const profile = findActiveProfile(storage)
  if (profile && isObject(profile.dicts)) {
    const selected = normalizeSourceIds(profile.dicts.selected, [])
    if (selected.length) {
      next.enabledSourceIds = selected
      next.sourceOrder = selected
      next.includeEnglishDictionary = selected.some(
        id => id !== 'google'
      )
    }
    const google =
      profile.dicts.all && profile.dicts.all.google
        ? profile.dicts.all.google
        : null
    const target =
      google && google.options && google.options.tl !== 'default'
        ? google.options.tl
        : ''
    if (target) next.targetLanguage = target
  }

  if (hasObsidianConfig && isObject(storage.saladictObsidian.settings)) {
    applyPortableValues(next, storage.saladictObsidian.settings)
  }

  return {
    settings: next,
    edgeConfigStorage: clone(storage)
  }
}

function ensureObject(parent, key) {
  if (!isObject(parent[key])) parent[key] = {}
  return parent[key]
}

function exportSaladictSettings(settings, edgeConfigStorage) {
  const portable = portableSettings(settings)
  const result = isObject(edgeConfigStorage) ? clone(edgeConfigStorage) : {}
  const baseconfig = ensureObject(result, 'baseconfig')
  if (!Number.isFinite(baseconfig.version)) {
    baseconfig.version = EDGE_CONFIG_VERSION
  }
  baseconfig.active = portable.automaticSelectionTranslation
  baseconfig.panelWidth = portable.panelWidth
  baseconfig.panelMaxHeightRatio = portable.panelMaxHeightRatio
  baseconfig.fontSize = portable.fontSize
  baseconfig.darkMode = portable.darkMode
  baseconfig.defaultPinned = portable.defaultPinned
  const mode = ensureObject(baseconfig, 'mode')
  mode.direct = portable.automaticSelectionTranslation
  mode.autoHide = portable.autoHidePanel
  const pinMode = ensureObject(baseconfig, 'pinMode')
  pinMode.direct = true
  const autopron = ensureObject(baseconfig, 'autopron')
  const englishPronunciation = ensureObject(autopron, 'en')
  englishPronunciation.accent = portable.pronunciationAccent
  englishPronunciation.dict = portable.autoSpeakOnSelection
    ? englishPronunciation.dict || 'bing'
    : ''

  let profile = findActiveProfile(result)
  if (!profile) {
    result.activeProfileID = OBSIDIAN_PROFILE_ID
    result.profileIDList = [
      { id: OBSIDIAN_PROFILE_ID, name: 'Obsidian' }
    ]
    profile = {
      version: 3,
      id: OBSIDIAN_PROFILE_ID,
      mtaAutoUnfold: '',
      waveform: true,
      stickyFold: false,
      dicts: { selected: [], all: {} }
    }
    result[OBSIDIAN_PROFILE_ID] = profile
  }
  if (!isObject(profile.dicts)) profile.dicts = { selected: [], all: {} }
  if (!isObject(profile.dicts.all)) profile.dicts.all = {}
  const existingSelected = Array.isArray(profile.dicts.selected)
    ? profile.dicts.selected
    : []
  const enabled = portable.sourceOrder.filter(id =>
    portable.enabledSourceIds.includes(id)
  )
  let portableIndex = 0
  const selected = []
  for (const id of existingSelected) {
    if (!PORTABLE_SOURCE_IDS.includes(id)) {
      selected.push(id)
    } else if (portableIndex < enabled.length) {
      selected.push(enabled[portableIndex])
      portableIndex += 1
    }
  }
  while (portableIndex < enabled.length) {
    selected.push(enabled[portableIndex])
    portableIndex += 1
  }
  profile.dicts.selected = selected
  const google = ensureObject(profile.dicts.all, 'google')
  const googleOptions = ensureObject(google, 'options')
  googleOptions.tl = portable.targetLanguage

  result.saladictObsidian = {
    schemaVersion: OBSIDIAN_SCHEMA_VERSION,
    settings: portable
  }
  return result
}

module.exports = {
  EDGE_CONFIG_VERSION,
  OBSIDIAN_SCHEMA_VERSION,
  PORTABLE_SOURCE_IDS,
  exportSaladictSettings,
  importSaladictSettings,
  portableSettings
}
