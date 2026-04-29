/**
 * MVP UI용 목 데이터 — DB·Supabase와 연결 전까지만 사용합니다.
 */

export const careMockGuardian = {
  parentDisplayName: '아버지',
  lastUpdated: new Date().toISOString(),
} as const

export const careMockToday = {
  checkInDone: true,
  mood: '보통' as const,
  morningMeds: 'complete' as const,
  lastLocation: '집 근처',
  risk: 'none' as const,
} as const

export const careMockAlerts = [
  {
    id: '1',
    message: '새로운 이상은 없어요. 오늘도 안심이에요.',
    tone: 'neutral' as const,
  },
] as const

export const careMockNextSteps = [
  { id: 'a', label: '이번 주 병원 일정 확인' },
  { id: 'b', label: '다음 약 복용 알림' },
] as const

export const careMockTasks = [
  { id: '1', person: '김○○', time: '오후 2:00', type: '방문', status: '예정' },
] as const

export const careMockAdminRows = [
  { id: '1', name: '김**', level: 'Care', lastActive: '·' },
] as const
