"""Opt-in isolated local PostgreSQL regression; never connects to an existing database.
Uses installed PostgreSQL 18 tools, a fresh temporary data directory and loopback port.
No package install, production migration, passwords or hosted service calls.
"""
import concurrent.futures, hashlib, json, os, pathlib, socket, subprocess, sys, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'cache/w5-review';OUT.mkdir(parents=True,exist_ok=True)
BIN=pathlib.Path('C:/Program Files/PostgreSQL/18/bin')
DATA=pathlib.Path(tempfile.mkdtemp(prefix='Tabwise-W5-Postgres-'))
env={k:v for k,v in os.environ.items() if not k.upper().startswith('PG')}
with socket.socket() as s: s.bind(('127.0.0.1',0)); PORT=s.getsockname()[1]
def run(args,**kw):
 if str(args[0]).endswith('pg_ctl.exe'):
  # Windows server descendants can inherit captured pipes; use a regular file for control output.
  with open(DATA/'control.txt','w+') as f:
   result=subprocess.run([str(x) for x in args],env=env,stdout=f,stderr=f,text=True,timeout=30,**kw)
   f.seek(0);return subprocess.CompletedProcess(args,result.returncode,f.read(),'')
 return subprocess.run([str(x) for x in args],env=env,capture_output=True,text=True,timeout=30,**kw)
def sql(text,ok=True):
 r=run([BIN/'psql.exe','-X','-h','127.0.0.1','-p',PORT,'-U','w5_owner','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',text])
 if ok and r.returncode:raise AssertionError(r.stderr)
 if not ok and r.returncode==0:raise AssertionError('expected SQL refusal')
 return r.stdout.strip()
def lit(v):return "'"+json.dumps(v,separators=(',',':')).replace("'","''")+"'::jsonb"
b={'purpose':'r2-execution','repository':'ANIRUDDH-001/Tabwise','workflow':'.github/workflows/tabwise-r2.yml','revision':'a'*40,'actor':'owner','owner_approval_ref':'D-100','review_ref':'review-100','reviewed_files':['a.mjs'],'reviewed_sha256':'b'*64,'qualification_sha256':'c'*64,'plan_sha256':'d'*64,'fixtures':[{'id':'p1','sha256':'e'*64}],'permitted_attempt':1,'expires_at':'2099-01-01T00:00:00.000Z'}
# Synthetic key shape; crypto validation is separately exercised by Node tests.
def request(id='auth-1',run='123',binding=None):return {'action':'consume','id':id,'binding':binding or b,'consumer':{'run_id':run,'attempt':1},'coordinator_key':'-----BEGIN PUBLIC KEY-----synthetic'}
def consume(q,ok=True):return sql('select public.w5_consume('+lit(q)+');',ok)
def issue(id='auth-1',binding=None):return sql("select tabwise_admission.issue('"+id+"',"+lit(binding or b)+');')
results=[]
def check(name,fn):
 try:fn();results.append({'test':name,'pass':True})
 except Exception as e:results.append({'test':name,'pass':False,'error':str(e)})
started=False
try:
 r=run([BIN/'initdb.exe','-D',DATA,'-U','w5_owner','--auth=trust','--encoding=UTF8','--no-locale']);assert r.returncode==0,r.stderr
 r=run([BIN/'pg_ctl.exe','-D',DATA,'-l',DATA/'server.log','-o',f'-h 127.0.0.1 -p {PORT}','-w','start']);assert r.returncode==0,r.stderr;started=True
 sql('create role anon; create role authenticated; create role service_role;')
 if '--red' in sys.argv:
  check('required durable consumer exists',lambda:consume(request()))
 else:
  r=run([BIN/'psql.exe','-X','-h','127.0.0.1','-p',PORT,'-U','w5_owner','-d','postgres','-v','ON_ERROR_STOP=1','-f',ROOT/'supabase/proposals/r2-w5-admission.sql']);assert r.returncode==0,r.stderr
  def race():
   issue()
   with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    raw=list(pool.map(lambda n:run([BIN/'psql.exe','-X','-h','127.0.0.1','-p',PORT,'-U','w5_owner','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c','select public.w5_consume('+lit(request(run=str(100+n)))+');']),range(8)))
   winners=[json.loads(x.stdout) for x in raw if x.returncode==0];assert len(winners)==1 and winners[0]['fresh'] is True
  def malformed():
   for n,bad in enumerate([{}, {**b,'extra':True}, {**b,'fixtures':[]}, {**b,'reviewed_files':['a','a']}, {**b,'reviewed_sha256':'bad'}, {**b,'purpose':None}, {**b,'actor':123}]):
    sql("select tabwise_admission.issue('malformed-"+str(n)+"',"+lit(bad)+');',False)
  check('SQL issuance rejects incomplete, extra and malformed binding fields',malformed)
  check('8 concurrent distinct consumers: exactly one fresh winner',race)
  def same_run():
   issue('same-run');q=request('same-run');first=json.loads(consume(q));again=json.loads(consume(q));assert first['fresh'] and not again['fresh'] and first['receipt']==again['receipt']
  check('same-run readback returns original receipt without another fresh consume',same_run)
  def lost():
   issue('lost');q=request('lost');consume(q);assert not json.loads(consume(q))['fresh']
  check('committed consumption stays burned after discarded response',lost)
  def bindings():
   for n,key in enumerate(['purpose','revision','actor','plan_sha256','qualification_sha256','review_ref']):
    id='wrong-'+str(n);issue(id);wrong={**b,key:'wrong'};consume(request(id,binding=wrong),False);assert json.loads(consume(request(id)))['fresh']
  check('purpose/revision/actor/plan/qualification/review mismatches never consume',bindings)
  def expired():
   issue('expired');sql("update tabwise_admission.authorizations set expires_at=clock_timestamp()-interval '1 second' where id='expired'",False)
   sql("select tabwise_admission.issue('old',"+lit({**b,'expires_at':'2000-01-01T00:00:00.000Z'})+');',False)
  check('expired issuance and expiry mutation refused',expired)
  def revoked():
   issue('revoked');sql("select tabwise_admission.revoke('revoked');");consume(request('revoked'),False)
  check('revocation blocks consumption',revoked)
  def attempt():
   issue('rerun');q=request('rerun');q['consumer']['attempt']=2;consume(q,False);assert json.loads(consume(request('rerun')))['fresh']
  check('workflow rerun cannot consume',attempt)
  def privileges():
   for role in ['anon','authenticated']:
    sql('set role '+role+';select public.w5_consume('+lit(request())+');',False)
   sql('set role service_role;update tabwise_admission.authorizations set receipt=null;',False)
  check('public/browser roles denied; server cannot directly reset table',privileges)
  def immutable():
   issue('immutable');consume(request('immutable'));sql("update tabwise_admission.authorizations set receipt=null where id='immutable';",False);sql("delete from tabwise_admission.authorizations where id='immutable';",False)
  check('consumption cannot be reset or deleted even by owner through DML',immutable)
  def rollback():
   issue('rollback');sql('begin;select public.w5_consume('+lit(request('rollback'))+');rollback;');assert json.loads(consume(request('rollback')))['fresh']
  check('rolled-back transaction has no committed receipt or launch authority',rollback)
finally:
 if started:
  stopped=run([BIN/'pg_ctl.exe','-D',DATA,'-w','stop','-m','fast']);assert stopped.returncode==0,stopped.stderr
summary={'scope':'isolated local PostgreSQL 18 only; not Supabase deployment qualification','data_directory':str(DATA),'proposal_sha256':hashlib.sha256((ROOT/'supabase/proposals/r2-w5-admission.sql').read_bytes()).hexdigest(),'pass':sum(x['pass'] for x in results),'fail':sum(not x['pass'] for x in results),'results':results,'server_stopped':True}
name='red-postgres.json' if '--red' in sys.argv else 'green-postgres.json';(OUT/name).write_text(json.dumps(summary,indent=2))
print(json.dumps(summary));sys.exit(1 if summary['fail'] else 0)
