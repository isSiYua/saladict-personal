import { getDefaultConfig } from '@/app-config'
import { actionHandlers } from '@/content/redux/modules/action-handlers'
import { State } from '@/content/redux/modules/state'

describe('notebook heart toggle', () => {
  it('favorites an unmarked query', () => {
    const result = actionHandlers.ADD_TO_NOTEBOOK(createState(false), {
      type: 'ADD_TO_NOTEBOOK'
    })

    expect(result.isFav).toBe(true)
  })

  it('unfavorites an already marked query', () => {
    const result = actionHandlers.ADD_TO_NOTEBOOK(createState(true), {
      type: 'ADD_TO_NOTEBOOK'
    })

    expect(result.isFav).toBe(false)
  })
})

function createState(isFav: boolean): State {
  return ({
    config: getDefaultConfig(),
    isFav
  } as unknown) as State
}
