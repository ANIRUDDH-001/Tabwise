// Read-only fixed-port child of the bounded snapshot helper; no lifecycle or input imports.
import {resolveOwner} from '../../diagnostics/owner-v2/resolver.mjs';
const result=await resolveOwner({port:6837,deadline:performance.now()+5000});
if(!result.query_completed||!result.measurement.cleanup.process_close_observed||!['absent','unique','ambiguous'].includes(result.outcome))throw Error('listener query incomplete');
console.log(JSON.stringify(result.pids));
