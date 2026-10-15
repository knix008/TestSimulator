// Browser stand-in for Node's fs and path. OpenJPEG's Emscripten bundle
// requires them only after it has detected Node, which never happens here.
export default {};
