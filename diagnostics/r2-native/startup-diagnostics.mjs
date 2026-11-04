export const STAGES=Object.freeze(['runtime-load','nvda-class-start','initial-listener-query','installation-path','spawn','executable-identity','readiness-relay','cleanup','complete','supervisor-containment']);
export const CODES=Object.freeze(['operation-failed','identity-mismatch','cancelled','startup-failed','cleanup-failed','no-owned-process-listener-absent','stopped','not-attempted','complete','unconfirmed']);
export function safeDiagnostic(value){
 if(!value||!STAGES.includes(value.stage)||!CODES.includes(value.code))return {stage:'nvda-class-start',code:'startup-failed'};
 return {stage:value.stage,code:value.code};
}
