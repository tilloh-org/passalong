#!/usr/bin/env python3
"""Regression tests for the release candidate and backmerge shell scripts."""

from __future__ import annotations

import json
import os
import subprocess
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = REPOSITORY_ROOT / ".github" / "scripts"


class GitHubApiHandler(BaseHTTPRequestHandler):
    """Serve fixed GitHub API responses for one test case."""

    fixtures: dict[str, tuple[int, Any]] = {}

    def do_GET(self) -> None:  # noqa: N802 - HTTP handler API
        """Return the configured response for the requested path."""
        status, body = self.fixtures.get(self.path, (404, {"message": "Not Found"}))
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: object) -> None:
        """Suppress HTTP server logs during tests."""
        del format, args


class ReleaseFlowTests(unittest.TestCase):
    """Verify fail-closed guards and release-flow decisions."""

    def run_script(
        self, script: str, responses: dict[str, tuple[int, Any]]
    ) -> subprocess.CompletedProcess[str]:
        """Run a release-flow script against a temporary mock GitHub API."""
        GitHubApiHandler.fixtures = responses
        server = ThreadingHTTPServer(("127.0.0.1", 0), GitHubApiHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        env = os.environ.copy()
        env.update(
            {
                "API": f"http://127.0.0.1:{server.server_port}",
                "DRY_RUN": "1",
                "GH_TOKEN": "test-token",
                "REPO": "example/passalong",
            }
        )
        try:
            return subprocess.run(
                ["bash", str(SCRIPTS / script)],
                cwd=REPOSITORY_ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    @staticmethod
    def compare(
        *,
        ahead: int = 1,
        behind: int = 0,
        messages: list[str] | None = None,
        files: int = 1,
    ) -> dict[str, Any]:
        """Create a valid compare API fixture."""
        return {
            "ahead_by": ahead,
            "behind_by": behind,
            "commits": [
                {"commit": {"message": message}} for message in (messages or ["fix: test"])
            ],
            "files": [{"filename": f"file-{index}"} for index in range(files)],
        }

    def test_release_candidate_fails_when_develop_is_behind(self) -> None:
        """A stale merge base must block candidate creation."""
        result = self.run_script(
            "release-pr.sh",
            {
                "/repos/example/passalong/compare/main...develop": (
                    200,
                    self.compare(behind=1),
                )
            },
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("develop is 1 commit(s) behind main", result.stderr)

    def test_release_candidate_updates_title_for_breaking_change(self) -> None:
        """An existing candidate must be updated to a breaking title."""
        result = self.run_script(
            "release-pr.sh",
            {
                "/repos/example/passalong/compare/main...develop": (
                    200,
                    self.compare(messages=["feat!: replace storage format"]),
                ),
                "/repos/example/passalong/pulls?state=open&base=main&head=example:develop": (
                    200,
                    [{"number": 42, "html_url": "https://example.test/pr/42"}],
                ),
            },
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("feat!: merge develop into main", result.stdout)
        self.assertIn("Would update release candidate PR #42", result.stdout)

    def test_release_candidate_skips_contentless_backmerge(self) -> None:
        """A merge commit without a tree difference must not create a candidate."""
        result = self.run_script(
            "release-pr.sh",
            {
                "/repos/example/passalong/compare/main...develop": (
                    200,
                    self.compare(files=0, messages=["Merge main into develop"]),
                )
            },
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("No content changes to promote", result.stdout)

    def test_release_candidate_fails_closed_on_invalid_compare(self) -> None:
        """An incomplete API response must never bypass the guard."""
        result = self.run_script(
            "release-pr.sh",
            {"/repos/example/passalong/compare/main...develop": (200, {})},
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("invalid compare response", result.stderr)

    def test_backmerge_waits_for_release_please_pr(self) -> None:
        """Backmerge creation must wait until the release PR is merged."""
        result = self.run_script(
            "backmerge.sh",
            {
                "/repos/example/passalong/pulls?state=open&base=main": (
                    200,
                    [
                        {
                            "head": {"ref": "release-please--branches--main"},
                            "labels": [{"name": "autorelease: pending"}],
                        }
                    ],
                )
            },
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("deferring the backmerge", result.stdout)

    def test_backmerge_is_created_after_release_flow_settles(self) -> None:
        """A main commit without an open release PR must produce a backmerge."""
        result = self.run_script(
            "backmerge.sh",
            {
                "/repos/example/passalong/pulls?state=open&base=main": (200, []),
                "/repos/example/passalong/compare/develop...main": (
                    200,
                    self.compare(),
                ),
                "/repos/example/passalong/pulls?state=open&base=develop&head=example:main": (
                    200,
                    [],
                ),
            },
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Would create backmerge PR", result.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
