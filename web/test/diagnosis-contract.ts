// Compile-only regression: do not invoke the provider from this file.
import {diagnose} from '../../src/meta/diagnosis.mjs';
export function acceptsDefaultSettings(input: unknown, broker: unknown) {
  return diagnose({input,broker,apiKey:undefined,fetchImpl:undefined,logDir:undefined});
}
