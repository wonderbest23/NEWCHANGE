import { createBobber } from "./createBobber";

/**
 * 낚시 찌 팩토리 re-export.
 * 파일 분리를 유지해 장차 React 오버레이/상호작용을 붙이기 쉽도록 둔다.
 */
export function createFishingBobber() {
  return createBobber();
}
