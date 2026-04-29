import type { Alert } from '../objects/Alert'
import type { CreateAlertInput, ResolveAlertInput } from '../schemas/alert.schema'

function notImplemented(): never {
  throw new Error('Not implemented')
}

export async function listAlertsForRecipient(
  _careRecipientId: string,
  _status: 'open' | 'acknowledged' | 'resolved' | 'all',
): Promise<Alert[]> {
  notImplemented()
}

export async function createAlertRow(
  _input: CreateAlertInput,
): Promise<Alert> {
  notImplemented()
}

export async function resolveAlertRow(
  _input: ResolveAlertInput,
): Promise<Alert> {
  notImplemented()
}
