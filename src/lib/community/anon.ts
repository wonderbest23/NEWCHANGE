// 시니어 익명화 유틸 — 같은 글 안에서 같은 사람은 같은 코드로 보이지만,
// 다른 글에서는 다른 코드로 보여 식별을 어렵게 합니다.
// DM에서는 두 사람 사이에서만 안정적으로 같은 코드가 보입니다.

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function code4(seed: string): string {
  return fnv1a(seed).toString(36).toUpperCase().padStart(4, "0").slice(-4);
}

export function anonLabelForPost(postId: string, authorId: string): string {
  return `익명 #${code4(`p:${postId}:${authorId}`)}`;
}

export function anonLabelForPair(userA: string, userB: string): string {
  const [a, b] = [userA, userB].sort();
  return `익명 #${code4(`pair:${a}:${b}`)}`;
}

export function anonLabelForUser(userId: string): string {
  return `익명 #${code4(`u:${userId}`)}`;
}
