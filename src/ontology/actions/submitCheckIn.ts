import type { CheckIn } from '../objects/CheckIn'
import type { SubmitCheckInInput } from '../schemas/checkIn.schema'

export async function submitCheckIn(
  _input: SubmitCheckInInput,
): Promise<CheckIn> {
  // TODO: checkIn.repository
  throw new Error('Not implemented: submitCheckIn')
}
