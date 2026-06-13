# Contributing

## Branches

Start each feature or fix from an up-to-date `master` branch:

```powershell
git switch master
git pull --ff-only
git switch -c codex/<short-description>
```

Keep one development concern per branch and merge changes into `master` through a pull request.

## Pull Request Titles and Commit Messages

Use Conventional Commits so Release Please can calculate the next version and generate release
notes. Pull request titles must follow this format because GitHub uses the title as the commit
message when squash merging:

- `fix: handle interrupted runtime downloads` creates a patch release.
- `feat: add transcript search` creates a minor release.
- `feat!: change the transcript storage format` creates a major release.
- `docs: explain runtime installation` does not trigger a release by itself.

Use a `BREAKING CHANGE:` footer when a breaking change needs more explanation.

## Validation

Run the same checks used by CI before opening a pull request:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm package:win
```

Pull requests to `master` build an unsigned Windows NSIS installer and retain it as a temporary
GitHub Actions artifact.

## Releases

Release Please maintains a release pull request from Conventional Commits merged into `master`.
After its Windows CI passes, the workflow automatically squash-merges that release pull request.
The merge updates the version and changelog, creates a `vX.Y.Z` tag and draft GitHub Release, and
starts the release build. The workflow publishes the release only after the Windows installer and
its SHA-256 checksum upload successfully.

The installer is currently unsigned, so Windows SmartScreen may display a warning.

Repository maintainers must create an Actions secret named `RELEASE_AUTOMATION_TOKEN`. Use a
fine-grained personal access token restricted to this repository with read/write access to
**Contents**, **Issues**, and **Pull requests**. The token allows Release Please pull requests and
their merges to trigger subsequent workflows; do not replace it with `GITHUB_TOKEN`.

Configure the token without writing it to a file:

```powershell
gh secret set RELEASE_AUTOMATION_TOKEN --repo nhcminh47/Meeting-Notes
```

Feature pull requests remain manually merged. Only branches beginning with
`release-please--branches--master--` are automatically merged after successful CI.
