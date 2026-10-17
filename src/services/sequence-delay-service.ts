export const SEQUENCE_DELAY_MIN_MS = 75;
export const SEQUENCE_DELAY_MAX_MS = 350;

export function getRandomSequenceDelayMs() {
  return Math.floor(Math.random() * (SEQUENCE_DELAY_MAX_MS - SEQUENCE_DELAY_MIN_MS + 1)) + SEQUENCE_DELAY_MIN_MS;
}

export function waitRandomSequenceDelay() {
  return new Promise((resolve) => setTimeout(resolve, getRandomSequenceDelayMs()));
}
