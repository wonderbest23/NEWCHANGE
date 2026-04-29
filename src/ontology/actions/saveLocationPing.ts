import type { LocationPing } from '../objects/LocationPing'
import type { SaveLocationPingInput } from '../schemas/location.schema'

export async function saveLocationPing(
  _input: SaveLocationPingInput,
): Promise<LocationPing> {
  // TODO: 동의 snapshot 검증 + location.repository (PostGIS 등)
  throw new Error('Not implemented: saveLocationPing')
}
