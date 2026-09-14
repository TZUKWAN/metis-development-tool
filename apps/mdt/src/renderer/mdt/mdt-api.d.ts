/** Ambient typing for the MDT preload bridge (kept in sync with src/preload/mdt.ts). */
import type { MdtApi } from '../../preload/mdt'

declare global {
  interface Window {
    mdtApi?: MdtApi
  }
}

export {}
