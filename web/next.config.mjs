import {fileURLToPath} from 'node:url';
import r2TraceFiles from './r2-trace-files.json' with {type:'json'};
const root=fileURLToPath(new URL('../',import.meta.url));
// Native CLI imports and integrity reads need their exact raw sources in server deployments.
// Escape literal route-directory brackets because tracing include values are glob patterns.
export default {
 turbopack:{root},outputFileTracingRoot:root,
 outputFileTracingIncludes:Object.fromEntries(['/api/candidate-runs','/api/candidate-runs/*','/api/candidate-runs/*/evidence','/api/candidate-runs/*/repair','/api/r2/admission','/api/r2/product-binding','/api/r2/product-admission','/api/runs/*','/api/runs/*/*','/api/patches/*','/api/patches/*/*','/api/runs/*/diagnose','/api/runs/*/evidence','/api/runs/*/report','/api/verifications/*'].map(route=>[route,r2TraceFiles.map(file=>'../'+file.replaceAll('[','\\[').replaceAll(']','\\]'))])),
 poweredByHeader:false,
};
