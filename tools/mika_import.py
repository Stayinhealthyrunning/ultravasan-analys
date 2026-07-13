#!/usr/bin/env python3
"""Robust importer for Vasaloppet's public Mika result pages.

The importer is designed for GitHub Actions and requires no local installation.
It uses ordinary HTTP first.  An optional Playwright fallback can open the same
public pages in a real browser when a hosting network receives HTTP 403.

Commands:
  probe     Test list parsing and a limited number of participant details.
  scrape    Import the complete configured race.
  discover  Find Ultravasan 90 and Ultravasan 45 event codes from Mika's event catalogue.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

import uvtool

ROOT = Path(__file__).resolve().parents[1]


def resolve_raw_path(path: Path) -> Path:
    """Resolve relative CLI raw paths from the caller's working directory."""
    return path.expanduser().resolve()


def merge_query(url: str, **values: Any) -> str:
    parsed = urlparse(url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    for key, value in values.items():
        if value is None:
            query.pop(key, None)
        else:
            query[key] = [str(value)]
    flat = []
    for key, vals in query.items():
        for value in vals:
            flat.append((key, value))
    return urlunparse(parsed._replace(query=urlencode(flat)))


class Fetcher:
    def __init__(self, delay: float, browser_fallback: bool, force: bool):
        self.delay = max(0.0, delay)
        self.browser_fallback = browser_fallback
        self.force = force
        self.session = uvtool.create_session()
        self._pw = self._browser = self._context = self._page = None

    def close(self) -> None:
        if self._context:
            self._context.close()
        if self._browser:
            self._browser.close()
        if self._pw:
            self._pw.stop()

    def _browser_html(self, url: str) -> tuple[str, int]:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise RuntimeError("Playwright saknas. Installera requirements-browser.txt i GitHub Actions.") from exc
        if not self._pw:
            self._pw = sync_playwright().start()
            self._browser = self._pw.chromium.launch(headless=True)
            self._context = self._browser.new_context(
                locale="sv-SE",
                user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                            "Chrome/150.0.0.0 Safari/537.36"),
                viewport={"width": 1440, "height": 1100},
            )
            self._page = self._context.new_page()
        response = self._page.goto(url, wait_until="domcontentloaded", timeout=90_000)
        self._page.wait_for_timeout(800)
        return self._page.content(), response.status if response else 200

    def get(self, url: str, cache: Path) -> tuple[str, int, bool, str]:
        if cache.exists() and not self.force:
            return cache.read_text(encoding="utf-8", errors="replace"), 200, True, "cache"
        cache.parent.mkdir(parents=True, exist_ok=True)
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                response = self.session.get(url, timeout=75, allow_redirects=True)
                if response.status_code == 403 and self.browser_fallback:
                    html, status = self._browser_html(url)
                    cache.write_text(html, encoding="utf-8")
                    time.sleep(self.delay)
                    return html, status, False, "browser"
                if response.status_code in {429, 500, 502, 503, 504}:
                    time.sleep(min(15, attempt * 3))
                    continue
                response.raise_for_status()
                response.encoding = response.apparent_encoding or response.encoding or "utf-8"
                cache.write_text(response.text, encoding="utf-8")
                time.sleep(self.delay)
                return response.text, response.status_code, False, "http"
            except Exception as exc:
                last_error = exc
                if attempt < 3:
                    time.sleep(attempt * 2)
        if self.browser_fallback:
            html, status = self._browser_html(url)
            cache.write_text(html, encoding="utf-8")
            time.sleep(self.delay)
            return html, status, False, "browser"
        raise RuntimeError(f"Kunde inte hämta {url}: {last_error}")


def extract_entries(html: str, base_url: str) -> list[dict[str, Any]]:
    """Return participant links plus list-page metadata when available."""
    soup = BeautifulSoup(html, "lxml")
    entries: dict[str, dict[str, Any]] = {}
    for link in soup.select("a[href*='idp=']"):
        href = urljoin(base_url, link.get("href", ""))
        idp = parse_qs(urlparse(href).query).get("idp", [None])[0]
        if not idp:
            continue
        container = link.find_parent(["li", "tr", "article", "div"])
        entry = entries.setdefault(idp, {"idp": idp, "url": href})
        name = uvtool.clean_text(link.get_text(" ", strip=True))
        if name:
            entry.setdefault("name", name)
        if container:
            for field, selectors in uvtool.FIELD_SELECTORS.items():
                value = uvtool.first_selector_text(container, selectors)
                if value:
                    entry.setdefault(field, value)
            entry["list_text"] = uvtool.clean_text(container.get_text(" ", strip=True))
    return sorted(entries.values(), key=lambda x: x["idp"])


def apply_fallback(parsed: uvtool.ParsedResult, summary: dict[str, Any]) -> uvtool.ParsedResult:
    parsed.name = parsed.name if parsed.name and not parsed.name.startswith("Okänd löpare") else summary.get("name") or parsed.name
    for attr in ["bib", "age_class", "nationality", "club", "city", "start_group"]:
        if not getattr(parsed, attr, None) and summary.get(attr):
            setattr(parsed, attr, uvtool.clean_text(summary[attr]))
    if not parsed.sex and summary.get("sex"):
        parsed.sex = uvtool.sex_code(summary.get("sex"), parsed.age_class)
    if parsed.finish_seconds is None:
        parsed.finish_seconds = uvtool.parse_time(summary.get("finish_time") or summary.get("net_time") or summary.get("gun_time"))
    if parsed.overall_place is None:
        parsed.overall_place = uvtool.parse_int(summary.get("overall_place"))
    if parsed.gender_place is None:
        parsed.gender_place = uvtool.parse_int(summary.get("gender_place"))
    if parsed.class_place is None:
        parsed.class_place = uvtool.parse_int(summary.get("class_place"))
    parsed.name, parsed.nationality = uvtool.clean_name_and_nationality(parsed.name, parsed.nationality)
    return parsed


def list_url_candidates(race: dict[str, Any], page: int, sex: str | None = None) -> list[str]:
    if race.get("page_url_templates"):
        urls = [u.format(page=page) for u in race["page_url_templates"]]
        return [merge_query(url, **({"search[sex]": sex} if sex else {})) for url in urls]
    if race.get("page_url_template"):
        primary = race["page_url_template"].format(page=page)
    else:
        path = race.get("result_year_path") or 2026
        primary = f"https://results.vasaloppet.se/{path}/?page={page}&event={race['event_code']}&pid=search&num_results=100"
    sex_query = {"search[sex]": sex} if sex else {}
    return [
        merge_query(primary, page=page, pid="search", num_results=100, **sex_query),
        merge_query(primary, page=page, pid="list", num_results=100, **sex_query),
        merge_query(primary, page=page, pid="search", **sex_query),
    ]


def detail_url(race: dict[str, Any], idp: str, discovered: str) -> str:
    if race.get("detail_url_template"):
        return race["detail_url_template"].format(idp=idp)
    path = race.get("result_year_path") or 2026
    return f"https://results.vasaloppet.se/{path}/?content=detail&event={race['event_code']}&idp={idp}"


def start_run(conn, race_row, source_row) -> int:
    run_id = conn.execute("INSERT INTO import_runs(source_id,race_id) VALUES(?,?)", (source_row["id"], race_row["id"])).lastrowid
    conn.commit()
    return run_id


def execute(args: argparse.Namespace, probe: bool) -> None:
    uvtool.init_db(args.db, args.config)
    config = uvtool.load_config(args.config)
    race_cfg = uvtool.get_race_config(config, args.race)
    if not race_cfg.get("event_code"):
        raise SystemExit("Loppet saknar event_code. Kör discover först eller fyll i config/races.json.")
    conn = uvtool.connect(args.db)
    race_row = conn.execute("SELECT * FROM races WHERE race_key=?", (args.race,)).fetchone()
    source = conn.execute("SELECT * FROM sources WHERE code='vasaloppet_mika'").fetchone()
    run_id = start_run(conn, race_row, source)
    fetcher = Fetcher(args.delay, args.browser_fallback, args.force)
    race_raw = resolve_raw_path(args.raw) / args.race
    report = {"race_key": args.race, "event_code": race_cfg.get("event_code"), "pages": [], "details": [], "started_at": uvtool.utc_now()}
    all_entries: dict[str, dict[str, Any]] = {}
    empty_pages = 0
    try:
        max_pages = min(args.max_pages, race_cfg.get("max_pages", args.max_pages))
        partitions = ["M", "W"] if race_cfg.get("partition_by_sex") else [None]
        for sex_partition in partitions:
            empty_pages = 0
            partition_label = sex_partition or "ALL"
            for page_no in range(1, max_pages + 1):
                page_entries: list[dict[str, Any]] = []
                selected_html = None
                used_url = used_mode = None
                used_status = None
                used_cache = None
                errors = []
                # The result service has historically accepted several URL forms.
                # Prefer the first variant that yields genuinely new idp values;
                # otherwise a server that silently repeats page 1 could make a
                # full import stop after only 100 runners.
                for variant, url in enumerate(list_url_candidates(race_cfg, page_no, sex_partition), 1):
                    cache = race_raw / "lists" / partition_label / f"page-{page_no:03d}-v{variant}.html"
                    try:
                        html, status, cached, mode = fetcher.get(url, cache)
                        entries = extract_entries(html, url)
                        new_ids = [entry["idp"] for entry in entries if entry["idp"] not in all_entries]
                        errors.append({
                            "url": url,
                            "status": status,
                            "entries": len(entries),
                            "new": len(new_ids),
                            "mode": mode,
                            "cached": cached,
                        })
                        if entries and (not page_entries or len(new_ids) > sum(1 for e in page_entries if e["idp"] not in all_entries)):
                            page_entries = entries
                            selected_html = html
                            used_url = url
                            used_mode = mode
                            used_status = status
                            used_cache = cache
                        if new_ids:
                            break
                    except Exception as exc:
                        errors.append({"url": url, "error": str(exc)})
                if selected_html is not None and used_url and used_cache:
                    uvtool.record_source_page(
                        conn,
                        run_id,
                        source["id"],
                        race_row["id"],
                        "result_list",
                        f"{partition_label}:{page_no}",
                        used_url,
                        used_status or 200,
                        used_cache,
                        selected_html,
                    )
                new_count = 0
                for entry in page_entries:
                    if entry["idp"] not in all_entries:
                        all_entries[entry["idp"]] = entry
                        new_count += 1
                report["pages"].append({
                    "partition": partition_label,
                    "page": page_no,
                    "entries": len(page_entries),
                    "new": new_count,
                    "total": len(all_entries),
                    "url": used_url,
                    "mode": used_mode,
                    "attempts": errors,
                })
                print(
                    f"{partition_label} sida {page_no}: {len(page_entries)} träffar, "
                    f"{new_count} nya, totalt {len(all_entries)}"
                )
                if new_count == 0:
                    empty_pages += 1
                    if empty_pages >= race_cfg.get("empty_pages_to_stop", 2):
                        break
                else:
                    empty_pages = 0
                if args.limit and len(all_entries) >= args.limit:
                    break
            if args.limit and len(all_entries) >= args.limit:
                break

        if not all_entries:
            raise RuntimeError("Inga deltagarlänkar hittades. Rapporten visar testade URL-varianter och HTTP-fel.")

        checkpoints = race_cfg.get("checkpoints", [])
        items = list(all_entries.values())[: args.limit or None]
        inserted = updated = warnings = 0
        for index, entry in enumerate(items, 1):
            idp = entry["idp"]
            url = detail_url(race_cfg, idp, entry["url"])
            cache = race_raw / "details" / f"{re.sub(r'[^A-Za-z0-9_.-]', '_', idp)}.html"
            try:
                html, status, cached, mode = fetcher.get(url, cache)
                uvtool.record_source_page(conn, run_id, source["id"], race_row["id"], "participant_detail", idp, url, status, cache, html)
                external_id = f"{race_cfg['event_code']}:{idp}"
                parsed = apply_fallback(uvtool.parse_detail_html(html, external_id, url, checkpoints), entry)
                _, is_new = uvtool.save_result(conn, race_row["id"], source["id"], race_row["distance_km"], checkpoints, parsed)
                inserted += int(is_new); updated += int(not is_new)
                report["details"].append({"idp": idp, "name": parsed.name, "splits": len(parsed.splits or []), "status": parsed.status, "mode": mode, "cached": cached})
                print(f"[{index}/{len(items)}] {parsed.name}: {len(parsed.splits or [])} passager ({mode})")
            except Exception as exc:
                warnings += 1
                report["details"].append({"idp": idp, "error": str(exc)})
                print(f"VARNING {idp}: {exc}", file=sys.stderr)
            if index % 20 == 0:
                conn.commit()
        status = "probe-complete" if probe else "complete"
        conn.execute("UPDATE import_runs SET finished_at=?,status=?,records_seen=?,records_inserted=?,records_updated=?,warnings=? WHERE id=?",
                     (uvtool.utc_now(), status, len(items), inserted, updated, warnings, run_id))
        conn.commit()
        report.update({"finished_at": uvtool.utc_now(), "records": len(items), "inserted": inserted, "updated": updated, "warnings": warnings, "status": status})
    except Exception as exc:
        conn.execute("UPDATE import_runs SET finished_at=?,status='failed',message=? WHERE id=?", (uvtool.utc_now(), str(exc), run_id))
        conn.commit()
        report.update({"finished_at": uvtool.utc_now(), "status": "failed", "error": str(exc)})
        raise
    finally:
        fetcher.close(); conn.close()
        report_path = ROOT / "reports" / f"{args.race}-{'probe' if probe else 'import'}.json"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Importlogg: {report_path}")


def discover(args: argparse.Namespace) -> None:
    fetcher = Fetcher(args.delay, args.browser_fallback, args.force)
    found: dict[tuple[int, str], dict[str, Any]] = {}
    raw_root = resolve_raw_path(args.raw)
    try:
        for path_year in args.path_years:
            url = f"https://results.vasaloppet.se/{path_year}/?pid=list"
            cache = raw_root / "catalogue" / f"events-{path_year}.html"
            html, status, cached, mode = fetcher.get(url, cache)
            soup = BeautifulSoup(html, "lxml")
            candidates = []
            for node in soup.select("option[value], a[href*='event=']"):
                text = uvtool.clean_text(node.get_text(" ", strip=True)) or ""
                value = node.get("value") or node.get("href") or ""
                if "event=" in value:
                    event = parse_qs(urlparse(urljoin(url, value)).query).get("event", [None])[0]
                else:
                    event = value
                if event and "ultravasan" in uvtool.normalize(text) and re.search(r"\b(?:45|90)\b", text):
                    candidates.append((event, text))
            for event, text in candidates:
                year_match = re.search(r"20\d{2}", text)
                event_year = int(year_match.group()) if year_match else int(re.search(r"(\d{2})(?:\d{2})?$", event).group(1)) + 2000 if re.search(r"(\d{2})(?:\d{2})?$", event) else path_year
                found[(event_year, event)] = {"year": event_year, "event_code": event, "label": text, "result_year_path": path_year, "catalogue_url": url, "mode": mode, "cached": cached, "status": status}
    finally:
        fetcher.close()
    result = sorted(found.values(), key=lambda x: (x["year"], x["event_code"]))
    out = ROOT / "reports" / "discovered-ultravasan-events.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print(f"Sparat: {out}")


def common(sub: argparse.ArgumentParser) -> None:
    sub.add_argument("--race", required=True)
    sub.add_argument("--db", type=Path, default=uvtool.DEFAULT_DB)
    sub.add_argument("--config", type=Path, default=uvtool.DEFAULT_CONFIG)
    sub.add_argument("--raw", type=Path, default=uvtool.DEFAULT_RAW)
    sub.add_argument("--delay", type=float, default=1.2)
    sub.add_argument("--force", action="store_true")
    sub.add_argument("--browser-fallback", action="store_true", help="Använd Playwright om vanlig HTTP blockeras")
    sub.add_argument("--max-pages", type=int, default=250)
    sub.add_argument("--limit", type=int, default=0)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    q = sub.add_parser("probe", help="Testa listan och några detaljsidor")
    common(q); q.set_defaults(limit=10)
    s = sub.add_parser("scrape", help="Importera hela loppet")
    common(s)
    d = sub.add_parser("discover", help="Sök eventkoder för Ultravasan 90 och 45")
    d.add_argument("--path-years", type=int, nargs="+", default=[2026, 2025, 2024, 2023, 2022, 2021, 2019, 2018, 2017, 2016, 2015, 2014])
    d.add_argument("--raw", type=Path, default=uvtool.DEFAULT_RAW)
    d.add_argument("--delay", type=float, default=1.0)
    d.add_argument("--force", action="store_true")
    d.add_argument("--browser-fallback", action="store_true")
    return p


def main() -> None:
    args = parser().parse_args()
    if args.command == "probe": execute(args, probe=True)
    elif args.command == "scrape": execute(args, probe=False)
    else: discover(args)


if __name__ == "__main__":
    main()
