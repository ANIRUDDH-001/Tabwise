"""Create-only canonical owner SQL packet; never connects to a database."""
import pathlib, json, hashlib, sys
root=pathlib.Path(__file__).resolve().parents[2]
manifest=json.loads((root/'docs/release/migrations.json').read_text())
out=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else root/'cache/hosted-release/owner-rollout')
out.mkdir(parents=True,exist_ok=False)
versions=[pathlib.Path(m['path']).name.split('_')[0] for m in manifest]
quoted=lambda v:"'"+v.replace("'","''")+"'"
packet=["begin;set local lock_timeout='5s';set local statement_timeout='120s';",
 "do $$begin if (select array_agg(version order by version) from supabase_migrations.schema_migrations) is distinct from array["+','.join(map(quoted,versions[:5]))+"]::text[] then raise exception 'migration history differs from reviewed five';end if;end$$;",
 "create temp table release_history_snapshot on commit drop as select id,n,steps,sha256 from public.journey_versions;"]
for m in manifest[5:]:
    raw=(root/m['path']).read_bytes().replace(b'\r\n',b'\n')
    assert hashlib.sha256(raw).hexdigest()==m['sha256'],m['path']
    name=pathlib.Path(m['path']).name
    (out/name).write_bytes(raw)
    packet.append(raw.decode())
    version,label=name[:-4].split('_',1)
    packet.append('insert into supabase_migrations.schema_migrations(version,name,statements) values('+quoted(version)+','+quoted(label)+',array['+quoted(raw.decode())+']);')
packet.append("do $$begin if exists(select * from release_history_snapshot except select id,n,steps,sha256 from public.journey_versions) then raise exception 'saved history changed';end if;end$$;")
checks=(root/'scripts/release/post-migration.sql').read_text().replace('begin read only;','').replace('rollback;','')
packet.extend([checks,"notify pgrst, 'reload schema';commit;"])
(out/'owner-rollout.sql').write_text('\n'.join(packet),encoding='utf8',newline='\n')
print('Created canonical seven-file packet and atomic owner-rollout.sql; no database connection made.')
