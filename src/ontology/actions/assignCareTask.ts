import type { CareTask } from '../objects/CareTask'
import type {
  AssignCareTaskInput,
  CreateCareTaskInput,
  UpdateCareTaskStatusInput,
} from '../schemas/careTask.schema'

export async function createCareTask(
  _input: CreateCareTaskInput,
): Promise<CareTask> {
  // TODO: careTask.repository
  throw new Error('Not implemented: createCareTask')
}

export async function assignCareTask(
  _input: AssignCareTaskInput,
): Promise<CareTask> {
  // TODO: status assigned + partner id
  throw new Error('Not implemented: assignCareTask')
}

export async function updateCareTaskStatus(
  _input: UpdateCareTaskStatusInput,
): Promise<CareTask> {
  // TODO: careTask.repository
  throw new Error('Not implemented: updateCareTaskStatus')
}
