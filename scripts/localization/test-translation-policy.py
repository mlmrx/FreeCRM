"""Run with Python directly; no translation runtime or network required."""

import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("translation_policy", Path(__file__).with_name("translation-policy.py"))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class TranslationPolicyTest(unittest.TestCase):
    def test_preserves_program_syntax(self):
        for source, category in [
            ('<?xml version="1.0"?><rss><channel>{0}</channel></rss>', "xml-document"),
            ('Bearer {0}', "http-protocol"),
            ('attachment; filename="{0}"', "http-protocol"),
            ('{0}={1}; Path=/; Max-Age=31536000; SameSite=Lax{2}', "http-protocol"),
            ('AND id NOT IN ({0})', "sql-expression"),
            ('git clone {0} free-crm cd free-crm npm ci', "shell-command"),
            ('FREE-CRM:document-delete-id:v1 {0} {1}', "confirmation-token"),
        ]:
            with self.subTest(source=source):
                self.assertEqual(policy.source_preservation_category(source), category)

    def test_does_not_exclude_ui_actions_or_safety_prose(self):
        for source in [
            'Delete', 'Update', 'Create table', 'Create task', 'Select all',
            'Select all from the current workspace',
            'No sign-in or API key',
            'No cloud account, identity provider, or API key is required.',
            'Emergency stop cleared; agent remains paused.',
            '{0} must be true or false.',
            'Run `npm run build` before deploying.',
        ]:
            with self.subTest(source=source):
                self.assertIsNone(policy.source_preservation_category(source))


if __name__ == "__main__":
    unittest.main()
