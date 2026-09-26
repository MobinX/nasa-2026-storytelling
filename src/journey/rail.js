import { CatmullRomCurve3, Vector3 } from "three";
import { clamp01 } from "../journey/timeline.js";

const _p = new Vector3();
const _t = new Vector3();

export const makeRail = (segments) => {
  const curves = segments.map((s) => new CatmullRomCurve3(s.points.map((p) => new Vector3(p[0], p[1], p[2])), false, "centripetal", s.tension ?? 0.5));
  const lengths = curves.map((c) => c.getLength());
  let acc = 0;
  const windows = curves.map((c, i) => {
    const w = { a: acc, b: acc + lengths[i], i };
    acc += lengths[i];
    return w;
  });
  return { curves, windows, total: acc };
};

export const scratchSample = () => ({ position: new Vector3(), tangent: new Vector3() });

export const sampleRail = (rail, u, out) => {
  const d = clamp01(u) * rail.total;
  let k = rail.windows.length - 1;
  for (let i = 0; i < rail.windows.length; i++)
    if (d <= rail.windows[i].b) {
      k = i;
      break;
    }
  const w = rail.windows[k];
  rail.curves[k].getPointAt((d - w.a) / (w.b - w.a), _p);
  rail.curves[k].getTangentAt((d - w.a) / (w.b - w.a), _t);
  out.position.copy(_p);
  out.tangent.copy(_t);
  return out;
};
