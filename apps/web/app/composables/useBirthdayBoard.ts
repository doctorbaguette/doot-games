import { onScopeDispose, shallowRef } from 'vue'
import type { DootRoom } from '@doot-games/engine/vue'
import { BIRTHDAY_BOARD_CHANNEL, birthdayBoardSchema, type BirthdayBoardState } from '../utils/birthdayBoard'

/** Subscribe on the existing room, independent of the currently loaded plugin. */
export function useBirthdayBoard(room: DootRoom) {
  const state = shallowRef<BirthdayBoardState | null>(null)
  const off = room.onExtra(BIRTHDAY_BOARD_CHANNEL, value => {
    const parsed = birthdayBoardSchema.safeParse(value)
    state.value = parsed.success ? parsed.data : null
  })
  onScopeDispose(off)
  return state
}
