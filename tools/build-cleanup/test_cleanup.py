import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import cleanup


class FakeRunner:
    def __init__(self, responses: dict[tuple[str, ...], subprocess.CompletedProcess[str]]):
        self.responses = responses
        self.calls: list[tuple[str, ...]] = []

    def __call__(self, cmd):
        key = tuple(cmd)
        self.calls.append(key)
        if key in self.responses:
            return self.responses[key]
        if len(cmd) >= 2 and cmd[0] == "docker" and cmd[1] == "inspect":
            return self.responses.get(("docker", "inspect"), subprocess.CompletedProcess(cmd, 0, "", ""))
        if len(cmd) >= 3 and cmd[0] == "docker" and cmd[1] == "image" and cmd[2] == "inspect":
            return self.responses.get(("docker", "image", "inspect"), subprocess.CompletedProcess(cmd, 0, "", ""))
        if len(cmd) >= 3 and cmd[0] == "docker" and cmd[1] == "image" and cmd[2] == "rm":
            return subprocess.CompletedProcess(cmd, 0, f"Untagged: {cmd[3]}\n", "")
        if len(cmd) >= 3 and cmd[0] == "docker" and cmd[1] == "image" and cmd[2] == "prune":
            return subprocess.CompletedProcess(cmd, 0, "Total reclaimed space: 0B\n", "")
        if len(cmd) >= 3 and cmd[0] == "docker" and cmd[1] == "builder" and cmd[2] == "prune":
            return subprocess.CompletedProcess(cmd, 0, "Total: 1.5GB\n", "")
        return subprocess.CompletedProcess(cmd, 1, "", f"unexpected command: {cmd}")


class BuildCleanupTests(unittest.TestCase):
    def test_select_stale_images_protects_active_newest_and_recent(self):
        now = 1_800_000_000.0
        records = [
            cleanup.DockerImageRecord("new-api-custom", "newest-1", "sha256:111", now - 36000),
            cleanup.DockerImageRecord("new-api-custom", "newest-2", "sha256:222", now - 40000),
            cleanup.DockerImageRecord("new-api-custom", "recent-brand-new", "sha256:333", now - 1800),
            cleanup.DockerImageRecord("new-api-custom", "old-active", "sha256:444", now - 200000),
            cleanup.DockerImageRecord("new-api-custom", "old-shared-tag", "sha256:222", now - 200000),
            cleanup.DockerImageRecord("new-api-custom", "old-stale-a", "sha256:555", now - 90000),
            cleanup.DockerImageRecord("new-api-custom", "old-stale-b", "sha256:666", now - 100000),
        ]
        to_remove, to_keep = cleanup.select_stale_images(
            records=records,
            active_image_ids={"sha256:444"},
            keep_images=2,
            min_age_hours=2.0,
            now=now,
        )
        self.assertEqual([r.tag for r in to_remove], ["old-stale-a", "old-stale-b"])
        self.assertEqual(
            [r.tag for r in to_keep],
            ["recent-brand-new", "newest-1", "newest-2", "old-active", "old-shared-tag"],
        )

    def test_find_stale_staging_entries_respects_age_locks_worktree_and_open_fds(self):
        now = 1_800_000_000.0
        old_mtime = now - (8 * 3600)
        fresh_mtime = now - (1 * 3600)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)

            stale_dir = root / "dragonapi-old-image"
            stale_dir.mkdir()
            stale_file = stale_dir / "new-api"
            stale_file.write_bytes(b"123456")
            os.utime(stale_file, (old_mtime, old_mtime))
            os.utime(stale_dir, (old_mtime, old_mtime))

            fresh_dir = root / "dragonapi-fresh-image"
            fresh_dir.mkdir()
            fresh_file = fresh_dir / "new-api"
            fresh_file.write_bytes(b"abc")
            os.utime(fresh_file, (fresh_mtime, fresh_mtime))
            os.utime(fresh_dir, (old_mtime, old_mtime))

            open_dir = root / "lab-open-image"
            open_dir.mkdir()
            open_file = open_dir / "new-api"
            open_file.write_bytes(b"xyz")
            os.utime(open_file, (old_mtime, old_mtime))
            os.utime(open_dir, (old_mtime, old_mtime))

            worktree_dir = root / "dragonlab-expand"
            worktree_dir.mkdir()
            (worktree_dir / ".git").write_text("gitdir: /repo/.git/worktrees/x\n")
            os.utime(worktree_dir, (old_mtime, old_mtime))

            lock_file = root / "dragon-lab-reset.lock"
            lock_file.write_text("")
            os.utime(lock_file, (old_mtime, old_mtime))

            unrelated = root / "unrelated-user-file.log"
            unrelated.write_text("keep")
            os.utime(unrelated, (old_mtime, old_mtime))

            stale = cleanup.find_stale_staging_entries(
                roots=[tmpdir],
                patterns=cleanup.DEFAULT_STAGING_PATTERNS,
                max_age_hours=6.0,
                now=now,
                open_targets={open_file.resolve()},
            )

        self.assertEqual([(p.name, sz) for p, sz in stale], [("dragonapi-old-image", 6)])

    def test_run_cleanup_dry_run_does_not_delete_images_or_files(self):
        now = 1_800_000_000.0
        old_mtime = now - (10 * 3600)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            staging = root / "lab-workbench-image"
            staging.mkdir()
            binary = staging / "new-api"
            binary.write_bytes(b"abcd")
            os.utime(binary, (old_mtime, old_mtime))
            os.utime(staging, (old_mtime, old_mtime))

            runner = FakeRunner(
                {
                    ("docker", "ps", "-a", "-q"): subprocess.CompletedProcess([], 0, "c1\n", ""),
                    ("docker", "inspect"): subprocess.CompletedProcess([], 0, "sha256:active\n", ""),
                    (
                        "docker",
                        "images",
                        "--no-trunc",
                        "--format",
                        "{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}",
                        "new-api-custom",
                    ): subprocess.CompletedProcess(
                        [],
                        0,
                        "\n".join(
                            [
                                "new-api-custom\tv3\tsha256:active\t178MB",
                                "new-api-custom\tv2\tsha256:v2\t178MB",
                                "new-api-custom\tv1\tsha256:v1\t178MB",
                            ]
                        )
                        + "\n",
                        "",
                    ),
                    ("docker", "image", "inspect"): subprocess.CompletedProcess(
                        [],
                        0,
                        "\n".join(
                            [
                                "sha256:active\t2026-11-27T10:00:00Z",
                                "sha256:v2\t2026-11-26T10:00:00Z",
                                "sha256:v1\t2026-11-25T10:00:00Z",
                            ]
                        )
                        + "\n",
                        "",
                    ),
                    ("docker", "info", "--format", "{{.DockerRootDir}}"): subprocess.CompletedProcess(
                        [], 0, tmpdir + "\n", ""
                    ),
                }
            )
            cfg = cleanup.CleanupConfig(
                keep_images=2,
                min_image_age_hours=1.0,
                tmp_roots=(tmpdir,),
                tmp_max_age_hours=6.0,
                dry_run=True,
            )
            summary = cleanup.run_cleanup(cfg, runner=runner, now=1_795_800_000.0 + 360000, open_targets=set())
            # Wait: 2026-11-27 in epoch is ~1795773600; check with fixed timestamp so v1 is old.
            self.assertTrue(staging.exists())
            self.assertEqual(summary.removed_staging, [str(staging)])
            self.assertFalse(any(cmd[:3] == ("docker", "image", "rm") for cmd in runner.calls))

    def test_run_cleanup_executes_image_and_staging_removal(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            staging = root / "dragonapi-old-image"
            staging.mkdir()
            binary = staging / "new-api"
            binary.write_bytes(b"12345678")
            old_mtime = 1_795_000_000.0
            os.utime(binary, (old_mtime, old_mtime))
            os.utime(staging, (old_mtime, old_mtime))

            runner = FakeRunner(
                {
                    ("docker", "ps", "-a", "-q"): subprocess.CompletedProcess([], 0, "c1\n", ""),
                    ("docker", "inspect"): subprocess.CompletedProcess([], 0, "sha256:active\n", ""),
                    (
                        "docker",
                        "images",
                        "--no-trunc",
                        "--format",
                        "{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}",
                        "new-api-custom",
                    ): subprocess.CompletedProcess(
                        [],
                        0,
                        "\n".join(
                            [
                                "new-api-custom\tv3\tsha256:active\t178MB",
                                "new-api-custom\tv2\tsha256:v2\t178MB",
                                "new-api-custom\tv1\tsha256:v1\t178MB",
                            ]
                        )
                        + "\n",
                        "",
                    ),
                    ("docker", "image", "inspect"): subprocess.CompletedProcess(
                        [],
                        0,
                        "\n".join(
                            [
                                "sha256:active\t2026-11-27T10:00:00Z",
                                "sha256:v2\t2026-11-26T10:00:00Z",
                                "sha256:v1\t2026-11-25T10:00:00Z",
                            ]
                        )
                        + "\n",
                        "",
                    ),
                    ("docker", "info", "--format", "{{.DockerRootDir}}"): subprocess.CompletedProcess(
                        [], 0, tmpdir + "\n", ""
                    ),
                }
            )
            cfg = cleanup.CleanupConfig(
                keep_images=2,
                min_image_age_hours=2.0,
                tmp_roots=(tmpdir,),
                tmp_max_age_hours=6.0,
                dry_run=False,
            )
            now = 1_795_800_000.0
            summary = cleanup.run_cleanup(cfg, runner=runner, now=now, open_targets=set())
            self.assertEqual(summary.removed_images, ["new-api-custom:v1"])
            self.assertEqual(summary.removed_staging, [str(staging)])
            self.assertEqual(summary.reclaimed_staging_bytes, 8)
            self.assertFalse(staging.exists())
            self.assertIn(("docker", "image", "rm", "new-api-custom:v1"), runner.calls)


if __name__ == "__main__":
    unittest.main()
