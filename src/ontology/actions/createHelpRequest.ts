import type { Alert } from '../objects/Alert'
import type { CreateHelpRequestInput } from '../schemas/alert.schema'

export async function createHelpRequest(
  _input: CreateHelpRequestInput,
): Promise<Alert> {
  // TODO: type=help_requested + severity 기본값 + alert.repository
  throw new Error('Not implemented: createHelpRequest')
}
