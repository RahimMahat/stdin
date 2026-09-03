/**
 * Dotfiles. Reachable only by typing `ls -a`.
 *
 * These are deliberately not pages, not in `help`, and not in tab completion.
 * A crawler cannot find them and neither can anyone who does not already have
 * the reflex to check a directory for what it is not showing them — which is
 * the entire point. `.plan` is the real thing: the file the finger daemon used
 * to serve, and the one Carmack kept as a public dev log.
 *
 * Keep the voice here closer to a text file than to the rest of the site. It is
 * supposed to read like something written for one person, not published.
 */

export interface HiddenFile {
  name: string
  /** null means it exists but will not be read. */
  body: string | null
}

const PLAN = `2026-09-03

Still convinced the hard part of applied AI is data movement, not the
model. The inference call is thirty lines. Getting the right rows to it,
fresh, in an order somebody can audit afterwards, is the other six
months of the project.

Rebuilt this site as a shell this week. Partly because a portfolio that
scrolls tells you nothing about how a person thinks, and partly to find
out whether the constraint would make me write less. It did. There is no
room for a paragraph of adjectives next to a prompt.

Question I keep chewing on: when does a data platform stop being a
pipeline and start being a product with users? Most of what I got wrong
early was on the wrong side of that line — treating the people querying
the warehouse as load on a system rather than as users of a thing that
ought to be pleasant.

--
If you are reading this, you typed \`ls -a\` on a portfolio site.
That is the correct instinct, and honestly it is most of the job.
Come argue with me: rahimmahat07@gmail.com`

const HISTORY = `terraform plan
terraform plan
terraform plan -out=tfplan
terraform apply tfplan
git commit -m "fix"
git commit --amend -m "actually fix this time"
aws glue start-job-run --job-name ingest-prod
watch -n 5 aws glue get-job-run --job-name ingest-prod
select count(*) from staging where loaded_at > now() - interval '1 hour'
select count(*) from staging where loaded_at > now() - interval '1 hour'
select count(*) from staging where loaded_at > now() - interval '1 hour'
:wq
:q!
^C
exit`

export const hiddenFiles: HiddenFile[] = [
  { name: '.bash_history', body: HISTORY },
  { name: '.env', body: null },
  { name: '.plan', body: PLAN },
]

export const findHidden = (name: string): HiddenFile | undefined =>
  hiddenFiles.find((f) => f.name === name.replace(/^\.\//, ''))
