# Automated Build History Cleanup

Periodically prunes stale `new-api-custom` Docker image builds, dangling images,
expired Docker BuildKit cache, and leftover temporary staging directories/logs.

## Safety guarantees

- Never removes any Docker image referenced by a running or stopped container.
- Always keeps the newest `BUILD_CLEANUP_KEEP_IMAGES` (default `3`) tags per
  repository plus any image created within `BUILD_CLEANUP_MIN_IMAGE_AGE_HOURS`
  (default `2` hours).
- Prunes BuildKit cache older than `BUILD_CLEANUP_BUILDER_MAX_AGE_HOURS`
  (default `72` hours) while reserving `BUILD_CLEANUP_BUILDER_RESERVED_SPACE`
  (default `2GB`) for incremental rebuilds.
- Only removes temporary staging entries matching explicit build patterns whose
  entire tree is older than `BUILD_CLEANUP_TMP_MAX_AGE_HOURS` (default `6` hours),
  and skips lockfiles, sockets, git worktrees, and files held open by any process.

## Dry-run and manual execution

```bash
python3 tools/build-cleanup/cleanup.py --dry-run
python3 tools/build-cleanup/cleanup.py
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tools/build-cleanup -p 'test_*.py'
```

## Install systemd timer

```bash
sudo install -m 0644 tools/build-cleanup/new-api-build-cleanup.service /etc/systemd/system/
sudo install -m 0644 tools/build-cleanup/new-api-build-cleanup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now new-api-build-cleanup.timer
```
