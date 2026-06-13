# Contributing

## Branches

Start each feature or fix from an up-to-date `master` branch:

```powershell
git switch master
git pull --ff-only
git switch -c codex/<short-description>
```

Keep one development concern per branch and merge changes into `master` through a pull request.

## Commit Messages

Use Conventional Commits so Release Please can calculate the next version and generate release
notes:

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
Merging that pull request updates the version and changelog, creates a `vX.Y.Z` tag and GitHub
Release, and publishes the Windows installer with its SHA-256 checksum.

The installer is currently unsigned, so Windows SmartScreen may display a warning.

Repository maintainers must enable **Allow GitHub Actions to create and approve pull requests**
under **Settings > Actions > General**. Release Please uses the repository `GITHUB_TOKEN`, so its
automated release pull request does not start a separate pull request workflow. Feature pull
requests receive full CI, and the release workflow repeats validation before publishing assets.
