-- D-63 owner-approved P0 palette revision. Dedicated Tabwise project only.
-- Existing journey versions remain immutable; new runs use this new source hash.
update public.apps
set base_sha256='5ad4631558cdcc557770ae864957ffc167546cd0af58bd11258808e1c0e523be'
where id='fernway' and (base_sha256 is null or base_sha256 in (
 '761f80e03de4157af5cbcebb36bb8be6d39534c70660bff998ea15e37f3f5577',
 '5ad4631558cdcc557770ae864957ffc167546cd0af58bd11258808e1c0e523be'
));
