import type { MedicationLog } from '../objects/MedicationLog'
import type { CreateMedicationLogInput } from '../schemas/medicationLog.schema'

export async function logMedicationTaken(
  _input: CreateMedicationLogInput,
): Promise<MedicationLog> {
  // TODO: medication.repository
  throw new Error('Not implemented: logMedicationTaken')
}
