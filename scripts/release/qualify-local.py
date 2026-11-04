"""Fresh local PostgreSQL qualification. No hosted credentials or network calls."""
import pathlib, subprocess, json, hashlib, os, sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/(sys.argv[1] if len(sys.argv)>1 else 'cache/hosted-release'); OUT.mkdir(parents=True,exist_ok=True)
BIN=pathlib.Path('C:/Program Files/PostgreSQL/18/bin')
def run(args,name,env=None):
    log=OUT/(name+'.log')
    with log.open('w',encoding='utf8') as stream:
        p=subprocess.run([str(a) for a in args],cwd=ROOT,env=env,stdout=stream,stderr=subprocess.STDOUT,text=True)
    if p.returncode: raise RuntimeError(name+' failed; evidence preserved')
    return log.read_text(encoding='utf8')
def sql(port,db,text,name):
    f=OUT/(name+'.sql');f.write_text(text,encoding='utf8')
    return run([BIN/'psql.exe','-X','-h','127.0.0.1','-p',port,'-U','g2test','-d',db,'-v','ON_ERROR_STOP=1','-f',f],name)
migrations=sorted((ROOT/'supabase/migrations').glob('*.sql'))
manifest=[]
reviewed=json.loads((ROOT/'docs/release/migrations.json').read_text())
for p in migrations:
    rel=p.relative_to(ROOT).as_posix()
    canonical=p.read_bytes().replace(b'\r\n',b'\n')
    expected=next(m['sha256'] for m in reviewed if m['path']==rel)
    if hashlib.sha256(canonical).hexdigest()!=expected: raise RuntimeError('checkpoint content mismatch '+rel)
    manifest.append({'path':rel,'sha256':hashlib.sha256(canonical).hexdigest(),'checkout_sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(OUT/'migration-manifest.json').write_text(json.dumps(manifest,indent=2))
for port,db in [(55442,'g2local'),(55439,'r3final')]:
    cluster=OUT/('pg-'+str(port))
    if cluster.exists(): raise RuntimeError('Refusing reuse of existing cluster '+str(cluster))
    run([BIN/'initdb.exe','-D',cluster,'-U','g2test','-A','trust','--encoding=UTF8','--no-locale'],'init-'+str(port))
    run([BIN/'pg_ctl.exe','-D',cluster,'-l',OUT/('pg-'+str(port)+'.log'),'-o',f'-h 127.0.0.1 -p {port}','-w','start'],'start-'+str(port))
    try:
        run([BIN/'createdb.exe','-h','127.0.0.1','-p',port,'-U','g2test',db],'createdb-'+db)
        sql(port,db,"""create role anon;create role authenticated;create role service_role bypassrls;create role r3test superuser login;
create schema auth;create function auth.uid() returns uuid language sql as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
create schema storage;create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);grant usage on schema auth to public;""",'bootstrap-'+db)
        for i,p in enumerate(migrations):
            if i==5:
                sql(port,db,"insert into public.journey_versions(id,journey_id,user_id,n,steps,sha256) values('00000000-0000-4000-8000-000000000055','fernway-seat','00000000-0000-4000-8000-000000000055',987,'[]',repeat('a',64));",db+'-history-before')
                if db=='g2local':
                    run([BIN/'createdb.exe','-h','127.0.0.1','-p',port,'-U','g2test','-T',db,'rolloutcheck'],'clone-rollout')
                    values=','.join("('"+pathlib.Path(m['path']).name.split('_')[0]+"')" for m in manifest[:5])
                    sql(port,'rolloutcheck','create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);insert into supabase_migrations.schema_migrations(version) values '+values+';','rollout-ledger-fixture')
                    sql(port,'rolloutcheck',(ROOT/'cache/hosted-release/owner-rollout/owner-rollout.sql').read_text(encoding='utf8'),'exact-owner-rollout')
                    run([BIN/'createdb.exe','-h','127.0.0.1','-p',port,'-U','g2test','-T',db,'rolloutrollback'],'clone-rollback')
                    sql(port,'rolloutrollback','create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);insert into supabase_migrations.schema_migrations(version) values '+values+';','rollback-ledger-fixture')
                    broken=(ROOT/'cache/hosted-release/owner-rollout/owner-rollout.sql').read_text(encoding='utf8').replace("notify pgrst, 'reload schema';commit;","select 1/0;commit;")
                    try:
                        sql(port,'rolloutrollback',broken,'expected-precommit-failure')
                    except RuntimeError:
                        sql(port,'rolloutrollback',"do $$begin if to_regclass('public.native_product_requests') is not null or (select count(*) from supabase_migrations.schema_migrations)<>5 or not exists(select from public.journey_versions where n=987) then raise exception 'atomic rollback failed';end if;end$$;",'rollback-retains-five-and-history')
                    else: raise RuntimeError('Expected precommit failure did not fail')
            sql(port,db,p.read_text(encoding='utf8'),db+'-'+p.stem)
        sql(port,db,"do $$begin if not exists(select from public.journey_versions where id='00000000-0000-4000-8000-000000000055' and n=987 and steps='[]'::jsonb and sha256=repeat('a',64)) then raise exception 'history lost';end if;end$$;",db+'-history-after')
        sql(port,db,(ROOT/'scripts/release/post-migration.sql').read_text(),db+'-post-assertions')
        for p in sorted((ROOT/'supabase/tests').glob('*.sql')): sql(port,db,p.read_text(encoding='utf8'),db+'-test-'+p.stem)
        env={**os.environ,'TABWISE_G2_LOCAL_DB':'g2local','TABWISE_R3_LOCAL_DB':'r3final','TABWISE_R3_PSQL':str(BIN/'psql.exe')}
        if db=='g2local':
            for name in ['native-request','native-integration','native-recovery']:
                run(['node','--test',f'web/test/{name}-database.test.mjs'],name,env)
        else:
            run(['node','--test','test/tabwise-r3-database.test.mjs'],'repair-concurrency',env)
            run([BIN/'createdb.exe','-h','127.0.0.1','-p',port,'-U','g2test','-T',db,'r3continue'],'clone-rerun')
            env['TABWISE_R3_RERUN_DB']='r3continue'
            run(['node','--test','test/tabwise-r3-rerun-database.test.mjs'],'rerun-concurrency',env)
    finally:
        run([BIN/'pg_ctl.exe','-D',cluster,'-w','stop'],'stop-'+str(port))
print('PASS fresh local migrations, SQL suites and opted-in concurrency tests')
