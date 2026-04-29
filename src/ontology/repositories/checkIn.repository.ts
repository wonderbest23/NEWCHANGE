import type { CheckIn } from '../objects/CheckIn'
import type { SubmitCheckInInput } from '../schemas/checkIn.schema'

function notImplemented(): never {
  throw new Error('Not implemented')
}

export async function listCheckInsForRecipient(
  _careRecipientId: string,
  _limit: number,
): Promise<CheckIn[]> {
  notImplemented()
}

export async function createCheckIn(
  _input: SubmitCheckInInput,
): Promise<CheckIn> {
  notImplemented()
}
