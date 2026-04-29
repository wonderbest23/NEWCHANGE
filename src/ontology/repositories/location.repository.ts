import type { LocationConsent } from '../objects/LocationConsent'
import type { LocationPing } from '../objects/LocationPing'
import type { CreateLocationConsentInput } from '../schemas/locationConsent.schema'
import type { SaveLocationPingInput } from '../schemas/location.schema'

function notImplemented(): never {
  throw new Error('Not implemented')
}

export async function getLatestConsent(
  _careRecipientId: string,
): Promise<LocationConsent | null> {
  notImplemented()
}

export async function createConsent(
  _input: CreateLocationConsentInput,
): Promise<LocationConsent> {
  notImplemented()
}

export async function insertPing(
  _input: SaveLocationPingInput,
): Promise<LocationPing> {
  notImplemented()
}

export async function listRecentPings(
  _careRecipientId: string,
  _limit: number,
): Promise<LocationPing[]> {
  notImplemented()
}
