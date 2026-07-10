default:
    @just --list

status:
    @echo "=== Checking repository status ==="
    @git status

test:
    @echo "=== Running quality gates ==="
    @bun test
    @bun run lint
    @bun run knip

build:
    @echo "=== Building @vemjs/* packages ==="
    @bun run build

# Publishing is CI-driven: `changeset version`, commit, push to main —
# the Release workflow publishes via the changesets action.
# The website deploys separately: `just deploy` in ../vem-website.

commit message="":
    @if [ -z "{{message}}" ]; then \
        echo "Error: Commit message required. Usage: just commit \"fix(core): ...\""; \
        exit 1; \
    fi
    @git add -A
    @git commit -m "{{message}}"

push:
    @echo "=== Pushing commits to GitHub ==="
    @git push origin main
