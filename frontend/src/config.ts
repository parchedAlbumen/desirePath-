// Placeholder until the team settles on a name; used in the header and page title.
export const APP_NAME = 'desirePath'
export const APP_TAGLINE = 'Find your route. Own your run.'

// Open the app with ?demo to use the simulated runner instead of real GPS (handy on stage).
export const DEMO_MODE = new URLSearchParams(window.location.search).has('demo')

// Demo helper: add &speed=20 (with ?demo) to fast-forward simulated runs.
export const SIM_SPEED = Math.max(1, Number(new URLSearchParams(window.location.search).get('speed')) || 1)
