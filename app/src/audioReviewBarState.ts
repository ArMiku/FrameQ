const playbackRates = [0.75, 1, 1.25, 1.5, 2] as const;

function finiteSeconds(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function formatAudioClock(seconds: number): string {
  const totalSeconds = Math.floor(finiteSeconds(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function clampAudioTime(value: number, duration: number): number {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const safeDuration = finiteSeconds(duration);
  return safeDuration > 0 ? Math.min(safeValue, safeDuration) : safeValue;
}

export function audioProgressPercent(currentTime: number, duration: number): number {
  const safeDuration = finiteSeconds(duration);
  if (safeDuration <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (clampAudioTime(currentTime, safeDuration) / safeDuration) * 100));
}

export function nextPlaybackRate(currentRate: number): number {
  const currentIndex = playbackRates.findIndex((rate) => rate === currentRate);
  if (currentIndex < 0) {
    return 1;
  }

  return playbackRates[(currentIndex + 1) % playbackRates.length];
}

export function formatPlaybackRate(rate: number): string {
  return Number.isInteger(rate) ? rate.toFixed(1) : rate.toString();
}
