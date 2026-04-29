import type { CareTask } from '../objects/CareTask'
import type {
  AssignCareTaskInput,
  CreateCareTaskInput,
  UpdateCareTaskStatusInput,
} from '../schemas/careTask.schema'

function notImplemented(): never {
  throw new Error('Not implemented')
}

export async function getTaskById(_id: string): Promise<CareTask> {
  notImplemented()
}

export async function listTasksForPartner(
  _partnerId: string,
): Promise<CareTask[]> {
  notImplemented()
}

export async function createTask(
  _input: CreateCareTaskInput,
): Promise<CareTask> {
  notImplemented()
}

export async function assignTask(
  _input: AssignCareTaskInput,
): Promise<CareTask> {
  notImplemented()
}

export async function updateTaskStatus(
  _input: UpdateCareTaskStatusInput,
): Promise<CareTask> {
  notImplemented()
}
