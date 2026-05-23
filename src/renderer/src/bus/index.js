import mitt from 'mitt'

const emitter = mitt()

if (typeof window !== 'undefined') window.__bus = emitter

export default emitter
