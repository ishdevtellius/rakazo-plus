// koffi is only used for Windows process control; the Mac host agent never calls it.
const fail = () => {
  throw new Error("koffi is not available in the Mac host agent");
};
export default new Proxy({}, { get: () => fail });
