import { hub, fakeState } from "./hub-bridge.js";
export const useFrame = (cb, priority = 0) => {
  hub.useMemo(() => {
    hub.registerFrame(cb, priority);
    return null;
  }, []);
  return cb;
};
export const useThree = (selector) => selector(fakeState);
export const Canvas = (props) => {
  fakeState.__canvasProps = props;
  return props.children;
};
export const extend = () => {};
