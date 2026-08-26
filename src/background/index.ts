import './env'
import '@/_helpers/axios-worker-adapter'
import './initialization'
import { message } from '@/_helpers/browser-api'
import { startSyncServiceInterval } from './sync-manager'
import { init as initPdf } from './pdf-sniffer'
import { ContextMenus } from './context-menus'
import { BackgroundServer } from './server'
import { initBadge } from './badge'
import { setupRequestGAListener } from '@/_helpers/analytics'
import { initBackgroundState } from './state'
import { deleteWords } from './database'

// init first to recevice self messaging
message.self.initServer()

startSyncServiceInterval()

ContextMenus.init()
BackgroundServer.init()

// Ordinary searches are intentionally session-only. Clear the legacy local
// history once, while leaving the separate notebook/heart database untouched.
browser.storage.local
  .get('saladictHistoryDisabledV1')
  .then(async state => {
    if (!state.saladictHistoryDisabledV1) {
      await deleteWords({ area: 'history' })
      await browser.storage.local.set({ saladictHistoryDisabledV1: true })
    }
  })
  .catch(console.warn)

setupRequestGAListener()

initBackgroundState()
  .then(({ appConfig }) => {
    initPdf(appConfig)
    initBadge()
  })
  .catch(console.error)
