// CI-H1: substitute before resolution; never import a real browser engine.
import {registerHooks, syncBuiltinESMExports} from 'node:module';
import http from 'node:http';
const createServer = http.createServer;
http.createServer = (...args) => {
  const server = createServer(...args);
  server.on('listening', () => console.log('CI-H1 listener opened'));
  server.on('close', () => console.log('CI-H1 listener closed'));
  return server;
};
syncBuiltinESMExports();
registerHooks({resolve(specifier, context, next) {
  const source = specifier === '@playwright/test'
    ? `export const chromium={launch:async()=>{throw Error('CI-H1 synthetic launch rejection')}};`
    : specifier === '@axe-core/playwright' ? 'export default class AxeBuilder {}' : null;
  return source === null ? next(specifier, context)
    : {url:`data:text/javascript,${encodeURIComponent(source)}`,shortCircuit:true};
}});
