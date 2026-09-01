const {
  exportSaladictSettings,
  importSaladictSettings
} = require('../../integrations/obsidian/settings-compat')

const currentSettings = {
  automaticSelectionTranslation: true,
  autoSpeakOnSelection: true,
  targetLanguage: 'zh-CN',
  selectionDelay: 0,
  maxSelectionChars: 1200,
  includeEnglishDictionary: true,
  panelWidth: 450,
  panelMaxHeightRatio: 80,
  fontSize: 13,
  darkMode: 'follow',
  defaultPinned: false,
  autoHidePanel: false,
  pronunciationAccent: 'uk',
  enabledSourceIds: ['youdao', 'bing', 'google'],
  sourceOrder: ['youdao', 'bing', 'google']
}

describe('Edge and Obsidian Saladict settings compatibility', () => {
  test('imports portable Edge settings and preserves browser-only fields', () => {
    const edgeExport = {
      baseconfig: {
        version: 15,
        active: true,
        panelWidth: 620,
        panelMaxHeightRatio: 65,
        fontSize: 16,
        darkMode: 'dark',
        defaultPinned: true,
        mode: { direct: true, autoHide: true },
        autopron: { en: { dict: 'bing', accent: 'us' } },
        browserOnlySetting: { keep: 'unchanged' }
      },
      activeProfileID: 'edge-profile',
      profileIDList: [{ id: 'edge-profile', name: 'Edge' }],
      'edge-profile': {
        version: 3,
        id: 'edge-profile',
        dicts: {
          selected: ['cambridge', 'urban', 'google'],
          all: { google: { options: { tl: 'ja' } } }
        }
      }
    }

    const imported = importSaladictSettings(edgeExport, currentSettings)
    expect(imported.settings).toMatchObject({
      panelWidth: 620,
      panelMaxHeightRatio: 65,
      fontSize: 16,
      darkMode: 'dark',
      defaultPinned: true,
      autoHidePanel: true,
      autoSpeakOnSelection: true,
      pronunciationAccent: 'us',
      targetLanguage: 'ja',
      enabledSourceIds: ['cambridge', 'google']
    })

    const exported = exportSaladictSettings(
      imported.settings,
      imported.edgeConfigStorage
    )
    expect(exported.baseconfig.browserOnlySetting).toEqual({
      keep: 'unchanged'
    })
    expect(exported['edge-profile'].dicts.selected).toEqual([
      'cambridge',
      'urban',
      'google'
    ])
    expect(exported.saladictObsidian.schemaVersion).toBe(2)
  })

  test('creates an Edge-importable profile when Obsidian exports first', () => {
    const exported = exportSaladictSettings(
      {
        ...currentSettings,
        panelWidth: 540,
        defaultPinned: true,
        enabledSourceIds: ['youdao', 'google']
      },
      null
    )

    expect(exported.baseconfig).toMatchObject({
      version: 15,
      panelWidth: 540,
      defaultPinned: true,
      mode: { direct: true },
      pinMode: { direct: true },
      autopron: { en: { dict: 'bing', accent: 'uk' } }
    })
    expect(exported.activeProfileID).toBe('obsidian-portable')
    expect(exported.profileIDList).toEqual([
      { id: 'obsidian-portable', name: 'Obsidian' }
    ])
    expect(exported['obsidian-portable'].dicts.selected).toEqual([
      'youdao',
      'google'
    ])

    const roundTrip = importSaladictSettings(exported, currentSettings)
    expect(roundTrip.settings.panelWidth).toBe(540)
    expect(roundTrip.settings.defaultPinned).toBe(true)
    expect(roundTrip.settings.enabledSourceIds).toEqual(['youdao', 'google'])
  })

  test('rejects unrelated JSON instead of replacing settings', () => {
    expect(() => importSaladictSettings({ hello: 'world' }, currentSettings))
      .toThrow('没有找到 Saladict 设置')
  })
})
