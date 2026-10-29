# Privacy exception — owner-local folder path

An earlier design context and the first-round review record quoted an owner-local research
folder by a tilde-relative path (`~/D…s/…`). It contains no user name, no credential and
no absolute path, and it is now published on this branch's history.

Decision (owner, 2026-10-27, re-affirmed for the rebuilt publish lineage on 2026-10-29):
the tilde-relative folder name may stand in review provenance where the owner already
published it; the publish lineage was rebuilt anyway (privacy filtering of absolute paths
and private-workspace names), and the final tree carries no folder name at all.

## Rule from now on

- Review records and bundle text describe owner-side locations instead of quoting them.
- Every verification pass for this bundle runs this check and it must print nothing:

```bash
! git grep -n -e "D[o]wnloads" -e "/[U]sers/" -e "mark-[p]rivate" -- .grace/changes/active/C-LARGE-DOC-STAGE-0
```
