import { AppConfig } from '@/app-config'
import { checkBackgroundPermission } from '@/_helpers/permission-manager'
import { browser } from '../../helper'

describe('Background permission', () => {
  afterEach(() => browser.flush())

  it('does not request the obsolete background permission in Manifest V3', async () => {
    browser.runtime.getManifest.callsFake(() => ({ manifest_version: 3 }))

    await expect(
      checkBackgroundPermission(({ runInBg: true } as unknown) as AppConfig)
    ).resolves.toBeUndefined()

    expect(browser.permissions.contains.called).toBe(false)
    expect(browser.permissions.request.called).toBe(false)
    expect(browser.permissions.remove.called).toBe(false)
  })
})
