# Privacy exception — owner-local folder path

An earlier design context and the first-round review record quoted an owner-local research
folder under the home directory. The quoted form contains no user name, no credential and no
absolute path, and it is now published on this branch's history.

Decision (owner, 2026-10-27): the published history is **not** rewritten. A rewrite would change
every commit id cited by the review records, the acceptance entries and the plan, and the value
of removing a tilde-relative folder name does not justify breaking that audit trail.

## Rule from now on

- Review records and bundle text describe owner-side locations instead of quoting them.
- Every verification pass for this bundle runs this check and it must print nothing:

```bash
! git grep -n -e 'Downl[o]ads' -e '/Use[r]s/' -e 'mark-p[r]ivate' -- .grace/changes/active/C-DOC-CHANGE-JOURNAL
```
