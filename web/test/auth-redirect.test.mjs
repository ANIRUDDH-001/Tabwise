import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authRedirect,safeReason,unavailableUrl} from '../lib/auth-redirect.mjs';
test('auth failure destinations only expose approved reasons on the request origin',async()=>{
 for(const reason of ['github_oauth_provider_pending','sign_in_configuration_pending','oauth_code_missing','oauth_exchange_failed']){
  const response=await authRedirect(new Request('https://tabwise.example/auth/callback?code=private'),async()=>{throw {reason,token:'private'};});
  assert.equal(response.status,303);const target=new URL(response.headers.get('location'));
  assert.equal(target.origin,'https://tabwise.example');assert.equal(target.pathname,'/auth/unavailable');
  assert.equal(target.searchParams.get('reason'),reason);assert.ok(!target.href.includes('private'));
  assert.match(response.headers.get('cache-control'),/no-store/);
 }
});
test('untrusted reasons cannot be reflected or used for external redirects',()=>{
 for(const value of ['<script>','https://evil.example','toString','constructor',['oauth_code_missing'],null])assert.equal(safeReason(value),'sign_in_unavailable');
 assert.equal(unavailableUrl('https://tabwise.example/auth/login?next=https://evil.example','<script>').href,'https://tabwise.example/auth/unavailable?reason=sign_in_unavailable');
});
test('successful auth responses preserve redirect and cookies',async()=>{
 const response=new Response(null,{status:303,headers:{Location:'https://tabwise.example/w/me','Set-Cookie':'session=synthetic; Path=/; Secure; SameSite=Lax'}});
 assert.equal(await authRedirect(new Request('https://tabwise.example/auth/callback'),async()=>response),response);
});
