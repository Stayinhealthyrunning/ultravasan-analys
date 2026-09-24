#!/usr/bin/env python3
"""Visual/browser regression checks for the U20 remediation."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright


VIEWPORTS = ((1536, 1024), (1366, 768), (900, 900), (390, 844))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def ready(page) -> None:
    page.wait_for_function("() => window.ULTRAVASAN_ACTIVE_DATA?.results?.length > 0", timeout=60_000)
    page.wait_for_function("() => !document.querySelector('#loading') || document.querySelector('#loading').classList.contains('hidden')", timeout=60_000)


def run(base_url: str, screenshots: Path | None = None) -> dict:
    errors: list[str] = []
    local_http_errors: list[str] = []
    expected_tile_console: list[str] = []
    tile_failure_active = {"value": False}
    report: dict = {"status": "PASS", "viewports": {}, "hall_tile_fallback": None,
                    "course_intelligence": None, "console_errors": errors,
                    "local_http_errors": local_http_errors}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1536, "height": 1024})
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        def collect_console(message):
            if message.type != "error":
                return
            if tile_failure_active["value"] and "403" in message.text:
                expected_tile_console.append(message.text)
            else:
                errors.append(message.text)
        page.on("console", collect_console)
        origin = base_url.split("/", 3)[:3]
        local_origin = "/".join(origin)
        page.on("response", lambda response: local_http_errors.append(f"{response.status} {response.url}")
                if response.status >= 400 and response.url.startswith(local_origin) else None)
        page.goto(f"{base_url}?{urlencode({'race': 'uv90', 'year': 2026})}", wait_until="domcontentloaded")
        ready(page)
        page.wait_for_function("() => (document.querySelector('#raceFingerprint')?.innerText || '').includes('2023, 2024, 2025')", timeout=30_000)
        fingerprint = page.evaluate("""() => {
          const race=state.data.races.find(r=>r.race_key==='ultravasan90-2026');
          const model=window.HistoryIntelligence.fingerprint(state.data,race,{currentResults:state.data.results.filter(r=>r.race_id===race.id),referenceResults:state.data.results,minReferenceYears:2});
          return {years:model.performance_reference_years,exclusions:model.performance_exclusions.map(x=>({year:x.year,reason:x.reason})),
            visible:document.querySelector('#raceFingerprint')?.innerText||''};
        }""")
        report["uv90_2026_fingerprint"] = fingerprint
        require(fingerprint["years"] == [2023, 2024, 2025], f"2026 whole-course historical reference years are wrong: {fingerprint['years']}")
        require("2023, 2024, 2025" in fingerprint["visible"] and "0 verifierade whole-course" not in fingerprint["visible"],
                f"2026 fingerprint UI does not show actual reference years/count: {fingerprint['visible']}")
        page.locator("#clubCompareSearch").fill("STOCKHOLM")
        page.wait_for_timeout(120)
        if page.locator("#clubCompareSuggestions .club-search-option").count():
            page.locator("#clubCompareSuggestions .club-search-option").first.click()
            page.wait_for_timeout(180)

        for width, height in VIEWPORTS:
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_timeout(120)
            page.evaluate("""() => { const e=document.querySelector('#courseIntelligenceCard'); window.scrollTo(0,Math.max(0,e.getBoundingClientRect().top+scrollY-16)); }""")
            metrics = page.evaluate("""() => {
              const card=document.querySelector('#courseIntelligenceCard');
              const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight}};
              return {viewport:[innerWidth,innerHeight],documentWidth:document.documentElement.scrollWidth,
                card:box(card),summary:box(document.querySelector('#courseIntelligenceSummary')),
                route:box(document.querySelector('#courseRouteView')),elevation:box(document.querySelector('#courseElevationView')),
                pace:box(document.querySelector('#coursePaceView')),narrative:box(document.querySelector('#courseSegmentNarrative')),
                table:box(document.querySelector('.course-intelligence-table-wrap')),plan:box(document.querySelector('#courseRacePlan')),
                infoTips:card?.querySelectorAll(':scope > .panel-head .info-tip').length||0,
                planInfoTips:document.querySelectorAll('#courseRacePlan .info-tip').length,
                paceRows:[...document.querySelectorAll('#coursePaceView .course-pace-row')].map(e=>{const r=e.getBoundingClientRect();return{y:r.y,h:r.height,children:[...e.children].map(c=>{const q=c.getBoundingClientRect();return{x:q.x,y:q.y,w:q.width,h:q.height}})}}),
                rows:document.querySelectorAll('#courseIntelligenceRows tr').length,
                clubHistory:box(document.querySelector('#clubHistoryChart')),
                clubSeries:document.querySelectorAll('#clubHistoryChart .club-history-line').length,
                clubFont:getComputedStyle(document.querySelector('#clubHistoryChart text')||document.body).fontSize,
                race:state.data.races.find(r=>r.id===state.raceId)?.race_key};
            }""")
            require(metrics["documentWidth"] <= width + 2, f"horizontal overflow at {width}x{height}: {metrics['documentWidth']-width}px")
            report["viewports"][f"{width}x{height}"] = metrics
            if screenshots:
                screenshots.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(screenshots / f"course-intelligence-{width}x{height}.png"), full_page=False)
                page.evaluate("""() => { const e=document.querySelector('#clubHistoryChart'); if(e)window.scrollTo(0,Math.max(0,e.getBoundingClientRect().top+scrollY-16)); }""")
                page.screenshot(path=str(screenshots / f"club-history-{width}x{height}.png"), full_page=False)

        course = report["viewports"]["1536x1024"]
        report["course_intelligence"] = course
        require(course["rows"] > 0, "Course Intelligence segment table is empty")
        require(course["infoTips"] == 1 and course["planInfoTips"] == 1,
                f"duplicate/missing contextual Course Intelligence method icons: {course['infoTips']}/{course['planInfoTips']}")

        # Force a realistic tile failure after opening the actual Hall of Fame route.
        page.set_viewport_size({"width": 1536, "height": 1024})
        page.evaluate("""async()=>{if(state.raceFamily!=='uv90')await document.querySelector('#raceSwitch90')?.click();await ensureActiveFamilyFull('uv90',true);nerd.hall='veterans';renderHall();}""")
        page.route("https://*.tile.openstreetmap.org/**", lambda route: route.fulfill(status=403, content_type="image/png", body=b""))
        tile_failure_active["value"] = True
        page.locator("#hallOfFame .hall-row").first.click()
        page.wait_for_function("() => document.querySelector('#hallMapDialog')?.open", timeout=10_000)
        page.wait_for_function("() => document.querySelector('#hallMapCanvas .hall-map-fallback-note') || document.querySelector('#hallMapCanvas .hall-fallback-svg')", timeout=10_000)
        hall = page.evaluate("""() => ({fallback:!!document.querySelector('#hallMapCanvas .hall-fallback-svg'),note:document.querySelector('#hallMapCanvas .hall-map-fallback-note')?.textContent||'',
          tiles:document.querySelectorAll('#hallMapCanvas .leaflet-tile').length,broken:[...document.querySelectorAll('#hallMapCanvas img.leaflet-tile')].filter(i=>!i.complete||!i.naturalWidth).length,
          routeSegments:document.querySelectorAll('#hallMapCanvas .hall-fallback-svg path[stroke]').length,
          legend:document.querySelectorAll('#hallSegmentLegend .hall-segment-item').length,checkpoints:document.querySelectorAll('#hallMapCanvas .hall-fallback-svg circle').length})""")
        report["hall_tile_fallback"] = hall
        require(hall["fallback"], f"Hall map did not switch to the neutral GPS-route fallback after tile failure: {hall}")
        require(hall["tiles"] == 0 and hall["broken"] == 0, f"failed/broken tiles remain visible: {hall}")
        require(hall["routeSegments"] > 0 and hall["legend"] > 0 and hall["checkpoints"] > 0,
                f"GPS segments/checkpoints/runner segment legend were lost in fallback: {hall}")
        tile_failure_active["value"] = False

        page.locator("#hallMapDialog .dialog-close").click()

        # Repeat the deliberate tile failure on the replay/map page.
        map_page = context.new_page()
        map_page.on("pageerror", lambda error: errors.append(f"map:{error}"))
        map_tile_failure = {"value": True}
        def collect_map_console(message):
            if message.type == "error":
                if map_tile_failure["value"] and "403" in message.text:
                    expected_tile_console.append(message.text)
                else:
                    errors.append(f"map:{message.text}")
        map_page.on("console", collect_map_console)
        map_page.on("response", lambda response: local_http_errors.append(f"{response.status} {response.url}")
                    if response.status >= 400 and response.url.startswith(local_origin) else None)
        map_page.route("https://*.tile.openstreetmap.org/**", lambda route: route.fulfill(status=403, content_type="image/png", body=b""))
        map_page.goto(f"{local_origin}/karta.html?race=uv90&year=2026", wait_until="domcontentloaded")
        map_page.wait_for_function("() => document.querySelector('#mapLoading')?.classList.contains('hidden')", timeout=60_000)
        map_page.wait_for_function("() => document.querySelector('#fallbackMap')?.classList.contains('visible')", timeout=15_000)
        main_map = map_page.evaluate("""() => ({fallback:document.querySelector('#fallbackMap')?.classList.contains('visible'),
          mapDisplay:getComputedStyle(document.querySelector('#map')).display,
          routes:document.querySelectorAll('#fallbackMap path.fallback-route').length,
          runners:document.querySelectorAll('#fallbackMap .fallback-runner').length,
          brokenTiles:[...document.querySelectorAll('#map img.leaflet-tile')].filter(i=>!i.complete||!i.naturalWidth).length,
          routeOnly:window.__ultravasanMapState?.routeOnly})""")
        report["main_map_tile_fallback"] = main_map
        require(main_map["fallback"] and main_map["mapDisplay"] == "none" and main_map["routes"] > 0 and main_map["runners"] > 0 and main_map["brokenTiles"] == 0,
                f"main map did not switch to clean vector route with runners after tile failure: {main_map}")
        map_tile_failure["value"] = False
        map_page.close()
        require(not errors, f"browser console/page errors: {errors}")
        require(not local_http_errors, f"local HTTP errors: {local_http_errors}")
        context.close()
        browser.close()
    report["expected_blocked_tile_console_errors"] = expected_tile_console
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8765/")
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    report = run(args.base_url, args.screenshots)
    summary = {
        "status": report.get("status"),
        "viewports": list(report.get("viewports", {})),
        "fingerprint_reference_years": report.get("uv90_2026_fingerprint", {}).get("years"),
        "hall_tile_fallback": report.get("hall_tile_fallback"),
        "main_map_tile_fallback": report.get("main_map_tile_fallback"),
        "unexpected_console_or_page_errors": report.get("console_errors", []),
        "local_http_errors": report.get("local_http_errors", []),
        "screenshots": str(args.screenshots) if args.screenshots else None,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
