import json
import tempfile
import unittest
from pathlib import Path

import daemon as logger


class DaemonStoreTests(unittest.TestCase):
    def test_append_event_creates_site_daily_file(self):
        event = {
            "eventId": "1-deadbeef",
            "tsIso": "2026-04-21T12:00:00.000Z",
            "site": "chatgpt",
            "conversationId": "conv-1",
            "turnId": None,
            "role": "user",
            "text": "Hello",
            "extractionMode": "plain",
            "dedupeKey": "deadbeef",
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            path = logger.append_event(tmpdir, event)
            expected = Path(tmpdir) / "chatgpt" / "2026-04-21.json"

            self.assertEqual(path, expected)
            self.assertTrue(path.exists())

            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(payload["site"], "chatgpt")
            self.assertEqual(payload["date"], "2026-04-21")
            self.assertEqual(len(payload["events"]), 1)
            self.assertEqual(payload["events"][0]["eventId"], "1-deadbeef")

    def test_append_event_appends_without_overwrite(self):
        e1 = {
            "eventId": "1-aabbccdd",
            "tsIso": "2026-04-21T12:00:00.000Z",
            "site": "chatgpt",
            "role": "user",
            "text": "Prompt",
        }
        e2 = {
            "eventId": "2-eeff1122",
            "tsIso": "2026-04-21T12:00:01.000Z",
            "site": "chatgpt",
            "role": "assistant",
            "text": "Answer",
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            path1 = logger.append_event(tmpdir, e1)
            path2 = logger.append_event(tmpdir, e2)

            self.assertEqual(path1, path2)
            payload = json.loads(path2.read_text(encoding="utf-8"))
            self.assertEqual(len(payload["events"]), 2)
            self.assertEqual(payload["events"][0]["eventId"], "1-aabbccdd")
            self.assertEqual(payload["events"][1]["eventId"], "2-eeff1122")

    def test_append_event_rejects_invalid_site(self):
        bad = {
            "eventId": "1-xyz",
            "tsIso": "2026-04-21T12:00:00.000Z",
            "site": "unknown",
            "role": "user",
            "text": "Prompt",
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            with self.assertRaises(ValueError):
                logger.append_event(tmpdir, bad)


if __name__ == "__main__":
    unittest.main()
