import { getDefaultProfile, ProfileMutable } from '@/app-config/profiles'
import { mergeProfile } from '@/app-config/merge-profile'

describe('mergeProfile', () => {
  it('opens the compact Youdao preview after legacy imports', () => {
    const oldProfile = getDefaultProfile() as ProfileMutable
    oldProfile.version = 2
    Object.keys(oldProfile.dicts.all.youdao.defaultUnfold).forEach(lang => {
      ;(oldProfile.dicts.all.youdao.defaultUnfold as any)[lang] = false
    })

    const mergedProfile = mergeProfile(oldProfile)

    expect(mergedProfile.dicts.all.youdao.defaultUnfold.english).toBe(true)
    expect(mergedProfile.dicts.all.youdao.defaultUnfold.chinese).toBe(true)
    expect(mergedProfile.dicts.all.youdao.defaultUnfold.matchAll).toBe(false)
    expect(mergedProfile.version).toBe(3)
  })

  it('respects later manual Youdao unfold choices', () => {
    const profile = getDefaultProfile() as ProfileMutable
    profile.dicts.all.youdao.defaultUnfold.english = true

    expect(mergeProfile(profile).dicts.all.youdao.defaultUnfold.english).toBe(
      true
    )
  })
})
