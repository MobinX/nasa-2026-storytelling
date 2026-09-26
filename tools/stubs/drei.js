import { hub } from "./hub-bridge.js";
export const ScrollControls = (props) => props.children;
export const useScroll = () => hub.scrollState;
export const PerformanceMonitor = () => null;
