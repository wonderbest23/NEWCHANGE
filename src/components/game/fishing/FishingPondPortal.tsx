import { memo } from "react";

/**
 * AR 수면 포털 슬롯 컴포넌트.
 * 실제 렌더링은 Three.js mesh가 담당하고, 이 컴포넌트는
 * 향후 HUD/접근성 레이어를 얹을 때 사용할 구조적 앵커다.
 */
export const FishingPondPortal = memo(function FishingPondPortal() {
  return <div className="sr-only">Fishing Pond Portal</div>;
});
