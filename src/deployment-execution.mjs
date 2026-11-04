// Server-only execution boundary. Credentials and database approvals cannot override Preview.
export function isPreviewDeployment(){return process.env.VERCEL_ENV==='preview';}
export function assertExecutionAllowed(){
 if(isPreviewDeployment())throw Object.assign(new Error('preview_execution_disabled'),{status:403,reason:'preview_execution_disabled'});
}
