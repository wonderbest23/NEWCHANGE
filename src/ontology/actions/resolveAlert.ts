import type { Alert } from '../objects/Alert'
import type { CreateAlertInput, ResolveAlertInput } from '../schemas/alert.schema'

export async function createAlert(_input: CreateAlertInput): Promise<Alert> {
  // TODO: alert.repository
  throw new Error('Not implemented: createAlert')
}

export async function resolveAlert(
  _input: ResolveAlertInput,
): Promise<Alert> {
  // TODO: status resolved + resolved_at
  throw new Error('Not implemented: resolveAlert')
}
