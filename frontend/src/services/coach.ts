// Audio coach. Lines are canned and spoken with the browser's built-in voice for now;
// replace pickCoachLine with Gemini-generated text and speak() with ElevenLabs audio from the backend.

const LINES = {
  start: ['Easy start. Find your rhythm.', "Let's go. Relax the shoulders and settle in."],
  climb: [
    "Steady effort. You're owning this climb.",
    'Short steps, strong arms. Up and over.',
    'Lean in. The top is closer than it looks.',
  ],
  descent: ['Let gravity help. Quick, light feet.', 'Recover here. Breathe it back down.'],
  flat: ['Smooth and steady. This is your pace.', 'Nice form. Keep it rolling.', 'Every step counts. Stay with it.'],
  final: ['Final stretch. Empty the tank.', 'Almost home. Finish strong.'],
}

/** Pick a line for the current moment; `step` advances every coaching interval. */
export function pickCoachLine(step: number, gradePct: number, remainingKm: number): string {
  const pool =
    step === 0 ? LINES.start
    : remainingKm < 0.6 ? LINES.final
    : gradePct > 2 ? LINES.climb
    : gradePct < -2 ? LINES.descent
    : LINES.flat
  return pool[step % pool.length]
}

export function speak(text: string): void {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.02
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
