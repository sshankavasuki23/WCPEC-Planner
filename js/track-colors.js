// Hue families follow the seven-area legend on physical PDF page 74.
// Special events use their corresponding fills on physical pages 24–25 and 73–74.
const areas = new Map([
  ['Tandem Solar PV', ['#b45562', '#f6e6e7']],
  ['Silicon Solar PV Technology', ['#35846c', '#e3f0e9']],
  ['Perovskite Solar PV Technology', ['#ad663b', '#f8ebe0']],
  ['Thin-Film and Emerging Solar PV Technology', ['#728932', '#edf0df']],
  ['PV Module and System Engineering, Integrated/Applied PV', ['#a05f81', '#f4e6ee']],
  ['PV Expansion: Frontiers in Photovoltaic Science and Technology', ['#967425', '#f8f0d7']],
  ['PV in the Energy Transition', ['#417f87', '#e4efef']],
]);

const events = {
  tutorial: ['#984f5a', '#f4e6e9'],
  workshop: ['#4e7888', '#e5eef0'],
  plenary: ['#43828b', '#e3eff0'],
  poster: ['#a15b5b', '#f5e8e7'],
  ceremony: ['#776795', '#ede8f4'],
  social: ['#776795', '#ede8f4'],
};
const neutral = ['#77766d', '#efede7'];

export function sessionColors(session) {
  if (session?.id.includes('-kcj-')) return ['#386e9a', '#e7eef5'];
  return areas.get(session?.track) || events[session?.type] || neutral;
}
