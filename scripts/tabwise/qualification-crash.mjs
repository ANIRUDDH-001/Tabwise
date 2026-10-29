// The caller owns one memoized teardown; crash handlers only stop further work.
export function installQualificationCrashHandlers({target=process,abort,record}){
 let recorded=false;
 const fatal=error=>{target.exitCode=2;if(!recorded){recorded=true;try{record({phase:'fatal',name:error?.name??'unhandled rejection'});}catch{}}abort();};
 target.on('uncaughtException',fatal);target.on('unhandledRejection',fatal);
 return ()=>{target.off('uncaughtException',fatal);target.off('unhandledRejection',fatal);};
}
