import type { LocationConsent } from '../objects/LocationConsent'
import type { CreateLocationConsentInput } from '../schemas/locationConsent.schema'

export async function createLocationConsent(
  _input: CreateLocationConsentInput,
): Promise<LocationConsent> {
  // TODO: location.repository
  throw new Error('Not implemented: createLocationConsent')
}
