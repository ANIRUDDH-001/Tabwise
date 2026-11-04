# OWNER ONLY. Never invoked by the implementation agent.
param([Parameter(Mandatory=$true)][string]$Commit,[string]$Branch='preview/F-03-hosted-release')
$ErrorActionPreference='Stop'
if ($Commit -notmatch '^[a-f0-9]{40}$' -or $Branch -notmatch '^preview/F-03-hosted-release[-a-z0-9]*$') { throw 'Exact commit and restricted preview branch required' }
if ((git remote get-url origin) -ne 'https://github.com/ANIRUDDH-001/Tabwise.git') { throw 'Unexpected origin' }
git cat-file -e "$Commit^{commit}"
if ($LASTEXITCODE -ne 0) { throw 'Missing local release commit' }
# Empty expected value is an atomic create-only lease: ANY existing ref fails, including fast-forward.
git push --force-with-lease="refs/heads/${Branch}:" origin "${Commit}:refs/heads/${Branch}"
if ($LASTEXITCODE -ne 0) { throw 'Publication refused; inspect remote state, never overwrite it' }
Write-Output 'Created preview branch. Open a draft PR to main manually using docs/release/PREVIEW-PR.md. Do not merge or promote.'
