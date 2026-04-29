import type { Subscription } from '../objects/Subscription'
import type { CreateSubscriptionInput, UpdateSubscriptionInput } from '../schemas/subscription.schema'

function notImplemented(): never {
  throw new Error('Not implemented')
}

export async function getSubscriptionForGroup(
  _familyGroupId: string,
): Promise<Subscription | null> {
  notImplemented()
}

export async function createSubscription(
  _input: CreateSubscriptionInput,
): Promise<Subscription> {
  notImplemented()
}

export async function updateSubscription(
  _input: UpdateSubscriptionInput,
): Promise<Subscription> {
  notImplemented()
}
