"""Run with: python3 -m unittest discover -s plugins/usage-limits/scripts."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import unittest


SCRIPTS = Path(__file__).resolve().parent
ANSI = re.compile(r"\x1b\[[0-9;]*m")


class StatuslineCostTests(unittest.TestCase):
    def render(self, payload):
        outputs = []
        for command in (["node", str(SCRIPTS / "usage-statusline.js")],
                        [sys.executable, str(SCRIPTS / "usage-statusline.py")]):
            result = subprocess.run(command, input=json.dumps(payload), encoding="utf-8",
                                    capture_output=True, check=True, timeout=3)
            self.assertEqual(result.stderr, "")
            outputs.append(ANSI.sub("", result.stdout).strip())
        self.assertEqual(outputs[0], outputs[1])
        return outputs[0]

    def test_python_with_legacy_windows_encoding(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "usage-statusline.py")],
            input=json.dumps({"model": {"display_name": "Modèle"},
                              "rate_limits": {"five_hour": {"used_percentage": 20}}},
                             ensure_ascii=False),
            encoding="utf-8", capture_output=True, check=True, timeout=3,
            env={**os.environ, "PYTHONIOENCODING": "cp1252", "PYTHONUTF8": "0"})
        self.assertEqual(result.stderr, "")
        self.assertIn("Modèle", result.stdout)
        self.assertIn("▓░░░░", result.stdout)

    def test_cost_alongside_existing_segments(self):
        output = self.render({
            "model": {"display_name": "Opus"},
            "context_window": {"used_percentage": 34},
            "rate_limits": {
                "five_hour": {"used_percentage": 20},
                "seven_day": {"used_percentage": 40},
            },
            "cost": {"total_cost_usd": 1.234},
        })
        self.assertEqual(output, "[Opus] | 5h ▓░░░░ 80% left (?) | "
                         "7d ▓▓░░░ 60% left (?) | ctx 34% | API ~$1.23")

    def test_cost_without_limits(self):
        self.assertEqual(self.render({"cost": {"total_cost_usd": 12.346}}),
                         "API ~$12.35")

    def test_zero_is_available(self):
        self.assertEqual(self.render({"cost": {"total_cost_usd": 0}}),
                         "API ~$0.00")

    def test_missing_cost_preserves_existing_output(self):
        self.assertEqual(self.render({"model": {"display_name": "Opus"},
                                      "context_window": {"used_percentage": 34}}),
                         "[Opus] ctx 34%")
        for payload in ({}, {"cost": {}}, {"cost": None}):
            with self.subTest(payload=payload):
                self.assertEqual(self.render(payload), "limits n/a yet")

    def test_invalid_cost_is_hidden(self):
        for cost in (None, "1.23", True, -1, float("inf"), float("nan")):
            with self.subTest(cost=cost):
                self.assertEqual(self.render({"cost": {"total_cost_usd": cost}}),
                                 "limits n/a yet")


if __name__ == "__main__":
    unittest.main()
