import {assertContract,sha256,validateDiagnosis} from '../../packages/contracts/index.mjs';
import {DIAGNOSIS_PROMPT} from '../meta/diagnosis.mjs';
import {prepareFindings} from './patch.mjs';

export async function persistValidatedDiagnosis({rpc,userId,run,input,result,source}){
 assertContract('diagnosis-input',input);
 if(run.id!==input.run_id||result.model!=='muse-spark-1.3'||result.mode!=='standard'||result.input_sha256!==sha256(JSON.stringify(input))||result.prompt_sha256!==sha256(DIAGNOSIS_PROMPT))throw Error('diagnosis provenance mismatch');
 if(typeof source!=='string'||sha256(source)!==run.spec?.app_hash||input.source.length!==1||input.source[0].path!=='index.html'||input.source[0].sha256!==run.spec.app_hash)throw Error('diagnosis source hash mismatch');
 const checked=validateDiagnosis(input,result.output);if(!checked.ok)throw Error('invalid diagnosis evidence');
 const findings=prepareFindings({input,output:result.output,source,baseSha256:run.spec.app_hash});
 const {data,error}=await rpc('persist_diagnosis',{p_user:userId,p_run:run.id,p_model:result.model,p_input_sha:result.input_sha256,p_prompt_sha:result.prompt_sha256,p_output:result.output,p_usage:result.usage,p_reservation:result.reservation_id,p_findings:findings});
 if(error||!data?.diagnosis_id)throw Error('diagnosis persistence failed');
 return data;
}
