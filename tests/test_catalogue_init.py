#!/usr/bin/env python3
from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import uvtool  # noqa: E402


class CatalogueInitTests(unittest.TestCase):
    def test_fresh_init_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            db_path = Path(temp) / "fresh.sqlite"
            uvtool.init_db(db_path, uvtool.DEFAULT_CONFIG)
            first = self.snapshot(db_path)
            uvtool.init_db(db_path, uvtool.DEFAULT_CONFIG)
            self.assertEqual(first, self.snapshot(db_path))
            self.assertEqual(2, len(first["races"]))

    def test_imported_uv90_checkpoint_model_is_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            db_path = Path(temp) / "historical.sqlite"
            conn = uvtool.connect(db_path)
            conn.executescript((ROOT / "tools" / "schema.sql").read_text(encoding="utf-8"))
            source_id = conn.execute(
                "INSERT INTO sources(code,name,source_type) VALUES('fixture','Fixture','test')"
            ).lastrowid
            race_id = conn.execute("""
                INSERT INTO races(race_key,name,year,distance_km,course_version)
                VALUES('ultravasan90-2025','Historisk UV90',2025,92.0,'imported-model')
            """).lastrowid
            historical = [
                ("start", "Start Sälen", 0, 0.0),
                ("high_point", "Högsta punkten", 1, 3.3),
                ("smagan", "Smågan", 2, 10.84),
                ("mangsbodarna", "Mångsbodarna", 3, 25.34),
                ("risberg", "Risberg", 4, 36.4),
                ("evertsberg", "Evertsberg", 5, 48.73),
                ("oxberg", "Oxberg", 6, 63.5),
                ("hokberg", "Hökberg", 7, 72.67),
                ("eldris", "Eldris", 8, 82.81),
                ("mora", "Mora mål", 9, 92.0),
            ]
            conn.executemany(
                "INSERT INTO checkpoints(race_id,checkpoint_key,name,sequence_no,distance_km) VALUES(?,?,?,?,?)",
                [(race_id, *row) for row in historical],
            )
            athlete_id = conn.execute("""
                INSERT INTO athletes(canonical_name,normalized_name) VALUES('Fixture Runner','fixture runner')
            """).lastrowid
            conn.execute("""
                INSERT INTO results(race_id,athlete_id,source_id,source_result_id,name_as_published,status,finish_seconds)
                VALUES(?,?,?,?,?,'FINISHED',18000)
            """, (race_id, athlete_id, source_id, "fixture-1", "Fixture Runner"))
            conn.commit()
            before = [tuple(row) for row in conn.execute(
                "SELECT checkpoint_key,name,sequence_no,distance_km FROM checkpoints WHERE race_id=? ORDER BY sequence_no",
                (race_id,),
            )]
            conn.close()

            uvtool.init_db(db_path, uvtool.DEFAULT_CONFIG)
            uvtool.init_db(db_path, uvtool.DEFAULT_CONFIG)

            conn = uvtool.connect(db_path)
            after = [tuple(row) for row in conn.execute(
                "SELECT checkpoint_key,name,sequence_no,distance_km FROM checkpoints WHERE race_id=? ORDER BY sequence_no",
                (race_id,),
            )]
            race = conn.execute("SELECT distance_km,course_version FROM races WHERE id=?", (race_id,)).fetchone()
            self.assertEqual(before, after)
            self.assertEqual((92.0, "imported-model"), tuple(race))
            self.assertEqual(1, conn.execute("SELECT COUNT(*) FROM results WHERE race_id=?", (race_id,)).fetchone()[0])
            conn.close()

    def test_catalogue_transaction_rolls_back_on_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            db_path = Path(temp) / "rollback.sqlite"
            bad_config = Path(temp) / "bad-races.json"
            config = {
                "races": [{
                    "race_key": "broken-2025", "name": "Broken", "year": 2025,
                    "checkpoints": [
                        {"checkpoint_key": "a", "name": "A", "sequence_no": 0},
                        {"checkpoint_key": "b", "name": "B", "sequence_no": 0},
                    ],
                }]
            }
            bad_config.write_text(json.dumps(config), encoding="utf-8")
            with self.assertRaises(sqlite3.IntegrityError):
                uvtool.init_db(db_path, bad_config)
            conn = uvtool.connect(db_path)
            self.assertIsNone(conn.execute("SELECT id FROM races WHERE race_key='broken-2025'").fetchone())
            self.assertEqual(0, conn.execute("SELECT COUNT(*) FROM checkpoints").fetchone()[0])
            conn.close()

    @staticmethod
    def snapshot(db_path: Path) -> dict[str, list[tuple]]:
        conn = uvtool.connect(db_path)
        snapshot = {
            "races": [tuple(row) for row in conn.execute(
                "SELECT race_key,name,year,distance_km,event_code,course_version FROM races ORDER BY race_key"
            )],
            "checkpoints": [tuple(row) for row in conn.execute("""
                SELECT r.race_key,c.checkpoint_key,c.name,c.sequence_no,c.distance_km
                FROM checkpoints c JOIN races r ON r.id=c.race_id
                ORDER BY r.race_key,c.sequence_no
            """)],
        }
        conn.close()
        return snapshot


if __name__ == "__main__":
    unittest.main()
