"""Exercise installation only in temporary configuration directories."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPTS = Path(__file__).resolve().parent


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.config = Path(self.temp.name) / "Claude config with spaces"
        self.env = {**os.environ, "CLAUDE_CONFIG_DIR": str(self.config)}

    def install(self, success=True):
        result = subprocess.run(["node", str(SCRIPTS / "install.js")],
                                env=self.env, capture_output=True,
                                encoding="utf-8", timeout=10)
        self.assertEqual(result.returncode == 0, success, result.stderr)
        return result

    def read_settings(self):
        return json.loads((self.config / "settings.json").read_text(encoding="utf-8"))

    def check_command(self):
        command = self.read_settings()["statusLine"]["command"]
        if os.name == "nt":
            bash = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe"
            self.assertTrue(bash.exists(), "Git Bash is required for Windows integration tests")
            shells = [[str(bash), "-c"], ["powershell", "-NoProfile", "-Command"]]
        else:
            shells = [["/bin/bash", "-c"]]
        for shell in shells:
            with self.subTest(shell=shell[0]):
                result = subprocess.run(
                    [*shell, command], input='{"cost":{"total_cost_usd":1.23}}',
                    capture_output=True, encoding="utf-8", timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stderr, "")
                self.assertIn("API ~$1.23", result.stdout)

    def test_fresh_install_with_spaces(self):
        self.install()
        self.assertEqual((self.config / "claude-usage-statusline.js").read_bytes(),
                         (SCRIPTS / "usage-statusline.js").read_bytes())
        self.assertEqual(self.read_settings()["statusLine"]["padding"], 0)
        self.assertEqual(list(self.config.glob("*.bak.*")), [])
        self.check_command()

    def test_shell_characters_in_path(self):
        self.config = self.config / "user's $data `folder`"
        self.env["CLAUDE_CONFIG_DIR"] = str(self.config)
        self.install()
        self.check_command()

    def test_existing_settings_and_backups_survive_reinstall(self):
        self.config.mkdir()
        original = '\ufeff' + json.dumps({"enabledPlugins": {"example": True},
                                        "env": {"CUSTOM": "value"},
                                        "statusLine": {"type": "command", "command": "old", "padding": 3}})
        settings_path = self.config / "settings.json"
        settings_path.write_text(original, encoding="utf-8")
        old_bytes = settings_path.read_bytes()
        script_path = self.config / "claude-usage-statusline.js"
        script_path.write_bytes(b"old script")
        self.install()
        first = self.read_settings()
        self.assertEqual(first["env"], {"CUSTOM": "value"})
        self.assertEqual(first["enabledPlugins"], {"example": True})
        self.assertEqual(first["statusLine"]["padding"], 3)
        self.assertEqual(next(self.config.glob("settings.json.bak.*")).read_bytes(), old_bytes)
        self.assertEqual(next(self.config.glob("claude-usage-statusline.js.bak.*")).read_bytes(), b"old script")
        self.install()
        self.assertEqual(self.read_settings(), first)
        self.assertEqual(len(list(self.config.glob("settings.json.bak.*"))), 2)
        self.assertEqual(list(self.config.glob("*.tmp.*")), [])

    def test_bad_settings_do_not_change_files(self):
        self.config.mkdir()
        for content in ('{broken', '[]', 'null', '"text"'):
            with self.subTest(content=content):
                settings = self.config / "settings.json"
                settings.write_text(content, encoding="utf-8")
                self.install(success=False)
                self.assertEqual(settings.read_text(encoding="utf-8"), content)
                self.assertEqual(list(self.config.iterdir()), [settings])

    @unittest.skipIf(os.name == "nt", "Windows setup uses the Node entry point")
    def test_shell_wrapper(self):
        result = subprocess.run(["bash", str(SCRIPTS / "install.sh")],
                                env=self.env, capture_output=True,
                                encoding="utf-8", timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.check_command()


if __name__ == "__main__":
    unittest.main()
