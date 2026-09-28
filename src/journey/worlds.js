// Everything that makes a landing site a place rather than a second copy of the Moon: the sphere it sits
// on, the one sun it shares with every other body in the piece, the ground field's relief, the gait that
// gravity produces, and where the conversation happens.
//
// There is exactly one directional light in this scene. That is the constraint the two worlds are built
// around: the Moon's site fixes the sun's direction in the transfer frame, and the Mars site is then
// solved from it - Jezero's latitude, and the longitude the lighting asks for, which on a real planet is
// simply the hour of the day you arrive at.
import { MathUtils, Quaternion, Vector3 } from "three";
import { siteFrame, uvFromDirection, RELIEF } from "../lib/terrain.js";
import { GAIT } from "../lib/gait.js";
import {
  SEAM_A, SEAM_B, DEPART, TRANSFER_END, MARS_SEAM,
  MOON_LEGS, MARS_LEGS, MOON_CONTACT, MOON_IMPACT_END, MOON_WALK_IN, MOON_TALK_IN, MOON_TALK_OUT,
  MARS_CONTACT, MARS_IMPACT_END, MARS_WALK_IN, MARS_TALK_IN, MARS_TALK_OUT,
} from "./timeline.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export const R_MOON = 12;
// Mars is 1.95x the Moon by radius. The transfer frame keeps that ratio, which is why the Martian descent
// rail is the lunar one multiplied by this number - the limb coverage maths transfers by similarity.
export const R_MARS = 23.4;
export const MARS_DISTANCE = 400;

const MOON_LAT = 0.67;
const MOON_LON = 23.5;
const MOON_SUN_LOCAL = [-0.94, 0.342, 0.05]; //  20 degrees up, leaning east

const MOON_SEED = siteFrame(MOON_LAT * DEG, MOON_LON * DEG, R_MOON);
export const MOON_SUN = new Vector3(...MOON_SUN_LOCAL).applyQuaternion(MOON_SEED.quaternion).normalize();

// With the latitude fixed the site normal traces a small circle, so the sun elevation is
// sin(elev) = S . n, and solving it for the longitude is choosing the local time.
const lonForElevation = (latDeg, S, elevDeg) => {
  const lat = latDeg * DEG;
  const P = Math.cos(lat) * S.x;
  const Q = Math.cos(lat) * S.z;
  const R = Math.sin(lat) * S.y;
  const H = Math.hypot(P, Q) || 1;
  return (Math.asin(MathUtils.clamp((Math.sin(elevDeg * DEG) - R) / H, -1, 1)) - Math.atan2(Q, P)) * RAD;
};

const MARS_LAT = 18.4; //  Jezero West, exactly. The longitude is the local time.
const MARS_ELEVATION = 22;
const MARS_LON = lonForElevation(MARS_LAT, MOON_SUN, MARS_ELEVATION);
// Jezero's true direction in the planet's own frame, which the map is drawn against: the site normal the
// lighting asks for is a rotation of the globe away from that, and on a planet that rotates once every
// 24h39m, choosing the rotation phase is choosing the hour you arrive at. The crop and the sphere both
// read this pair, so the ground underfoot really is the map's Jezero.
const MARS_JEZERO = new Vector3(Math.cos(MARS_LAT * DEG) * Math.sin(77.5 * DEG), Math.sin(MARS_LAT * DEG), Math.cos(MARS_LAT * DEG) * Math.cos(77.5 * DEG)).normalize();
const MARS_SITE_N = new Vector3(Math.cos(MARS_LAT * DEG) * Math.sin(MARS_LON * DEG), Math.sin(MARS_LAT * DEG), Math.cos(MARS_LAT * DEG) * Math.cos(MARS_LON * DEG)).normalize();
const MARS_SPIN = new Quaternion().setFromUnitVectors(MARS_JEZERO, MARS_SITE_N);
const MARS_UV = uvFromDirection(MARS_JEZERO);

// Mars sits 34 degrees from the sun in the transfer frame, so the arrival camera flies at a gibbous disc
// rather than straight into glare.
const _perp = MOON_SUN.clone().cross(new Vector3(0, 1, 0)).normalize();
export const MARS_CENTRE = MOON_SUN.clone()
  .multiplyScalar(Math.cos(34 * DEG))
  .addScaledVector(_perp, Math.sin(34 * DEG))
  .normalize()
  .multiplyScalar(MARS_DISTANCE);

const build = ({ id, radius, lat, lon, centre, relief, gait, sunColor, ambient, legs, seam, contact, impactEnd, walkIn, talkIn, talkOut, graph, ...rest }) => {
  const site = siteFrame(lat * DEG, lon * DEG, radius, centre ? centre.clone() : new Vector3());
  // There is one sun in this scene and it has one world direction. What differs per world is where it sits
  // in that world's local frame, which is the number the sky, the terminator and the shadows all read.
  const sunLocal = MOON_SUN.clone().applyQuaternion(site.quaternion.clone().invert()).normalize();
  return {
    id,
    radius,
    lat,
    lon,
    centre: centre ? centre.clone() : new Vector3(),
    site,
    sunLocal,
    sunElevation: Math.asin(sunLocal.y) * RAD,
    uv: rest.uv || uvFromDirection(site.n),
    spin: rest.spin || new Quaternion(),
    relief: RELIEF[relief],
    gait: GAIT[gait],
    sunColor,
    ambient,
    legs,
    seam,
    contact,
    impactEnd,
    walkIn,
    talkIn,
    talkOut,
    graph,
    scale: radius / R_MOON,
    ...rest,
  };
};

// Local-frame helpers: positions authored as (east, up, south) on a world's site, returned in world units.
export const localAt = (w, x, y, z) => new Vector3(x, y, z).applyQuaternion(w.site.quaternion).add(w.site.pos);
export const localDir = (w, x, y, z) => new Vector3(x, y, z).applyQuaternion(w.site.quaternion).normalize();

export const MOON = build({
  id: "moon",
  radius: R_MOON,
  lat: MOON_LAT,
  lon: MOON_LON,
  relief: "moon",
  gait: "moon",
  sunColor: "#fff6e8",
  ambient: 0.014,
  legs: MOON_LEGS,
  seam: SEAM_B,
  contact: MOON_CONTACT,
  impactEnd: MOON_IMPACT_END,
  walkIn: MOON_WALK_IN,
  talkIn: MOON_TALK_IN,
  talkOut: MOON_TALK_OUT,
  graph: "moonGround",
  // The hand-off frame above the surface: the sphere descent's last frame, the ground act's first, the
  // ascent act's last, and the spot the field is levelled at.
  cut: [0, 0.42, -3.0],
  cutLook: [0, -4.27, -0.13],
  landingAlt: 8,
  // Prop sites in LOCAL metres, next to the rail that has to walk up to them. The ending composition is
  // asserted against these numbers - an edit that leaves frame fails the suite instead of the phone.
  // The look of the ground, and the physics of the sky: air = 0 means nothing scatters and nothing fades.
  mapKey: "moon",
  radiusM: 1737400,
  groundColor: "#a0a0a6",
  farColor: "#7c7c82",
  roughness: 1,
  rockSeed: 7717,
  air: 0,
  skyZenith: [0, 0, 0],
  skyHorizon: [0, 0, 0],
  skyGlow: [0, 0, 0],
  sunIntensity: 2.8,
  lm: [5, 0, 44.5],
  flag: [3.0, 0, 34.0],
  panel: [-4.2, 0, 12],
  companion: [3.5, 0, 37],
  masts: [[20, 62], [-16, 71]],
  park: [3.2, 29],
});

export const MARS = build({
  id: "mars",
  radius: R_MARS,
  lat: MARS_LAT,
  lon: MARS_LON,
  centre: MARS_CENTRE,
  relief: "mars",
  gait: "mars",
  sunColor: "#ffeddb",
  // The opposite of the Moon in the one respect that matters: a thin CO2 atmosphere carrying suspended
  // dust scatters most of the daylight, so the fill is enormous and there is no black in a shadow.
  ambient: 0.42,
  legs: MARS_LEGS,
  seam: MARS_SEAM,
  contact: MARS_CONTACT,
  impactEnd: MARS_IMPACT_END,
  walkIn: MARS_WALK_IN,
  talkIn: MARS_TALK_IN,
  talkOut: MARS_TALK_OUT,
  graph: "marsGround",
  cut: [0, 0.42 * (R_MARS / R_MOON), -3.0 * (R_MARS / R_MOON)],
  cutLook: [0, -4.27 * (R_MARS / R_MOON), -0.13 * (R_MARS / R_MOON)],
  landingAlt: 8,
  mapKey: "mars",
  radiusM: 3389500,
  groundColor: "#a8674a",
  farColor: "#8a5340",
  roughness: 0.95,
  rockSeed: 7719,
  air: 1,
  // Butterscotch daylight, a brighter tan at the horizon, and a pale blue-white glow round the sun.
  skyZenith: [0.40, 0.31, 0.26],
  skyHorizon: [0.66, 0.50, 0.37],
  skyGlow: [0.62, 0.72, 0.88],
  sunIntensity: 2.05,
  // Authored against the Martian rail's final frame (3.4, 1.7, 30) looking at (4.2, 1.95, 41): a
  // 30-degree-wide portrait frame at that heading reaches about -10 to +19 degrees of azimuth, so the
  // habitat sits at +12, the crew member at +3 and the survey marker at -4, each far enough off the next
  // that nothing hides behind the other. tools/check-journey.mjs measures all of it.
  // The same triangle the lunar ending uses, because the Martian rail's last two legs are the lunar
  // ones: 5 m of flag, 8 m of crew, 15 m of habitat, all inside a 30-degree portrait frame at a gaze
  // that drifts 4 degrees east. The rover is the one new subject, parked wide left and far enough back
  // that nothing in front of it can hide it.
  lm: [5, 0, 48],
  flag: [3.0, 0, 34.0],
  panel: [-4.2, 0, 12],
  companion: [3.5, 0, 37],
  rover: [1.1, 0, 49],
  uv: MARS_UV,
  spin: MARS_SPIN,
  masts: [[18, 58], [-14, 66]],
  park: [3.2, 29],
});

export const WORLDS = [MOON, MARS];
export const BY_ID = { moon: MOON, mars: MARS };
export const SITE = MOON.site; //  the lunar site frame, which the first half of the piece is built on
export const SITE_UV = MOON.uv;
export const SUN_DIR = MOON_SUN;
export const EARTH_DIR = localDir(MOON, 0.3, 0.574, 0.76);
export const EARTH_AT = EARTH_DIR.clone().multiplyScalar(120);
export const EARTH_R = 2.0;
export const MOON_SPHERE_U = R_MOON;
export const R_SPHERE = R_MOON;
