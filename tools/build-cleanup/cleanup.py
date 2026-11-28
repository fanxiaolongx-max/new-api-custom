#!/usr/bin/env python3
"""Periodic build history and staging artifact cleanup for new-api-custom.

Removes stale project Docker image tags, dangling images, old BuildKit cache,
and expired temporary build staging directories while protecting:
- any image currently referenced by a running or stopped container,
- the newest N tags per configured image repository for rollback,
- any image or staging artifact newer than the configured minimum age,
- any staging directory/file currently held open by a running process or git worktree.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
import fcntl
import fnmatch
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from typing import Callable, Iterable, Sequence

DEFAULT_IMAGE_REPOS = ("new-api-custom",)
DEFAULT_KEEP_IMAGES = 3
DEFAULT_MIN_IMAGE_AGE_HOURS = 2.0
DEFAULT_BUILDER_MAX_AGE_HOURS = 72
DEFAULT_BUILDER_RESERVED_SPACE = "2GB"
DEFAULT_BUILDER_MAX_SPACE = "4GB"
DEFAULT_TMP_ROOTS = ("/tmp",)
DEFAULT_TMP_MAX_AGE_HOURS = 6.0
DEFAULT_DISK_WARN_PCT = 85
DEFAULT_LOCK_PATH = "/run/new-api-build-cleanup.lock"
FALLBACK_LOCK_PATH = "/tmp/new-api-build-cleanup.lock"

DEFAULT_STAGING_PATTERNS = (
    "dragonapi-*-image",
    "dragonapi-*-tools",
    "dragon-lab-*-image",
    "lab-*-image",
    "dragonlab-expand",
    "kindle-release-*",
    "kindle-guac-build",
    "debian-console-src.*",
    "dragon-lab-*.log",
    "dragon-lab-*.html",
    "dragon-lab-*.png",
    "dragon-lab-*.jpg",
    "dragon-lab-*.json",
    "lab-*.log",
    "lab-*.txt",
    "lab-*.html",
    "lab-*.png",
    "lab-*.jpg",
    "lab-*.json",
    "dragonapi-*.log",
    "dragonapi-*.json",
    "dragonapi-*.html",
    "dragon-camera-*.log",
    "kindle-*.log",
    "kindle-*.png",
    "kindle-*.jar",
    "kindle-*.conf",
    "kindle-*.sh",
)


@dataclass(frozen=True)
class CleanupConfig:
    image_repos: tuple[str, ...] = DEFAULT_IMAGE_REPOS
    keep_images: int = DEFAULT_KEEP_IMAGES
    min_image_age_hours: float = DEFAULT_MIN_IMAGE_AGE_HOURS
    builder_max_age_hours: int = DEFAULT_BUILDER_MAX_AGE_HOURS
    builder_reserved_space: str = DEFAULT_BUILDER_RESERVED_SPACE
    builder_max_space: str = DEFAULT_BUILDER_MAX_SPACE
    prune_dangling: bool = True
    tmp_roots: tuple[str, ...] = DEFAULT_TMP_ROOTS
    tmp_max_age_hours: float = DEFAULT_TMP_MAX_AGE_HOURS
    staging_patterns: tuple[str, ...] = DEFAULT_STAGING_PATTERNS
    disk_warn_pct: int = DEFAULT_DISK_WARN_PCT
    lock_path: str = DEFAULT_LOCK_PATH
    dry_run: bool = False


@dataclass(frozen=True)
class DockerImageRecord:
    repository: str
    tag: str
    image_id: str
    created_at_epoch: float
    size: str = ""

    @property
    def ref(self) -> str:
        return f"{self.repository}:{self.tag}"


@dataclass
class CleanupSummary:
    dry_run: bool
    removed_images: list[str] = field(default_factory=list)
    kept_images: list[str] = field(default_factory=list)
    dangling_pruned: str = ""
    builder_pruned: str = ""
    removed_staging: list[str] = field(default_factory=list)
    reclaimed_staging_bytes: int = 0
    warnings: list[str] = field(default_factory=list)
    disk_usage: dict[str, dict[str, int | float]] = field(default_factory=dict)


def _split_csv(raw: str | None, default: tuple[str, ...]) -> tuple[str, ...]:
    if raw is None:
        return default
    items = tuple(part.strip() for part in raw.split(",") if part.strip())
    return items or default


def _parse_bool(raw: str | None, default: bool) -> bool:
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def config_from_env(dry_run: bool = False) -> CleanupConfig:
    keep_images = max(1, int(os.environ.get("BUILD_CLEANUP_KEEP_IMAGES", DEFAULT_KEEP_IMAGES)))
    min_age = max(0.0, float(os.environ.get("BUILD_CLEANUP_MIN_IMAGE_AGE_HOURS", DEFAULT_MIN_IMAGE_AGE_HOURS)))
    builder_age = max(1, int(os.environ.get("BUILD_CLEANUP_BUILDER_MAX_AGE_HOURS", DEFAULT_BUILDER_MAX_AGE_HOURS)))
    tmp_age = max(0.5, float(os.environ.get("BUILD_CLEANUP_TMP_MAX_AGE_HOURS", DEFAULT_TMP_MAX_AGE_HOURS)))
    warn_pct = min(99, max(50, int(os.environ.get("BUILD_CLEANUP_DISK_WARN_PCT", DEFAULT_DISK_WARN_PCT))))
    reserved = os.environ.get("BUILD_CLEANUP_BUILDER_RESERVED_SPACE", DEFAULT_BUILDER_RESERVED_SPACE).strip()
    if not reserved:
        reserved = DEFAULT_BUILDER_RESERVED_SPACE
    max_space = os.environ.get("BUILD_CLEANUP_BUILDER_MAX_SPACE", DEFAULT_BUILDER_MAX_SPACE).strip()
    if not max_space:
        max_space = DEFAULT_BUILDER_MAX_SPACE

    return CleanupConfig(
        image_repos=_split_csv(os.environ.get("BUILD_CLEANUP_IMAGE_REPOS"), DEFAULT_IMAGE_REPOS),
        keep_images=keep_images,
        min_image_age_hours=min_age,
        builder_max_age_hours=builder_age,
        builder_reserved_space=reserved,
        builder_max_space=max_space,
        prune_dangling=_parse_bool(os.environ.get("BUILD_CLEANUP_PRUNE_DANGLING"), True),
        tmp_roots=_split_csv(os.environ.get("BUILD_CLEANUP_TMP_ROOTS"), DEFAULT_TMP_ROOTS),
        tmp_max_age_hours=tmp_age,
        staging_patterns=_split_csv(os.environ.get("BUILD_CLEANUP_STAGING_PATTERNS"), DEFAULT_STAGING_PATTERNS),
        disk_warn_pct=warn_pct,
        lock_path=os.environ.get("BUILD_CLEANUP_LOCK_PATH", DEFAULT_LOCK_PATH).strip() or DEFAULT_LOCK_PATH,
        dry_run=dry_run,
    )


CommandRunner = Callable[[Sequence[str]], subprocess.CompletedProcess[str]]


def default_runner(cmd: Sequence[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=False, capture_output=True, text=True)


def parse_docker_timestamp(raw: str) -> float:
    """Parse Docker `CreatedAt` or RFC3339 timestamps into epoch seconds."""
    text = raw.strip()
    if not text:
        return 0.0
    # `docker image inspect` returns ISO8601 like `2026-11-27T18:39:06.123456789Z` or `+02:00`.
    from datetime import datetime

    normalized = text
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    if "." in normalized:
        head, tail = normalized.split(".", 1)
        tz_pos = max(tail.find("+"), tail.find("-"))
        if tz_pos != -1:
            frac = tail[:tz_pos][:6]
            normalized = f"{head}.{frac}{tail[tz_pos:]}"
        else:
            normalized = f"{head}.{tail[:6]}"
    try:
        return datetime.fromisoformat(normalized).timestamp()
    except ValueError:
        return 0.0


def list_container_image_ids(runner: CommandRunner) -> set[str]:
    ps = runner(["docker", "ps", "-a", "-q"])
    if ps.returncode != 0:
        raise RuntimeError(ps.stderr.strip() or "failed to list docker containers")
    container_ids = [line.strip() for line in ps.stdout.splitlines() if line.strip()]
    if not container_ids:
        return set()
    insp = runner(["docker", "inspect", "--format", "{{.Image}}", *container_ids])
    if insp.returncode != 0:
        raise RuntimeError(insp.stderr.strip() or "failed to inspect docker containers")
    return {line.strip() for line in insp.stdout.splitlines() if line.strip()}


def list_repo_images(repo: str, runner: CommandRunner) -> list[DockerImageRecord]:
    ls = runner(["docker", "images", "--no-trunc", "--format", "{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}", repo])
    if ls.returncode != 0:
        raise RuntimeError(ls.stderr.strip() or f"failed to list images for {repo}")

    refs: list[tuple[str, str, str, str]] = []
    for line in ls.stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        r_repo, r_tag, r_id = parts[0].strip(), parts[1].strip(), parts[2].strip()
        r_size = parts[3].strip() if len(parts) > 3 else ""
        if not r_tag or r_tag == "<none>":
            continue
        refs.append((r_repo, r_tag, r_id, r_size))

    if not refs:
        return []

    unique_ids = list(dict.fromkeys(r_id for _, _, r_id, _ in refs))
    insp = runner(["docker", "image", "inspect", "--format", "{{.Id}}\t{{.Created}}", *unique_ids])
    if insp.returncode != 0:
        raise RuntimeError(insp.stderr.strip() or f"failed to inspect images for {repo}")

    created_by_id: dict[str, float] = {}
    for line in insp.stdout.splitlines():
        if not line.strip():
            continue
        img_id, _, created_raw = line.partition("\t")
        created_by_id[img_id.strip()] = parse_docker_timestamp(created_raw)

    records = [
        DockerImageRecord(
            repository=r_repo,
            tag=r_tag,
            image_id=r_id,
            created_at_epoch=created_by_id.get(r_id, 0.0),
            size=r_size,
        )
        for r_repo, r_tag, r_id, r_size in refs
    ]
    records.sort(key=lambda item: (item.created_at_epoch, item.ref), reverse=True)
    return records


def select_stale_images(
    records: Sequence[DockerImageRecord],
    active_image_ids: set[str],
    keep_images: int,
    min_age_hours: float,
    now: float,
) -> tuple[list[DockerImageRecord], list[DockerImageRecord]]:
    """Return (to_remove, to_keep) preserving active containers, newest N tags, and recent builds."""
    ordered = sorted(records, key=lambda item: (item.created_at_epoch, item.ref), reverse=True)
    min_age_seconds = min_age_hours * 3600.0
    protected_ids = set(active_image_ids)

    # First pass: determine which image IDs must remain protected.
    keep_indices: set[int] = set()
    for idx, rec in enumerate(ordered):
        age_seconds = max(0.0, now - rec.created_at_epoch) if rec.created_at_epoch > 0 else float("inf")
        if idx < keep_images or rec.image_id in active_image_ids or age_seconds < min_age_seconds:
            keep_indices.add(idx)
            protected_ids.add(rec.image_id)

    to_keep: list[DockerImageRecord] = []
    to_remove: list[DockerImageRecord] = []
    for idx, rec in enumerate(ordered):
        if idx in keep_indices or rec.image_id in protected_ids:
            to_keep.append(rec)
        else:
            to_remove.append(rec)
    return to_remove, to_keep


def open_process_fd_targets(
    roots: Sequence[str] = DEFAULT_TMP_ROOTS,
    proc_root: Path = Path("/proc"),
) -> set[Path]:
    """Collect open file/directory paths under `roots` from `/proc/*/fd`."""
    targets: set[Path] = set()
    if not proc_root.is_dir():
        return targets
    resolved_roots = [str(Path(r).resolve(strict=False)) for r in roots]
    for entry in proc_root.iterdir():
        if not entry.name.isdigit():
            continue
        fd_dir = entry / "fd"
        try:
            with os.scandir(fd_dir) as it:
                for fd in it:
                    try:
                        link_target = os.readlink(fd.path)
                    except OSError:
                        continue
                    if not link_target.startswith("/"):
                        continue
                    if any(
                        link_target == root or link_target.startswith(root.rstrip("/") + "/")
                        for root in resolved_roots
                    ):
                        targets.add(Path(link_target).resolve(strict=False))
        except OSError:
            continue
    return targets


def _is_git_worktree_root(path: Path) -> bool:
    return (path / ".git").exists()


def _path_has_open_handle(path: Path, open_targets: Iterable[Path]) -> bool:
    resolved_target = path.resolve(strict=False)
    for open_path in open_targets:
        if open_path == resolved_target or resolved_target in open_path.parents:
            return True
    return False


def _latest_tree_mtime(path: Path) -> float:
    latest = path.stat().st_mtime
    if path.is_dir() and not path.is_symlink():
        for root, dirs, files in os.walk(path, followlinks=False):
            root_path = Path(root)
            try:
                latest = max(latest, root_path.stat().st_mtime)
            except OSError:
                pass
            for name in (*dirs, *files):
                try:
                    st = (root_path / name).lstat()
                    latest = max(latest, st.st_mtime)
                except OSError:
                    pass
    return latest


def _entry_size_bytes(path: Path) -> int:
    if path.is_symlink() or path.is_file():
        try:
            return path.lstat().st_size
        except OSError:
            return 0
    total = 0
    for root, dirs, files in os.walk(path, followlinks=False):
        root_path = Path(root)
        for name in (*dirs, *files):
            try:
                total += (root_path / name).lstat().st_size
            except OSError:
                pass
    return total


def find_stale_staging_entries(
    roots: Sequence[str],
    patterns: Sequence[str],
    max_age_hours: float,
    now: float,
    open_targets: set[Path] | None = None,
) -> list[tuple[Path, int]]:
    cutoff = now - (max_age_hours * 3600.0)
    active_fds = open_targets if open_targets is not None else open_process_fd_targets(roots=roots)
    stale: list[tuple[Path, int]] = []

    for root_str in roots:
        root = Path(root_str)
        if not root.is_dir():
            continue
        try:
            children = sorted(root.iterdir(), key=lambda p: p.name)
        except OSError:
            continue
        for child in children:
            if not any(fnmatch.fnmatch(child.name, pat) for pat in patterns):
                continue
            if child.name.endswith(".lock") or child.is_socket():
                continue
            if child.is_dir() and _is_git_worktree_root(child):
                continue
            try:
                latest_mtime = _latest_tree_mtime(child)
            except OSError:
                continue
            if latest_mtime > cutoff:
                continue
            if _path_has_open_handle(child, active_fds):
                continue
            stale.append((child, _entry_size_bytes(child)))
    return stale


def check_disk_usage(paths: Sequence[str], warn_pct: int) -> tuple[dict[str, dict[str, int | float]], list[str]]:
    stats: dict[str, dict[str, int | float]] = {}
    warnings: list[str] = []
    seen_devs: set[int] = set()
    for path_str in paths:
        path = Path(path_str)
        if not path.exists():
            continue
        try:
            dev = path.stat().st_dev
            if dev in seen_devs:
                continue
            seen_devs.add(dev)
            usage = shutil.disk_usage(path)
        except OSError:
            continue
        used_pct = round((usage.used / usage.total) * 100.0, 1) if usage.total > 0 else 0.0
        stats[path_str] = {
            "total_bytes": usage.total,
            "used_bytes": usage.used,
            "free_bytes": usage.free,
            "used_pct": used_pct,
        }
        if used_pct >= warn_pct:
            warnings.append(
                f"Disk usage on {path_str} is {used_pct}% "
                f"({usage.free / (1024 ** 3):.2f} GiB free, threshold {warn_pct}%)."
            )
    return stats, warnings


def _docker_data_root(runner: CommandRunner) -> str | None:
    res = runner(["docker", "info", "--format", "{{.DockerRootDir}}"])
    if res.returncode != 0:
        return None
    root = res.stdout.strip()
    return root or None


def run_cleanup(
    config: CleanupConfig,
    runner: CommandRunner = default_runner,
    now: float | None = None,
    open_targets: set[Path] | None = None,
) -> CleanupSummary:
    current_time = now if now is not None else time.time()
    summary = CleanupSummary(dry_run=config.dry_run)

    docker_available = True
    try:
        active_ids = list_container_image_ids(runner)
    except RuntimeError as exc:
        docker_available = False
        summary.warnings.append(f"Skipping Docker cleanup: {exc}")
        active_ids = set()

    if docker_available:
        for repo in config.image_repos:
            try:
                records = list_repo_images(repo, runner)
            except RuntimeError as exc:
                summary.warnings.append(f"Failed to inspect repo {repo}: {exc}")
                continue
            to_remove, to_keep = select_stale_images(
                records=records,
                active_image_ids=active_ids,
                keep_images=config.keep_images,
                min_age_hours=config.min_image_age_hours,
                now=current_time,
            )
            summary.kept_images.extend(rec.ref for rec in to_keep)
            for rec in to_remove:
                if config.dry_run:
                    summary.removed_images.append(rec.ref)
                    continue
                res = runner(["docker", "image", "rm", rec.ref])
                if res.returncode == 0:
                    summary.removed_images.append(rec.ref)
                else:
                    summary.warnings.append(f"Failed to remove {rec.ref}: {res.stderr.strip() or res.stdout.strip()}")

        if config.prune_dangling:
            if config.dry_run:
                summary.dangling_pruned = "dry-run (skipped docker image prune)"
            else:
                res = runner([
                    "docker",
                    "image",
                    "prune",
                    "-f",
                    "--filter",
                    f"until={int(config.min_image_age_hours)}h",
                ])
                if res.returncode == 0:
                    summary.dangling_pruned = res.stdout.strip() or "ok"
                else:
                    summary.warnings.append(f"docker image prune failed: {res.stderr.strip()}")

        if config.dry_run:
            summary.builder_pruned = (
                f"dry-run (would run docker builder prune --filter until={config.builder_max_age_hours}h "
                f"--reserved-space {config.builder_reserved_space} and cap at {config.builder_max_space})"
            )
        else:
            age_res = runner([
                "docker",
                "builder",
                "prune",
                "-f",
                "--filter",
                f"until={config.builder_max_age_hours}h",
                "--reserved-space",
                config.builder_reserved_space,
            ])
            cap_res = runner([
                "docker",
                "builder",
                "prune",
                "-f",
                "--filter",
                f"until={max(1, int(config.min_image_age_hours))}h",
                "--max-used-space",
                config.builder_max_space,
            ])
            outputs = [r.stdout.strip() for r in (age_res, cap_res) if r.returncode == 0 and r.stdout.strip()]
            summary.builder_pruned = " | ".join(outputs) if outputs else "ok"
            for r in (age_res, cap_res):
                if r.returncode != 0:
                    summary.warnings.append(f"docker builder prune failed: {r.stderr.strip()}")

    stale_paths = find_stale_staging_entries(
        roots=config.tmp_roots,
        patterns=config.staging_patterns,
        max_age_hours=config.tmp_max_age_hours,
        now=current_time,
        open_targets=open_targets,
    )
    for path, size_bytes in stale_paths:
        if config.dry_run:
            summary.removed_staging.append(str(path))
            summary.reclaimed_staging_bytes += size_bytes
            continue
        try:
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path)
            else:
                path.unlink()
            summary.removed_staging.append(str(path))
            summary.reclaimed_staging_bytes += size_bytes
        except OSError as exc:
            summary.warnings.append(f"Failed to remove staging path {path}: {exc}")

    disk_paths = ["/", *config.tmp_roots]
    if docker_available:
        docker_root = _docker_data_root(runner)
        if docker_root:
            disk_paths.append(docker_root)
    summary.disk_usage, disk_warnings = check_disk_usage(disk_paths, config.disk_warn_pct)
    summary.warnings.extend(disk_warnings)
    return summary


def _acquire_lock(lock_path: str):
    candidates = [lock_path]
    if lock_path != FALLBACK_LOCK_PATH:
        candidates.append(FALLBACK_LOCK_PATH)
    last_exc: OSError | None = None
    for candidate in candidates:
        try:
            Path(candidate).parent.mkdir(parents=True, exist_ok=True)
            handle = open(candidate, "w")
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            return handle
        except OSError as exc:
            last_exc = exc
            continue
    raise RuntimeError(f"Unable to acquire lock: {last_exc}")


def format_human_summary(summary: CleanupSummary) -> str:
    lines = [
        f"Build cleanup {'(dry-run) ' if summary.dry_run else ''}completed:",
        f"  Kept project images ({len(summary.kept_images)}): {', '.join(summary.kept_images) or 'none'}",
        f"  Removed project images ({len(summary.removed_images)}): {', '.join(summary.removed_images) or 'none'}",
        f"  Removed staging paths ({len(summary.removed_staging)}, "
        f"{summary.reclaimed_staging_bytes / (1024 * 1024):.1f} MiB): "
        f"{', '.join(summary.removed_staging) or 'none'}",
    ]
    if summary.dangling_pruned:
        lines.append(f"  Dangling image prune: {summary.dangling_pruned.splitlines()[-1]}")
    if summary.builder_pruned:
        lines.append(f"  Builder cache prune: {summary.builder_pruned.splitlines()[-1]}")
    for mount, info in summary.disk_usage.items():
        lines.append(
            f"  Disk [{mount}]: {info['used_pct']}% used, "
            f"{info['free_bytes'] / (1024 ** 3):.2f} GiB free"
        )
    for warning in summary.warnings:
        lines.append(f"  WARNING: {warning}")
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Clean stale build history for new-api-custom.")
    parser.add_argument("--dry-run", action="store_true", help="Report what would be removed without deleting.")
    parser.add_argument("--json", action="store_true", help="Output summary as JSON.")
    args = parser.parse_args(argv)

    config = config_from_env(dry_run=args.dry_run)
    try:
        lock_handle = _acquire_lock(config.lock_path)
    except RuntimeError as exc:
        print(f"build-cleanup skipped: {exc}", file=sys.stderr)
        return 1

    try:
        summary = run_cleanup(config)
    finally:
        lock_handle.close()

    if args.json:
        payload = {
            "dry_run": summary.dry_run,
            "removed_images": summary.removed_images,
            "kept_images": summary.kept_images,
            "dangling_pruned": summary.dangling_pruned,
            "builder_pruned": summary.builder_pruned,
            "removed_staging": summary.removed_staging,
            "reclaimed_staging_bytes": summary.reclaimed_staging_bytes,
            "warnings": summary.warnings,
            "disk_usage": summary.disk_usage,
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(format_human_summary(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
