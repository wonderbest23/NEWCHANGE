/**
 * 음성/자막 접근성 헬퍼.
 *
 * - speak(text): TTS (window.speechSynthesis 한국어). 사용자 제스처 이후에만 작동.
 * - cancelSpeak(): 진행 중인 TTS 취소.
 * - useSubtitle(): 자막 표시용 훅. speak 호출과 자동 동기화 옵션.
 *
 * iOS Safari TTS 는 사용자 제스처 안에서 시작되어야 동작. 자동 재생은 차단됨.
 */

import { useCallback, useEffect, useRef, useState } from "react";

let preferredVoice: SpeechSynthesisVoice | null = null;

function loadKoreanVoice(): SpeechSynthesisVoice | null {
  if (preferredVoice) return preferredVoice;
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  // 한국어 음성 우선 (Apple Yuna, Google 한국의 한국어 등).
  preferredVoice =
    voices.find((v) => v.lang === "ko-KR") ??
    voices.find((v) => v.lang.startsWith("ko")) ??
    null;
  return preferredVoice;
}

export function speak(text: string, options?: { rate?: number; pitch?: number; volume?: number }): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel(); // 이전 발화 종료
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ko-KR";
    utter.rate = options?.rate ?? 1.0;
    utter.pitch = options?.pitch ?? 1.0;
    utter.volume = options?.volume ?? 1.0;
    const voice = loadKoreanVoice();
    if (voice) utter.voice = voice;
    window.speechSynthesis.speak(utter);
  } catch {
    // 미지원 또는 권한 차단 — 무시 (자막은 별도로 보임)
  }
}

export function cancelSpeak(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* noop */
  }
}

// 보이스 목록이 비동기로 채워지는 브라우저(Chrome) 대응: preload
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    preferredVoice = null;
    loadKoreanVoice();
  };
  loadKoreanVoice();
}

/**
 * useSubtitle — 자막 텍스트 상태 관리 + 자동 fade-out.
 *
 *   const { subtitle, show, clear } = useSubtitle();
 *   show("환영합니다. 메뉴를 골라 주세요.");  // 5초 후 자동 사라짐
 *
 * autoSpeak: 자막 show 시 자동으로 TTS 발화.
 */
export function useSubtitle(opts: { autoSpeak?: boolean; durationMs?: number } = {}) {
  const { autoSpeak = true, durationMs = 5000 } = opts;
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (text: string) => {
      setSubtitle(text);
      if (autoSpeak) speak(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSubtitle(null), durationMs);
    },
    [autoSpeak, durationMs],
  );

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSubtitle(null);
    cancelSpeak();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelSpeak();
    };
  }, []);

  return { subtitle, show, clear };
}
