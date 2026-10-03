// Placeholder until the team settles on a name; used in the header and page title.
export const APP_NAME = 'desirePath'
export const APP_TAGLINE = 'Find your route. Own your run.'

// Demo helper: open the app with ?speed=20 to fast-forward simulated runs.
export const SIM_SPEED = Math.max(1, Number(new URLSearchParams(window.location.search).get('speed')) || 1)
