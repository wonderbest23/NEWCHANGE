import type { Medication } from '../objects/Medication'
import type { MedicationLog } from '../objects/MedicationLog'
import type { CreateMedicationInput, UpdateMedicationInput } from '../schemas/medication.schema'
import type { CreateMedicationLogInput } from '../schemas/medicationLog.schema'

function notImplemented(): never {
  throw new Error('Not implemented')
}

export async function listMedicationsForRecipient(
  _careRecipientId: string,
): Promise<Medication[]> {
  notImplemented()
}

export async function createMedication(
  _input: CreateMedicationInput,
): Promise<Medication> {
  notImplemented()
}

export async function updateMedication(
  _input: UpdateMedicationInput,
): Promise<Medication> {
  notImplemented()
}

export async function createMedicationLog(
  _input: CreateMedicationLogInput,
): Promise<MedicationLog> {
  notImplemented()
}

export async function listMedicationLogs(
  _careRecipientId: string,
  _limit: number,
): Promise<MedicationLog[]> {
  notImplemented()
}
