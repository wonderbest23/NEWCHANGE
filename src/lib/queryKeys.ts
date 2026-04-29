/**
 * TanStack Query 키 — 도메인별로 중앙에서 관리합니다.
 * Supabase/온톨로지 연동 시 queryFn이 이 키를 사용합니다.
 */
export const queryKeys = {
  root: ['care'] as const,
  familyGroups: () => [...queryKeys.root, 'familyGroups'] as const,
  careRecipients: () => [...queryKeys.root, 'careRecipients'] as const,
  /** 가족 그룹당 첫 수급자 조회 등 */
  primaryCareRecipient: (familyGroupId: string | undefined) =>
    [...queryKeys.root, 'primaryCareRecipient', familyGroupId ?? ''] as const,
  checkIns: (recipientId?: string) =>
    recipientId
      ? ([...queryKeys.root, 'checkIns', recipientId] as const)
      : ([...queryKeys.root, 'checkIns'] as const),
  medications: (recipientId?: string) =>
    recipientId
      ? ([...queryKeys.root, 'medications', recipientId] as const)
      : ([...queryKeys.root, 'medications'] as const),
  alerts: (recipientId?: string) =>
    recipientId
      ? ([...queryKeys.root, 'alerts', recipientId] as const)
      : ([...queryKeys.root, 'alerts'] as const),
  careTasks: (partnerId?: string) =>
    partnerId
      ? ([...queryKeys.root, 'careTasks', partnerId] as const)
      : ([...queryKeys.root, 'careTasks'] as const),
} as const
