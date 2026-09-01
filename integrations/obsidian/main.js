'use strict'

const {
  ItemView,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  requestUrl,
  setIcon
} = require('obsidian')
const {
  isEnglishDictionaryCandidate,
  normalizeSelectionText
} = require('../shared/translation-core')
const {
  applicableSources,
  createSaladictSources
} = require('./saladict-sources')
const {
  clampPanelPosition,
  computeAnchoredPanelLayout,
  findMarkdownViewForTarget,
  isEligibleSelectionTarget,
  shouldUpdatePanelAnchor,
  shouldPreviewFold
} = require('./dom-utils')
const {
  PORTABLE_SOURCE_IDS,
  exportSaladictSettings,
  importSaladictSettings
} = require('./settings-compat')

const SALADICT_STANDALONE_VIEW = 'saladict-standalone-view'
const INTEGRATION_SCHEMA_VERSION = 2
const LONG_TEXT_SOURCE_IDS = Object.freeze([
  'caiyun',
  'youdaotrans',
  'baidu'
])

const DEFAULT_SETTINGS = Object.freeze({
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
  enabledSourceIds: [
    'google',
    'caiyun',
    'youdaotrans',
    'baidu',
    'bing',
    'youdao',
    'oaldict',
    'cambridge',
    'cobuild',
    'etymonline'
  ],
  sourceOrder: [
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
  ]
})

const SOURCE_LABELS = Object.freeze({
  youdao: '有道词典',
  bing: '必应词典',
  google: 'Google 翻译',
  caiyun: '彩云小译',
  youdaotrans: '有道翻译',
  baidu: '百度翻译',
  oaldict: '牛津高阶学习词典',
  cambridge: '剑桥英汉词典',
  cobuild: '柯林斯词典',
  etymonline: '在线词源词典'
})

class FavoritesModal extends Modal {
  constructor(app, plugin) {
    super(app)
    this.plugin = plugin
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('h2', { text: 'Saladict 收藏词条' })
    if (!this.plugin.favorites.length) {
      contentEl.createEl('p', { text: '还没有收藏词条。' })
      return
    }

    const list = contentEl.createDiv({ cls: 'saladict-favorites-list' })
    for (const item of this.plugin.favorites) {
      const row = list.createDiv({ cls: 'saladict-favorite-row' })
      const body = row.createDiv({ cls: 'saladict-favorite-body' })
      body.createEl('strong', { text: item.text })
      if (item.phonetic) body.createEl('span', { text: ` ${item.phonetic}` })
      if (item.translation) body.createEl('div', { text: item.translation })
      const remove = row.createEl('button', { text: '移除' })
      remove.addEventListener('click', async () => {
        await this.plugin.removeFavorite(item.text)
        row.remove()
        if (!this.plugin.favorites.length) this.onOpen()
      })
    }
  }

  onClose() {
    this.contentEl.empty()
  }
}

class SaladictStandaloneView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf)
    this.plugin = plugin
    this.navigation = false
  }

  getViewType() {
    return SALADICT_STANDALONE_VIEW
  }

  getDisplayText() {
    return 'Saladict'
  }

  getIcon() {
    return 'languages'
  }

  async onOpen() {
    this.contentEl.empty()
    this.contentEl.addClass('saladict-standaloneView')
    this.plugin.attachPanelToStandaloneView(this)
  }

  async onClose() {
    this.plugin.handleStandaloneViewClosed(this)
  }
}

class SaladictSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display() {
    const { containerEl } = this
    containerEl.empty()
    containerEl.createEl('h2', { text: 'Saladict 设置' })
    containerEl.createEl('p', {
      text: '与 Edge Saladict 共用可迁移设置。Obsidian 不支持的浏览器专属选项会在导入后原样保留，并在再次导出时带回。'
    })

    containerEl.createEl('h3', { text: '通用' })

    new Setting(containerEl)
      .setName('自动划词翻译')
      .setDesc('对应 Edge 的 active / mode.direct。')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.automaticSelectionTranslation)
          .onChange(async value => {
            this.plugin.settings.automaticSelectionTranslation = value
            await this.plugin.settingsChanged()
          })
      )

    new Setting(containerEl)
      .setName('深色模式')
      .setDesc('对应 Edge 的 darkMode。')
      .addDropdown(dropdown =>
        dropdown
          .addOption('follow', '跟随 Obsidian')
          .addOption('light', '浅色')
          .addOption('dark', '深色')
          .setValue(this.plugin.settings.darkMode)
          .onChange(async value => {
            this.plugin.settings.darkMode = value
            await this.plugin.settingsChanged()
          })
      )

    containerEl.createEl('h3', { text: '查词面板' })

    new Setting(containerEl)
      .setName('小窗口宽度')
      .setDesc('对应 Edge 的 panelWidth；独立窗口仍可自由调整。')
      .addSlider(slider =>
        slider
          .setLimits(250, 1000, 10)
          .setValue(this.plugin.settings.panelWidth)
          .setDynamicTooltip()
          .onChange(async value => {
            this.plugin.settings.panelWidth = value
            await this.plugin.settingsChanged()
          })
      )

    new Setting(containerEl)
      .setName('小窗口最大高度')
      .setDesc('对应 Edge 的 panelMaxHeightRatio，以屏幕高度百分比计算。')
      .addSlider(slider =>
        slider
          .setLimits(20, 100, 5)
          .setValue(this.plugin.settings.panelMaxHeightRatio)
          .setDynamicTooltip()
          .onChange(async value => {
            this.plugin.settings.panelMaxHeightRatio = value
            await this.plugin.settingsChanged()
          })
      )

    new Setting(containerEl)
      .setName('面板字号')
      .setDesc('对应 Edge 的 fontSize。')
      .addSlider(slider =>
        slider
          .setLimits(8, 30, 1)
          .setValue(this.plugin.settings.fontSize)
          .setDynamicTooltip()
          .onChange(async value => {
            this.plugin.settings.fontSize = value
            await this.plugin.settingsChanged()
          })
      )

    new Setting(containerEl)
      .setName('默认固定小窗口')
      .setDesc('对应 Edge 的 defaultPinned。固定后继续划词只刷新内容，不改变位置。')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.defaultPinned)
          .onChange(async value => {
            this.plugin.settings.defaultPinned = value
            await this.plugin.settingsChanged()
          })
      )

    new Setting(containerEl)
      .setName('鼠标离开时自动隐藏')
      .setDesc('对应 Edge 的 mode.autoHide；固定窗口和独立窗口不受影响。')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.autoHidePanel)
          .onChange(async value => {
            this.plugin.settings.autoHidePanel = value
            await this.plugin.settingsChanged()
          })
      )

    containerEl.createEl('h3', { text: '划词与发音' })

    new Setting(containerEl)
      .setName('划词后自动朗读')
      .setDesc('对应 Edge 的 autopron；关闭后仍可点击喇叭朗读。')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.autoSpeakOnSelection)
          .onChange(async value => {
            this.plugin.settings.autoSpeakOnSelection = value
            await this.plugin.settingsChanged()
          })
      )

    new Setting(containerEl)
      .setName('英语发音')
      .setDesc('对应 Edge 的 autopron.en.accent。')
      .addDropdown(dropdown =>
        dropdown
          .addOption('uk', '英式')
          .addOption('us', '美式')
          .setValue(this.plugin.settings.pronunciationAccent)
          .onChange(async value => {
            this.plugin.settings.pronunciationAccent = value
            await this.plugin.settingsChanged()
          })
      )

    new Setting(containerEl)
      .setName('目标语言')
      .setDesc('对应 Edge 当前配置中 Google 翻译的目标语言。')
      .addText(text =>
        text
          .setValue(this.plugin.settings.targetLanguage)
          .onChange(async value => {
            this.plugin.settings.targetLanguage = value.trim() || 'zh-CN'
            await this.plugin.settingsChanged()
          })
      )

    new Setting(containerEl)
      .setName('弹出延迟')
      .setDesc('鼠标松开后等待的毫秒数。')
      .addText(text =>
        text
          .setValue(String(this.plugin.settings.selectionDelay))
          .onChange(async value => {
            const next = Number(value)
            if (Number.isFinite(next)) {
              this.plugin.settings.selectionDelay = Math.max(
                0,
                Math.min(2000, next)
              )
              await this.plugin.settingsChanged()
            }
          })
      )

    new Setting(containerEl)
      .setName('最大选区长度')
      .setDesc('超过此长度时不自动发送翻译请求。')
      .addText(text =>
        text
          .setValue(String(this.plugin.settings.maxSelectionChars))
          .onChange(async value => {
            const next = Number(value)
            if (Number.isFinite(next)) {
              this.plugin.settings.maxSelectionChars = Math.max(
                20,
                Math.min(10000, next)
              )
              await this.plugin.settingsChanged()
            }
          })
      )

    containerEl.createEl('h3', { text: '词典' })
    for (const id of PORTABLE_SOURCE_IDS) {
      new Setting(containerEl)
        .setName(SOURCE_LABELS[id])
        .setDesc(`Edge / Obsidian 共用词典 ID：${id}`)
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enabledSourceIds.includes(id))
            .onChange(async value => {
              const ids = new Set(this.plugin.settings.enabledSourceIds)
              if (value) ids.add(id)
              else ids.delete(id)
              this.plugin.settings.enabledSourceIds = Array.from(ids)
              await this.plugin.settingsChanged({ rebuildSources: true })
            })
        )
    }

    new Setting(containerEl)
      .setName('词典显示顺序')
      .setDesc('使用逗号分隔词典 ID；导出时同步到 Edge 当前词典方案。')
      .addText(text =>
        text
          .setPlaceholder(PORTABLE_SOURCE_IDS.join(', '))
          .setValue(this.plugin.settings.sourceOrder.join(', '))
          .onChange(async value => {
            const requested = value
              .split(',')
              .map(item => item.trim())
              .filter(id => PORTABLE_SOURCE_IDS.includes(id))
            if (!requested.length) return
            this.plugin.settings.sourceOrder = Array.from(
              new Set(requested.concat(PORTABLE_SOURCE_IDS))
            )
            await this.plugin.settingsChanged()
          })
      )

    containerEl.createEl('h3', { text: 'Edge / Obsidian 设置迁移' })
    new Setting(containerEl)
      .setName('导入 Saladict 设置')
      .setDesc('接受 Edge 导出的 .saladict 文件，也接受 Obsidian 导出的同格式文件。')
      .addButton(button =>
        button.setButtonText('选择文件并导入').onClick(() =>
          this.plugin.chooseSettingsImport(
            () => this.display(),
            this.containerEl.ownerDocument
          )
        )
      )

    new Setting(containerEl)
      .setName('导出 Saladict 设置')
      .setDesc('生成 Edge 可直接导入的 .saladict 文件；浏览器专属设置会原样保留。')
      .addButton(button =>
        button.setButtonText('导出 .saladict').onClick(() =>
          this.plugin.exportSettingsFile(this.containerEl.ownerDocument)
        )
      )

    if (this.plugin.lastSettingsTransferMessage) {
      containerEl.createEl('p', {
        cls: 'saladict-settingsStatus',
        text: this.plugin.lastSettingsTransferMessage
      })
    }
  }
}

module.exports = class SaladictObsidianPlugin extends Plugin {
  async onload() {
    const saved = (await this.loadData()) || {}
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved.settings || {})
    const savedSchemaVersion = Number(saved.integrationSchemaVersion) || 1
    if (savedSchemaVersion < 2) {
      this.settings.selectionDelay = 0
      if (
        !Array.isArray(this.settings.enabledSourceIds) ||
        this.settings.enabledSourceIds.includes('google')
      ) {
        this.settings.enabledSourceIds = Array.from(
          new Set(
            (this.settings.enabledSourceIds || []).concat(LONG_TEXT_SOURCE_IDS)
          )
        )
      }
    }
    this.settings.enabledSourceIds = Array.from(
      new Set(
        Array.isArray(this.settings.enabledSourceIds)
          ? this.settings.enabledSourceIds
          : DEFAULT_SETTINGS.enabledSourceIds
      )
    ).filter(id => PORTABLE_SOURCE_IDS.includes(id))
    this.settings.sourceOrder = Array.from(
      new Set(
        (Array.isArray(this.settings.sourceOrder)
          ? this.settings.sourceOrder
          : DEFAULT_SETTINGS.sourceOrder
        ).concat(PORTABLE_SOURCE_IDS)
      )
    ).filter(id => PORTABLE_SOURCE_IDS.includes(id))
    this.favorites = Array.isArray(saved.favorites) ? saved.favorites : []
    this.edgeConfigStorage = saved.edgeConfigStorage || null
    this.lastSettingsTransferMessage = ''
    this.refreshSources()
    this.lookupGeneration = 0
    this.pendingTimer = null
    this.currentPoint = null
    this.currentResult = null
    this.sourceCards = new Map()
    this.audio = null
    this.utterance = null
    this.speechMode = null
    this.speechPaused = false
    this.isPinned = Boolean(this.settings.defaultPinned)
    this.manualPosition = false
    this.dragState = null
    this.lookupHistory = []
    this.lookupHistoryIndex = -1
    this.hostDocument = document
    this.standaloneLeaf = null
    this.standaloneView = null

    this.registerView(
      SALADICT_STANDALONE_VIEW,
      leaf => new SaladictStandaloneView(leaf, this)
    )
    this.buildPanel()
    this.applyPanelAppearance()
    this.registerDomEvent(
      document,
      'mouseup',
      event => this.onMouseUp(event),
      true
    )
    this.registerDomEvent(
      document,
      'mousedown',
      event => {
        if (
          !this.panel.hidden &&
          !this.isPinned &&
          !this.standaloneLeaf &&
          !this.panel.contains(event.target)
        ) {
          this.hidePanel()
        }
      },
      true
    )
    this.registerDomEvent(document, 'keydown', event => {
      if (event.key === 'Escape') this.hidePanel()
    })
    this.registerDomEvent(window, 'resize', () => {
      if (this.manualPosition) {
        this.keepPanelInViewport({ force: true })
      } else {
        this.repositionPanel()
      }
    })
    this.registerDomEvent(this.dragArea, 'pointerdown', event =>
      this.startPanelDrag(event)
    )
    this.registerDomEvent(this.panel, 'pointermove', event =>
      this.movePanelDrag(event)
    )
    this.registerDomEvent(this.panel, 'pointerup', event =>
      this.endPanelDrag(event)
    )
    this.registerDomEvent(this.panel, 'pointercancel', event =>
      this.endPanelDrag(event)
    )
    this.registerDomEvent(this.panel, 'mouseleave', () => {
      if (
        this.settings.autoHidePanel &&
        !this.isPinned &&
        !this.standaloneLeaf
      ) {
        this.hidePanel()
      }
    })
    this.addCommand({
      id: 'toggle-automatic-selection-translation',
      name: '开启/关闭自动划词翻译',
      callback: async () => {
        this.settings.automaticSelectionTranslation = !this.settings
          .automaticSelectionTranslation
        await this.saveState()
        return new Notice(
          `Saladict 自动划词翻译已${
            this.settings.automaticSelectionTranslation ? '开启' : '关闭'
          }。`
        )
      }
    })
    this.addCommand({
      id: 'open-favorites',
      name: '打开收藏词条',
      callback: () => new FavoritesModal(this.app, this).open()
    })
    this.addCommand({
      id: 'toggle-standalone-window',
      name: '打开独立查词窗口/返回浮动窗口',
      callback: () => this.toggleStandaloneWindow()
    })
    this.addSettingTab(new SaladictSettingTab(this.app, this))
    if (savedSchemaVersion < INTEGRATION_SCHEMA_VERSION) {
      await this.saveState()
    }
  }

  buildPanel() {
    this.panel = document.body.createDiv({
      cls: 'saladict-obsidian-panel saladict-theme',
      attr: {
        role: 'dialog',
        'aria-live': 'polite',
        'aria-label': 'Saladict 翻译'
      }
    })
    this.panel.hidden = true

    const toolbar = this.panel.createDiv({ cls: 'saladict-menuBar' })
    this.historyBackButton = this.createIconButton(
      toolbar,
      'chevron-left',
      '上一个查词记录',
      'saladict-menuBar-button isDirection'
    )
    this.historyBackButton.addEventListener('click', () =>
      this.navigateHistory(-1)
    )
    this.historyNextButton = this.createIconButton(
      toolbar,
      'chevron-right',
      '下一个查词记录',
      'saladict-menuBar-button isDirection'
    )
    this.historyNextButton.addEventListener('click', () =>
      this.navigateHistory(1)
    )

    const searchWrap = toolbar.createDiv({ cls: 'saladict-menuBar-searchWrap' })
    this.searchInput = searchWrap.createEl('input', {
      cls: 'saladict-menuBar-search',
      attr: {
        type: 'text',
        spellcheck: 'false',
        'aria-label': '输入要查询的文字'
      }
    })
    this.searchInput.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return
      this.searchFromToolbar()
    })

    this.searchButton = this.createIconButton(toolbar, 'search', '查词')
    this.searchButton.addEventListener('click', () => this.searchFromToolbar())

    this.dragArea = toolbar.createDiv({
      cls: 'saladict-menuBar-dragArea',
      attr: { title: '拖动窗口' }
    })
    this.settingsButton = this.createIconButton(toolbar, 'settings', '设置')
    this.settingsButton.addEventListener('click', () => this.openSettings())
    this.favoriteButton = this.createIconButton(toolbar, 'star', '收藏词条')
    this.favoriteButton.addEventListener('click', () => {
      if (this.currentResult) this.toggleFavorite(this.currentResult)
    })
    this.speakButton = this.createIconButton(toolbar, 'volume-2', '重新朗读')
    this.speakButton.addEventListener('click', () => {
      if (this.currentResult) {
        this.startSpeech(
          this.currentResult.sourceText,
          this.currentResult.audio
        )
      }
    })
    this.pauseButton = this.createIconButton(toolbar, 'pause', '暂停朗读')
    this.pauseButton.addEventListener('click', () => this.toggleSpeechPause())
    this.notebookButton = this.createIconButton(toolbar, 'book-open', '收藏夹')
    this.notebookButton.addEventListener('click', () =>
      new FavoritesModal(this.app, this).open()
    )
    this.standaloneButton = this.createIconButton(
      toolbar,
      'panel-top-open',
      '在独立窗口中打开'
    )
    this.standaloneButton.addEventListener('click', () =>
      this.toggleStandaloneWindow()
    )
    this.pinButton = this.createIconButton(toolbar, 'pin', '固定窗口')
    this.pinButton.addEventListener('click', () => this.togglePin())
    this.closeButton = this.createIconButton(toolbar, 'x', '关闭窗口')
    this.closeButton.addEventListener('click', () => this.hidePanel())

    this.panelBody = this.panel.createDiv({ cls: 'saladict-panelBody' })
  }

  createIconButton(parent, icon, label, className = 'saladict-menuBar-button') {
    const button = parent.createEl('button', {
      cls: className,
      attr: { type: 'button', title: label, 'aria-label': label }
    })
    setIcon(button, icon)
    return button
  }

  onunload() {
    this.cancelLookup()
    this.stopSpeech()
    this.restorePanelFromStandalone({ closeWindow: true, visible: false })
    if (this.panel) this.panel.remove()
  }

  async openStandaloneWindow() {
    if (this.standaloneLeaf) {
      await this.app.workspace.revealLeaf(this.standaloneLeaf)
      return
    }

    let leaf
    try {
      leaf = this.app.workspace.openPopoutLeaf({
        size: { width: 500, height: 720 }
      })
      this.standaloneLeaf = leaf
      await leaf.setViewState({
        type: SALADICT_STANDALONE_VIEW,
        active: true
      })
      await this.app.workspace.revealLeaf(leaf)
    } catch (error) {
      this.standaloneLeaf = null
      this.standaloneView = null
      if (leaf) leaf.detach()
      new Notice('Saladict：当前 Obsidian 无法创建独立窗口。')
      return
    }
  }

  attachPanelToStandaloneView(view) {
    this.standaloneView = view
    this.panel.classList.add('isStandalone')
    this.panel.style.removeProperty('left')
    this.panel.style.removeProperty('top')
    view.contentEl.appendChild(this.panel)

    if (!this.currentResult && !this.panelBody.childElementCount) {
      this.panelBody.createDiv({
        cls: 'saladict-standaloneWelcome',
        text: '在上方输入文字查词，或回到笔记中直接划词。'
      })
    }
    this.panel.hidden = false
    this.updateToolbarState()
    const ownerWindow = view.contentEl.ownerDocument.defaultView
    if (ownerWindow) ownerWindow.setTimeout(() => this.searchInput.focus(), 0)
  }

  handleStandaloneViewClosed(view) {
    if (this.standaloneView !== view) return
    this.standaloneLeaf = null
    this.standaloneView = null
    this.panel.classList.remove('isStandalone')
    this.hostDocument.body.appendChild(this.panel)
    this.panel.hidden = true
    this.updateToolbarState()
  }

  restorePanelFromStandalone(options = {}) {
    const leaf = this.standaloneLeaf
    if (!leaf) return
    const visible = Boolean(options.visible)
    this.standaloneLeaf = null
    this.standaloneView = null
    this.panel.classList.remove('isStandalone')
    this.hostDocument.body.appendChild(this.panel)
    this.panel.hidden = !visible
    if (visible) {
      this.manualPosition = false
      this.repositionPanel()
    }
    this.updateToolbarState()
    if (options.closeWindow) leaf.detach()
  }

  toggleStandaloneWindow() {
    if (this.standaloneLeaf) {
      this.restorePanelFromStandalone({ closeWindow: true, visible: true })
    } else {
      void this.openStandaloneWindow()
    }
  }

  async saveState() {
    await this.saveData({
      integrationSchemaVersion: INTEGRATION_SCHEMA_VERSION,
      settings: this.settings,
      favorites: this.favorites,
      edgeConfigStorage: this.edgeConfigStorage
    })
  }

  refreshSources() {
    this.sources = createSaladictSources({
      request: requestUrl,
      enabledSourceIds: this.settings.enabledSourceIds
    })
  }

  async settingsChanged(options = {}) {
    if (options.rebuildSources) this.refreshSources()
    this.applyPanelAppearance()
    await this.saveState()
  }

  applyPanelAppearance() {
    if (!this.panel) return
    const width = Math.max(
      250,
      Math.min(1000, Number(this.settings.panelWidth) || 450)
    )
    const heightRatio = Math.max(
      20,
      Math.min(100, Number(this.settings.panelMaxHeightRatio) || 80)
    )
    const fontSize = Math.max(
      8,
      Math.min(30, Number(this.settings.fontSize) || 13)
    )
    this.panel.style.setProperty('--saladict-panel-width', `${width}px`)
    this.panel.style.setProperty(
      '--saladict-panel-max-height',
      `${heightRatio}vh`
    )
    this.panel.style.setProperty('--saladict-panel-font-size', `${fontSize}px`)
    this.panel.classList.toggle(
      'isForcedDark',
      this.settings.darkMode === 'dark'
    )
    this.panel.classList.toggle(
      'isForcedLight',
      this.settings.darkMode === 'light'
    )
    this.keepPanelInViewport({ force: true })
  }

  chooseSettingsImport(onComplete, ownerDocument = this.hostDocument) {
    const input = ownerDocument.createElement('input')
    input.type = 'file'
    input.accept = '.saladict,.json,application/json,text/plain'
    input.hidden = true
    input.addEventListener(
      'change',
      async () => {
        const file = input.files && input.files[0]
        try {
          if (!file) return
          const imported = importSaladictSettings(
            JSON.parse(await file.text()),
            this.settings
          )
          this.settings = Object.assign({}, DEFAULT_SETTINGS, imported.settings)
          this.edgeConfigStorage = imported.edgeConfigStorage
          this.isPinned = Boolean(this.settings.defaultPinned)
          this.refreshSources()
          this.applyPanelAppearance()
          this.updateToolbarState()
          await this.saveState()
          this.lastSettingsTransferMessage = `已导入 ${file.name}；Edge 专属设置已保留。`
          new Notice('Saladict 设置导入成功。')
        } catch (error) {
          this.lastSettingsTransferMessage = `导入失败：${
            error && error.message ? error.message : '文件格式错误'
          }`
          new Notice(this.lastSettingsTransferMessage)
        } finally {
          input.remove()
          if (onComplete) onComplete()
        }
      },
      { once: true }
    )
    ownerDocument.body.appendChild(input)
    input.click()
  }

  exportSettingsFile(ownerDocument = this.hostDocument) {
    try {
      const data = exportSaladictSettings(
        this.settings,
        this.edgeConfigStorage
      )
      const ownerWindow = ownerDocument.defaultView || window
      const blob = new ownerWindow.Blob([JSON.stringify(data, null, 2)], {
        type: 'text/plain;charset=utf-8'
      })
      const url = ownerWindow.URL.createObjectURL(blob)
      const link = ownerDocument.createElement('a')
      link.href = url
      link.download = `config-${Date.now()}.saladict`
      link.hidden = true
      ownerDocument.body.appendChild(link)
      link.click()
      link.remove()
      ownerWindow.setTimeout(() => ownerWindow.URL.revokeObjectURL(url), 0)
      this.lastSettingsTransferMessage =
        '已导出 Edge 与 Obsidian 通用的 .saladict 设置文件。'
      new Notice('Saladict 设置已导出。')
    } catch (error) {
      this.lastSettingsTransferMessage = `导出失败：${
        error && error.message ? error.message : '无法生成文件'
      }`
      new Notice(this.lastSettingsTransferMessage)
    }
  }

  async removeFavorite(text) {
    this.favorites = this.favorites.filter(item => item.text !== text)
    await this.saveState()
  }

  async toggleFavorite(result) {
    const index = this.favorites.findIndex(
      item => item.text === result.sourceText
    )
    if (index >= 0) {
      this.favorites.splice(index, 1)
    } else {
      this.favorites.unshift({
        text: result.sourceText,
        translation: result.translatedText || '',
        phonetic: result.phonetic || '',
        updatedAt: new Date().toISOString()
      })
      this.favorites = this.favorites.slice(0, 1000)
    }
    await this.saveState()
    this.updateToolbarState()
  }

  isFavorite(text) {
    return this.favorites.some(item => item.text === text)
  }

  searchFromToolbar() {
    const text = normalizeSelectionText(this.searchInput.value)
    if (text) this.lookupText(text, { keepPosition: true })
  }

  openSettings() {
    this.app.setting.open()
    this.app.setting.openTabById(this.manifest.id)
  }

  recordLookupHistory(text) {
    if (this.lookupHistory[this.lookupHistoryIndex] === text) return
    this.lookupHistory = this.lookupHistory.slice(
      0,
      this.lookupHistoryIndex + 1
    )
    this.lookupHistory.push(text)
    this.lookupHistory = this.lookupHistory.slice(-50)
    this.lookupHistoryIndex = this.lookupHistory.length - 1
  }

  navigateHistory(direction) {
    const nextIndex = this.lookupHistoryIndex + direction
    if (nextIndex < 0 || nextIndex >= this.lookupHistory.length) return
    this.lookupHistoryIndex = nextIndex
    this.lookupText(this.lookupHistory[nextIndex], {
      keepPosition: true,
      recordHistory: false
    })
  }

  orderedCandidates(text) {
    const order = new Map(
      (this.settings.sourceOrder || []).map((id, index) => [id, index])
    )
    return applicableSources(this.sources, text)
      .filter(
        source => this.settings.includeEnglishDictionary || !source.englishOnly
      )
      .sort(
        (left, right) =>
          (order.has(left.id) ? order.get(left.id) : Number.MAX_SAFE_INTEGER) -
          (order.has(right.id) ? order.get(right.id) : Number.MAX_SAFE_INTEGER)
      )
  }

  getSelectionText(target) {
    const ownerWindow =
      target && target.ownerDocument
        ? target.ownerDocument.defaultView
        : window
    const nativeSelection = ownerWindow ? ownerWindow.getSelection() : null
    const nativeText = normalizeSelectionText(
      nativeSelection ? nativeSelection.toString() : ''
    )
    if (target.closest('.markdown-preview-view, .markdown-reading-view')) {
      return nativeText
    }

    const view =
      findMarkdownViewForTarget(this.app.workspace, target) ||
      this.app.workspace.getActiveViewOfType(MarkdownView)
    const editorText =
      view && view.editor
        ? normalizeSelectionText(view.editor.getSelection())
        : ''
    return editorText || nativeText
  }

  onMouseUp(event) {
    if (
      event.button !== 0 ||
      !this.settings.automaticSelectionTranslation ||
      !isEligibleSelectionTarget(event.target)
    ) {
      return
    }

    const text = this.getSelectionText(event.target)
    if (!text) {
      if (!this.isPinned && !this.standaloneLeaf) this.hidePanel()
      return
    }
    if (text.length > this.settings.maxSelectionChars) {
      this.showTopLevelError(text, '选中的内容太长，请缩短选区后重试。')
      return
    }

    if (shouldUpdatePanelAnchor(this.isPinned, this.manualPosition)) {
      this.currentPoint = { x: event.clientX, y: event.clientY }
      if (!this.isPinned) this.manualPosition = false
    }
    this.cancelLookup()
    const startLookup = () => {
      this.pendingTimer = null
      this.lookupText(text, { keepPosition: this.isPinned })
    }
    const delay = Math.max(0, Number(this.settings.selectionDelay) || 0)
    if (delay === 0) startLookup()
    else this.pendingTimer = window.setTimeout(startLookup, delay)
  }

  async lookupText(value, options = {}) {
    const text = normalizeSelectionText(value)
    if (!text) return
    if (text.length > this.settings.maxSelectionChars) {
      this.showTopLevelError(text, '选中的内容太长，请缩短选区后重试。')
      return
    }

    this.cancelLookup()
    const generation = ++this.lookupGeneration
    if (!options.keepPosition && !this.isPinned) this.manualPosition = false
    if (options.recordHistory !== false) this.recordLookupHistory(text)
    this.currentResult = {
      sourceText: text,
      translatedText: '',
      phonetic: '',
      audio: ''
    }
    this.searchInput.value = text
    this.showSourceLoaders(text)
    this.updateToolbarState()
    if (this.settings.autoSpeakOnSelection) this.startSyntheticSpeech(text)

    const candidates = this.orderedCandidates(text)
    for (const source of candidates) {
      source
        .lookup(text, this.settings)
        .then(result => {
          if (generation !== this.lookupGeneration) return
          this.acceptSourceResult(source, result)
        })
        .catch(error => {
          if (generation !== this.lookupGeneration) return
          this.renderSourceError(source, error)
        })
    }
  }

  cancelLookup() {
    this.lookupGeneration += 1
    if (this.pendingTimer) window.clearTimeout(this.pendingTimer)
    this.pendingTimer = null
  }

  showSourceLoaders(text) {
    this.panelBody.empty()
    this.sourceCards.clear()
    this.panel.hidden = false
    const candidates = this.orderedCandidates(text)
    const translationMode = !isEnglishDictionaryCandidate(text)
    this.panel.classList.toggle('isTranslationMode', translationMode)
    candidates.forEach((source, index) =>
      this.createSourceCard(source, {
        translationMode,
        initiallyFolded: translationMode && index > 0
      })
    )
    this.repositionPanel()
  }

  createSourceCard(source, options = {}) {
    const initiallyFolded = Boolean(options.initiallyFolded)
    const card = this.panelBody.createDiv({
      cls: `saladict-dictItem ${
        initiallyFolded ? 'isFolded' : 'isUnfold'
      }${options.translationMode ? ' isTranslationMode' : ''}`,
      attr: { 'data-source': source.id }
    })
    const head = card.createDiv({ cls: 'saladict-dictItem-head' })
    const logoWrap = head.createDiv({
      cls: 'saladict-dictItem-logoWrap',
      attr: { 'aria-hidden': 'true' }
    })
    const mark = logoWrap.createDiv({
      cls: 'saladict-dictItem-mark',
      text: source.mark
    })
    mark.style.backgroundColor = source.accent
    if (source.iconAsset) {
      const icon = logoWrap.createEl('img', {
        cls: 'saladict-dictItem-logo',
        attr: {
          src: this.app.vault.adapter.getResourcePath(
            `${this.app.vault.configDir}/plugins/${this.manifest.id}/assets/${source.iconAsset}`
          ),
          alt: ''
        }
      })
      icon.addEventListener('error', () => icon.remove())
    }
    head.createEl('span', {
      cls: 'saladict-dictItem-title',
      text: source.title
    })

    const loader = head.createDiv({ cls: 'saladict-dictItem-headLoader' })
    for (let i = 0; i < 5; i += 1) loader.createDiv()

    const emptyArea = head.createDiv({ cls: 'saladict-dictItem-emptyArea' })
    const external = head.createEl('a', {
      cls: 'saladict-dictItem-action',
      attr: {
        href: source.sourceUrl(this.currentResult.sourceText),
        target: '_blank',
        rel: 'noopener',
        title: `打开${source.title}`,
        'aria-label': `打开${source.title}`
      }
    })
    setIcon(external, 'more-horizontal')

    const fold = head.createEl('button', {
      cls: 'saladict-dictItem-fold',
      attr: {
        type: 'button',
        title: initiallyFolded ? '展开翻译' : '折叠翻译',
        'aria-label': initiallyFolded ? '展开翻译' : '折叠翻译'
      }
    })
    setIcon(fold, 'chevron-left')
    const body = card.createDiv({ cls: 'saladict-dictItem-body' })
    const bodyContent = body.createDiv({ cls: 'saladict-dictItem-bodyContent' })
    const loading = bodyContent.createDiv({ cls: 'saladict-dictItem-loading' })
    loading.createSpan({ text: '正在查询' })
    for (let i = 0; i < 5; i += 1) loading.createDiv()
    const previewFold = body.createEl('button', {
      cls: 'saladict-dictItem-previewFold',
      attr: {
        type: 'button',
        title: '展开完整词典内容',
        'aria-label': '展开完整词典内容'
      }
    })
    previewFold.hidden = true
    setIcon(previewFold, 'chevron-down')

    const toggleFold = () => {
      const folded = card.classList.toggle('isFolded')
      card.classList.toggle('isUnfold', !folded)
      fold.setAttribute('title', folded ? '展开词典' : '折叠词典')
      fold.setAttribute('aria-label', folded ? '展开词典' : '折叠词典')
      if (!folded) this.applySourcePreview(source, refs)
    }
    fold.addEventListener('click', toggleFold)
    emptyArea.addEventListener('click', toggleFold)
    previewFold.addEventListener('click', () => {
      card.classList.remove('isPreviewFolded')
      card.classList.add('isPreviewExpanded')
      previewFold.hidden = true
      this.keepPanelInViewport()
    })
    const refs = {
      card,
      body,
      bodyContent,
      loader,
      previewFold,
      translationMode: Boolean(options.translationMode)
    }
    this.sourceCards.set(source.id, refs)
  }

  applySourcePreview(source, refs) {
    if (!refs || refs.card.classList.contains('isFolded')) return
    refs.card.classList.remove('isPreviewExpanded')
    if (refs.translationMode) {
      refs.card.classList.remove('isPreviewFolded')
      refs.body.style.removeProperty('--saladict-dict-preview-height')
      refs.previewFold.hidden = true
      return
    }
    const preferredHeight = source.preferredHeight || 265
    refs.body.style.setProperty(
      '--saladict-dict-preview-height',
      `${preferredHeight}px`
    )
    const shouldFold = shouldPreviewFold(
      refs.bodyContent.scrollHeight,
      preferredHeight
    )
    refs.card.classList.toggle('isPreviewFolded', shouldFold)
    refs.previewFold.hidden = !shouldFold
  }

  acceptSourceResult(source, result) {
    const refs = this.sourceCards.get(source.id)
    if (!refs) return
    refs.loader.remove()
    refs.bodyContent.empty()
    refs.card.classList.toggle(
      'isMachineTranslation',
      Boolean(result.isMachineTranslation)
    )

    if (result.headword || (result.phonetics && result.phonetics.length)) {
      const wordLine = refs.bodyContent.createDiv({ cls: 'saladict-wordLine' })
      if (result.headword) {
        wordLine.createEl('strong', {
          cls: 'saladict-headword',
          text: result.headword
        })
      }
      for (const phonetic of result.phonetics || []) {
        const item = wordLine.createSpan({
          cls: 'saladict-phonetic',
          text: phonetic.label
        })
        if (phonetic.audio) {
          const speaker = item.createEl('button', {
            cls: 'saladict-inlineSpeaker',
            attr: { type: 'button', title: '朗读', 'aria-label': '朗读' }
          })
          setIcon(speaker, 'volume-2')
          speaker.addEventListener('click', () =>
            this.startSpeech(this.currentResult.sourceText, phonetic.audio)
          )
        }
      }
    }

    for (const group of result.groups || []) {
      const groupEl = refs.bodyContent.createDiv({
        cls: 'saladict-resultGroup'
      })
      if (group.label) groupEl.createEl('b', { text: group.label })
      const list = groupEl.createEl('ul')
      for (const entry of group.entries || [])
        list.createEl('li', { text: entry })
    }

    if (!refs.bodyContent.childElementCount) {
      refs.bodyContent.createDiv({
        cls: 'saladict-sourceEmpty',
        text: '没有找到结果。'
      })
    }

    const firstEntry =
      result.groups && result.groups[0] && result.groups[0].entries
        ? result.groups[0].entries[0]
        : ''
    if (source.id === 'google' && firstEntry) {
      this.currentResult.translatedText = firstEntry
    }
    if (
      !this.currentResult.phonetic &&
      result.phonetics &&
      result.phonetics[0]
    ) {
      this.currentResult.phonetic = result.phonetics[0].label
    }
    if (!this.currentResult.audio && result.audio) {
      this.currentResult.audio = result.audio
    }
    this.updateToolbarState()
    window.requestAnimationFrame(() => this.applySourcePreview(source, refs))
    this.keepPanelInViewport()
  }

  renderSourceError(source, error) {
    const refs = this.sourceCards.get(source.id)
    if (!refs) return
    refs.loader.remove()
    refs.bodyContent.empty()
    refs.bodyContent.createDiv({
      cls: 'saladict-sourceError',
      text: error && error.message ? error.message : '这个词典暂时无法连接。'
    })
  }

  showTopLevelError(text, message) {
    this.cancelLookup()
    this.currentResult = {
      sourceText: text,
      translatedText: '',
      phonetic: '',
      audio: ''
    }
    this.searchInput.value = text
    this.panelBody.empty()
    this.panelBody.createDiv({ cls: 'saladict-topError', text: message })
    this.panel.hidden = false
    this.updateToolbarState()
    this.repositionPanel()
  }

  updateToolbarState() {
    const text = this.currentResult ? this.currentResult.sourceText : ''
    const favorite = text && this.isFavorite(text)
    this.favoriteButton.classList.toggle('isActive', Boolean(favorite))
    this.favoriteButton.setAttribute(
      'title',
      favorite ? '取消收藏' : '收藏词条'
    )
    this.pinButton.classList.toggle('isActive', this.isPinned)
    this.pinButton.setAttribute(
      'title',
      this.isPinned ? '取消固定窗口' : '固定窗口'
    )
    this.pinButton.setAttribute(
      'aria-label',
      this.isPinned ? '取消固定窗口' : '固定窗口'
    )
    const standalone = Boolean(this.standaloneLeaf)
    this.standaloneButton.classList.toggle('isActive', standalone)
    this.standaloneButton.empty()
    setIcon(this.standaloneButton, standalone ? 'panel-top-close' : 'panel-top-open')
    this.standaloneButton.setAttribute(
      'title',
      standalone ? '返回笔记内浮动窗口' : '在独立窗口中打开'
    )
    this.standaloneButton.setAttribute(
      'aria-label',
      standalone ? '返回笔记内浮动窗口' : '在独立窗口中打开'
    )
    this.pauseButton.classList.toggle('isActive', this.speechPaused)
    this.pauseButton.empty()
    setIcon(this.pauseButton, this.speechPaused ? 'play' : 'pause')
    this.pauseButton.setAttribute(
      'title',
      this.speechPaused ? '继续朗读' : '暂停朗读'
    )
    this.pauseButton.setAttribute(
      'aria-label',
      this.speechPaused ? '继续朗读' : '暂停朗读'
    )
    this.historyBackButton.disabled = this.lookupHistoryIndex <= 0
    this.historyNextButton.disabled =
      this.lookupHistoryIndex < 0 ||
      this.lookupHistoryIndex >= this.lookupHistory.length - 1
  }

  togglePin() {
    this.isPinned = !this.isPinned
    if (this.isPinned && !this.standaloneLeaf) this.manualPosition = true
    this.updateToolbarState()
  }

  startPanelDrag(event) {
    if (event.button !== 0 || this.standaloneLeaf) return
    const rect = this.panel.getBoundingClientRect()
    this.dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    }
    this.manualPosition = true
    this.panel.classList.add('isDragging')
    this.dragArea.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  movePanelDrag(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return
    const rect = this.panel.getBoundingClientRect()
    const point = clampPanelPosition({
      left: event.clientX - this.dragState.offsetX,
      top: event.clientY - this.dragState.offsetY,
      panelWidth: rect.width,
      panelHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    })
    this.panel.style.left = `${point.left}px`
    this.panel.style.top = `${point.top}px`
  }

  endPanelDrag(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return
    if (this.dragArea.hasPointerCapture(event.pointerId)) {
      this.dragArea.releasePointerCapture(event.pointerId)
    }
    this.dragState = null
    this.panel.classList.remove('isDragging')
  }

  repositionPanel() {
    if (
      !this.panel ||
      this.panel.hidden ||
      this.standaloneLeaf ||
      !this.currentPoint ||
      this.manualPosition
    ) {
      return
    }
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const preferredMaxHeight = Math.round(
      (viewportHeight * Number(this.settings.panelMaxHeightRatio || 80)) / 100
    )
    this.panel.style.setProperty(
      '--saladict-panel-available-height',
      `${preferredMaxHeight}px`
    )
    let rect = this.panel.getBoundingClientRect()
    let layout = computeAnchoredPanelLayout({
      x: this.currentPoint.x,
      y: this.currentPoint.y,
      panelWidth: rect.width,
      panelHeight: rect.height,
      viewportWidth,
      viewportHeight,
      preferredMaxHeight
    })
    this.panel.style.setProperty(
      '--saladict-panel-available-height',
      `${layout.maxHeight}px`
    )
    rect = this.panel.getBoundingClientRect()
    layout = computeAnchoredPanelLayout({
      x: this.currentPoint.x,
      y: this.currentPoint.y,
      panelWidth: rect.width,
      panelHeight: rect.height,
      viewportWidth,
      viewportHeight,
      preferredMaxHeight
    })
    this.panel.style.left = `${layout.left}px`
    this.panel.style.top = `${layout.top}px`
    if (this.isPinned) this.manualPosition = true
  }

  keepPanelInViewport(options = {}) {
    if (!this.panel || this.panel.hidden || this.standaloneLeaf) return
    if (this.manualPosition && !options.force) return
    if (!options.force && this.currentPoint) {
      this.repositionPanel()
      return
    }
    const rect = this.panel.getBoundingClientRect()
    const point = clampPanelPosition({
      left: rect.left,
      top: rect.top,
      panelWidth: rect.width,
      panelHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    })
    this.panel.style.left = `${point.left}px`
    this.panel.style.top = `${point.top}px`
  }

  hidePanel() {
    if (this.standaloneLeaf) {
      this.restorePanelFromStandalone({ closeWindow: true, visible: false })
    } else if (this.panel) {
      this.panel.hidden = true
    }
    this.cancelLookup()
    this.stopSpeech()
  }

  startSpeech(text, preferredAudio) {
    this.stopSpeech()
    this.speechPaused = false
    if (preferredAudio) {
      this.audio = new Audio(preferredAudio)
      this.speechMode = 'audio'
      this.audio.addEventListener('ended', () => {
        this.speechMode = null
        this.updateToolbarState()
      })
      this.audio.play().catch(() => this.startSyntheticSpeech(text))
      this.updateToolbarState()
      return
    }
    this.startSyntheticSpeech(text)
  }

  startSyntheticSpeech(text) {
    this.stopSpeech()
    if (
      !window.speechSynthesis ||
      typeof SpeechSynthesisUtterance !== 'function'
    ) {
      return new Notice('Saladict：当前系统没有可用的语音朗读服务。')
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = /^[A-Za-z][\s\S]*$/.test(text) ? 'en-US' : 'zh-CN'
    this.speechMode = 'synthetic'
    this.utterance = utterance
    utterance.addEventListener('end', () => {
      this.speechMode = null
      this.updateToolbarState()
    })
    window.speechSynthesis.speak(utterance)
    this.updateToolbarState()
  }

  toggleSpeechPause() {
    if (this.speechMode === 'audio' && this.audio) {
      if (this.audio.paused) this.audio.play()
      else this.audio.pause()
      this.speechPaused = this.audio.paused
    } else if (this.speechMode === 'synthetic' && window.speechSynthesis) {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume()
      else window.speechSynthesis.pause()
      this.speechPaused = window.speechSynthesis.paused
    }
    this.updateToolbarState()
  }

  stopSpeech() {
    if (this.audio) {
      this.audio.pause()
      this.audio.currentTime = 0
    }
    this.audio = null
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    this.utterance = null
    this.speechMode = null
    this.speechPaused = false
  }
}
