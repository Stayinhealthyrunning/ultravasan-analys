"""Independent Playwright browser acceptance checks for Ultravasan 2.0.

Run against a locally served ``docs`` directory after generating modular U3 data.
This suite uses Playwright's own browser/context/page API; it does not attach to CDP.
"""
from __future__ import annotations

import argparse
import json
import sys
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def ready(page) -> None:
    page.wait_for_function("() => window.ULTRAVASAN_ACTIVE_DATA?.results?.length > 0", timeout=60_000)
    page.wait_for_function("() => !document.querySelector('#loading') || document.querySelector('#loading').classList.contains('hidden')", timeout=60_000)


def family_full(page, family: str) -> None:
    page.evaluate("""async family => {
      if(state.raceFamily!==family){
        const button=document.querySelector(family==='uv45'?'#raceSwitch45':'#raceSwitch90');
        if(typeof button?.onclick==='function')await button.onclick();
      }
      await ensureActiveFamilyFull(family, true);
    }""", family)
    page.wait_for_function("family => state.raceFamily === family && state.dataPhase === 'full'", arg=family, timeout=60_000)


def choose_result(page, family: str, race_key: str, status: str):
    return page.evaluate("""({family,raceKey,status}) => {
      const race=state.data.races.find(r=>r.race_key===raceKey);
      if(!race || window.RaceContracts.familyForRace(race)!==family)return null;
      return state.data.results.find(row=>row.race_id===race.id&&row.status===status)?.id||null;
    }""", {"family": family, "raceKey": race_key, "status": status})


def open_result(page, result_id: int) -> None:
    page.evaluate("""id => {
      const result=state.data.results.find(row=>row.id===id);
      const race=state.data.races.find(row=>row.id===result?.race_id);
      const year=document.querySelector('#mainSearchYear');
      year.value=String(race.id);year.dispatchEvent(new Event('change',{bubbles:true}));
      const input=document.querySelector('#nameFilter');
      input.value=result.name_as_published;input.dispatchEvent(new Event('input',{bubbles:true}));
    }""", result_id)
    page.wait_for_selector(f"#mainRunnerSuggestions [data-id='{result_id}']", timeout=10_000)
    page.locator(f"#mainRunnerSuggestions [data-id='{result_id}']").click()
    page.wait_for_function("() => document.querySelector('#runnerDialog')?.open", timeout=10_000)


def run(base_url: str) -> None:
    errors: list[str] = []
    failed_responses: list[str] = []
    local_origin = base_url.rstrip("/")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1536, "height": 1024})
        page = context.new_page()
        leaflet_cdn_requests: list[str] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.on("request", lambda request: leaflet_cdn_requests.append(request.url) if
                "leaflet" in request.url.lower() and "127.0.0.1" not in request.url and "localhost" not in request.url else None)
        page.on("response", lambda response: failed_responses.append(f"{response.status} {response.url}")
                if response.status >= 400 and response.url.startswith(local_origin) else None)

        # Deep links, reload, invalid query normalization.
        for family, year in (("uv90", 2016), ("uv45", 2016)):
            page.goto(f"{base_url}?{urlencode({'race': family, 'year': year})}", wait_until="domcontentloaded")
            ready(page)
            page.wait_for_function("() => state.dataPhase === 'full'", timeout=60_000)
            page.wait_for_function("year => Number(state.data.races.find(r=>r.id===state.raceId)?.year) === year", arg=year, timeout=60_000)
            check(page.evaluate("() => state.raceFamily") == family, f"{family} deep link selected wrong race family")
            selected_year = page.evaluate("() => Number(state.data.races.find(r=>r.id===state.raceId)?.year)")
            check(selected_year == year, f"{family} deep link selected wrong year: {selected_year}")
            page.reload(wait_until="domcontentloaded")
            ready(page)
            check(page.evaluate("() => state.raceFamily") == family, f"{family} reload lost race family")

        page.goto(f"{base_url}?race=bogus&year=9999&sex=ZZ&status=<bad>", wait_until="domcontentloaded")
        ready(page)
        check(page.evaluate("() => ['uv90','uv45'].includes(state.raceFamily)"), "invalid URL params did not fail safe")

        # Open a real Hall of Fame map and verify the shared local Leaflet bootstrap is used.
        family_full(page, "uv90")
        page.evaluate("() => { nerd.hall='veterans'; renderHall(); }")
        page.locator("#hallOfFame .hall-row").first.click()
        page.wait_for_function("() => document.querySelector('#hallMapDialog')?.open && (window.L?.version === '1.9.4' || document.querySelector('#hallMapCanvas .hall-fallback-svg'))", timeout=15_000)
        hall_map = page.evaluate("""() => ({
          dialog:!!document.querySelector('#hallMapDialog')?.open,
          leaflet:window.L?.version||null,
          script:document.querySelector('script[data-ultravasan-leaflet]')?.getAttribute('src')||null,
          css:document.querySelector('link[data-ultravasan-leaflet]')?.getAttribute('href')||null,
          fallback:!!document.querySelector('#hallMapCanvas .hall-fallback-svg'),
          route:!!document.querySelector('#hallMapCanvas .leaflet-overlay-pane path')
        })""")
        check(hall_map["dialog"] and (hall_map["leaflet"] == "1.9.4" or hall_map["fallback"]),
              f"Hall of Fame map did not load local Leaflet or SVG fallback: {hall_map}")
        if hall_map["leaflet"]:
            check("vendor/leaflet-1.9.4/leaflet.js" in (hall_map["script"] or "") and
                  "vendor/leaflet-1.9.4/leaflet.css" in (hall_map["css"] or ""),
                  f"Hall of Fame did not use vendored local Leaflet: {hall_map}")
        check(not leaflet_cdn_requests, f"external Leaflet CDN request made: {leaflet_cdn_requests}")
        page.locator("#hallMapDialog .dialog-close").click()

        # Block the local vendor files and prove the real GPS route still renders through SVG fallback.
        fallback_page = context.new_page()
        intentional_fallback_errors: list[str] = []
        blocked_vendor_requests: list[str] = []
        fallback_page.on("pageerror", lambda error: errors.append(f"fallback:{error}"))
        fallback_page.on("console", lambda message: intentional_fallback_errors.append(message.text) if message.type == "error" else None)
        fallback_page.on("requestfailed", lambda request: blocked_vendor_requests.append(request.url)
                         if "/vendor/leaflet-1.9.4/leaflet." in request.url else None)
        fallback_page.route("**/vendor/leaflet-1.9.4/leaflet.*", lambda route: route.abort())
        fallback_page.goto(base_url, wait_until="domcontentloaded")
        ready(fallback_page)
        family_full(fallback_page, "uv90")
        fallback_page.evaluate("() => { nerd.hall='veterans'; renderHall(); }")
        fallback_page.locator("#hallOfFame .hall-row").first.click()
        fallback_page.wait_for_selector("#hallMapCanvas .hall-fallback-svg", timeout=15_000)
        fallback = fallback_page.evaluate("() => ({svg:!!document.querySelector('#hallMapCanvas .hall-fallback-svg'),note:document.querySelector('#hallMapCanvas .hall-map-fallback-note')?.textContent||'',dialog:!!document.querySelector('#hallMapDialog')?.open})")
        check(fallback["svg"] and fallback["dialog"] and "GPS-rutten" in fallback["note"],
              f"Hall map SVG fallback failed when local Leaflet was unavailable: {fallback}")
        check({url.rsplit("/", 1)[-1] for url in blocked_vendor_requests} == {"leaflet.css", "leaflet.js"},
              f"SVG fallback did not exercise failed local Leaflet JS and CSS requests: {blocked_vendor_requests}")
        check(all(message == "Failed to load resource: net::ERR_FAILED" for message in intentional_fallback_errors),
              f"unexpected browser console error during intentional vendor blocking: {intentional_fallback_errors}")
        fallback_page.close()

        # Browser history: mutate a real filter and race/year, then prove back/forward sync URL and state.
        family_full(page, "uv90")
        initial_race = page.evaluate("() => state.raceId")
        sex = page.locator("#sexFilter")
        sex.select_option("M")
        page.wait_for_function("() => new URL(location.href).searchParams.get('sex') === 'M'")
        page.go_back(wait_until="domcontentloaded")
        page.wait_for_timeout(200)
        page.go_forward(wait_until="domcontentloaded")
        page.wait_for_function("() => document.querySelector('#sexFilter')?.value === 'M' && new URL(location.href).searchParams.get('sex') === 'M'")
        page.locator("#yearFilter").select_option(label="2016")
        page.wait_for_function("() => Number(state.data.races.find(r=>r.id===state.raceId)?.year) === 2016")
        page.go_back(wait_until="domcontentloaded")
        page.wait_for_timeout(200)
        page.go_forward(wait_until="domcontentloaded")
        page.wait_for_function("() => Number(state.data.races.find(r=>r.id===state.raceId)?.year) === 2016 && new URL(location.href).searchParams.get('year') === '2016'")
        check(initial_race is not None, "history baseline race missing")

        # Real DOM XSS mutation: all source strings must remain text, never markup/tokens.
        security = page.evaluate("""() => {
          const row=state.filtered?.find(item=>item.status==='FINISHED');
          const profile=row&&window.RunnerAnalysis.profileForResult(state.data,row.id);
          const stop=profile?.journey?.rows.find(item=>item.source!=='start');
          if(!row||!stop)return {available:false};
          const old={status:row.status,name:row.name_as_published,club:row.club,city:row.city,age:row.age_class};
          const payloads=['FINISHED\" onmouseover=\"window.__pw_xss=1','<img src=x onerror=\"window.__pw_xss=2\">','<img src=x onerror=\"window.__pw_xss=3\">','<img src=x onerror=\"window.__pw_xss=4\">','<img src=x onerror=\"window.__pw_xss=5\">','<img src=x onerror=\"window.__pw_xss=6\">'];
          window.__pw_xss=0;
          try {
            Object.assign(row,{status:payloads[0],name_as_published:payloads[1],city:payloads[2],club:payloads[3],age_class:payloads[4]});
            renderTable();
            document.querySelector('#resultsBody .status')?.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
            const sandbox=document.createElement('div');
            sandbox.innerHTML=renderRunnerJourney({...profile,journey:{...profile.journey,rows:[{...stop,checkpoint_name:payloads[5]}]}});
            const status=document.querySelector('#resultsBody .status');
            const text=[...document.querySelectorAll('#resultsBody .runner-name,#resultsBody .runner-meta,#resultsBody tr td:nth-child(4),#resultsBody tr td:nth-child(5)')].map(n=>n.textContent||'');
            const attrs=[...document.querySelectorAll('#resultsBody [onerror],#resultsBody [onmouseover]'),...sandbox.querySelectorAll('[onerror],[onmouseover]')].length;
            const result={available:true,executed:window.__pw_xss,images:document.querySelectorAll('#resultsBody img').length+sandbox.querySelectorAll('img').length,attrs,statusClass:status?.className,text,checkpoint:sandbox.textContent||'',token:statusClassToken(payloads[0])};
            sandbox.remove();return result;
          } finally {Object.assign(row,{status:old.status,name_as_published:old.name,club:old.club,city:old.city,age_class:old.age});renderTable();delete window.__pw_xss;}
        }""")
        check(security.get("available") and security["executed"] == 0 and security["images"] == 0 and security["attrs"] == 0,
              f"XSS payload created executable DOM: {security}")
        check(security["token"] == "unknown" and "status unknown" in security["statusClass"] and
              all(value in " ".join(security["text"]) for value in ("<img", "onerror")) and
              "<img" in security["checkpoint"] and "onerror" in security["checkpoint"],
              f"XSS source text/token contract failed: {security}")

        # Club participation can span versions. The verified 2024-2025 whole-course
        # group may render a performance path, while participation bars remain broader.
        page.locator("#clubCompareSearch").fill("STOCKHOLM")
        page.wait_for_timeout(120)
        if page.locator("#clubCompareSuggestions .club-search-option").count():
            page.locator("#clubCompareSuggestions .club-search-option").first.click()
            page.wait_for_timeout(150)
        club = page.evaluate("""() => {
          const paths=[...document.querySelectorAll('#clubHistoryChart .club-history-line')];
          const bars=[...document.querySelectorAll('#clubHistoryChart .club-history-bar')];
          return {paths:paths.length,bars:bars.length};
        }""")
        check(club["paths"] >= 1 and club["bars"] > 0,
              f"Club history must render the verified 2024-2025 performance path while retaining participation bars: {club}")

        # Finish progression method levels and visible output.
        levels = page.locator("#percentileLadder [data-finish-share]").evaluate_all("nodes => nodes.map(n=>Number(n.dataset.finishShare))")
        check(levels == [10, 25, 50, 75, 90], f"finish progression levels changed: {levels}")

        # Exercise real finisher, DNF, DNS, and partial runner records via the UI.
        family_full(page, "uv90")
        representative = {}
        for key, status in (("ultravasan90-2016", "FINISHED"), ("ultravasan90-2016", "DNF"),
                            ("ultravasan90-2016", "DNS"), ("ultravasan90-2016", "DNF_PARTIAL")):
            result_id = page.evaluate("""({raceKey,status}) => {
              const race=state.data.races.find(r=>r.race_key===raceKey);
              return state.data.results.find(row=>row.race_id===race.id&&
                (status==='DNF_PARTIAL' ? row.status==='DNF' && window.RunnerAnalysis.profileForResult(state.data,row.id)?.journey?.recorded_rows>0 : row.status===status))?.id||null;
            }""", {"raceKey": key, "status": status})
            if result_id is None and status == "DNS":
                result_id = page.evaluate("""() => state.data.results.find(r=>r.status==='DNS'&&state.data.races.find(x=>x.id===r.race_id)?.race_family==='uv90')?.id||null""")
            check(result_id is not None, f"missing representative {status} for {key}")
            open_result(page, result_id)
            details = page.evaluate("""id => ({status:state.data.results.find(r=>r.id===id)?.status,
              replay:!!document.querySelector('#runnerDetail [data-runner-replay]'),rows:document.querySelectorAll('#runnerDetail .runner-journey-stop').length,
              devRows:document.querySelectorAll('#runnerDetail [data-development-distance]').length,
              journeyText:document.querySelector('#runnerDetail .runner-journey')?.innerText||''})""", result_id)
            check(details["replay"] and details["rows"] > 0, f"runner analysis did not render for result {result_id}: {details}")
            check(details["status"] == ("DNF" if status == "DNF_PARTIAL" else status), f"wrong representative result status: {details}")
            if status == "DNS":
                check("Ingen start registrerad" in details["journeyText"], f"DNS start copy is misleading: {details}")
            representative[status] = result_id
            if status == "FINISHED":
                devrow = page.locator("#runnerDetail [data-development-distance]").first
                before = page.locator("#runnerDetail [data-replay-value='distance']").inner_text()
                play_text = page.locator("#runnerDetail [data-replay-action='play']").inner_text()
                devrow.click()
                after = page.locator("#runnerDetail [data-replay-value='distance']").inner_text()
                paused = page.locator("#runnerDetail").evaluate("root => { const audio=root.querySelector('[data-replay-audio]'); return !audio || audio.paused; }")
                check(before != after and paused and page.locator("#runnerDetail [data-replay-action='play']").inner_text() == play_text,
                      "Runner Development seek unexpectedly autoplayed or failed to seek")
            page.locator("#runnerDialog").evaluate("d=>d.close()")

        # H2H verifies three distinct contracts:
        # same RaceEdition => finish + checkpoint dimensions;
        # verified 2024-2025 whole-course group => finish + checkpoint dimensions across editions;
        # different unverified CourseVersion => checkpoint/course dimensions blocked too.
        family_full(page, "uv90")
        h2h = page.evaluate("""() => {
          const data=window.ULTRAVASAN_ACTIVE_DATA;
          const r25=data.races.find(r=>r.race_key==='ultravasan90-2025'),r24=data.races.find(r=>r.race_key==='ultravasan90-2024'),r19=data.races.find(r=>r.race_key==='ultravasan90-2019');
          const a=data.results.find(r=>r.race_id===r25?.id&&r.status==='FINISHED'),b=data.results.find(r=>r.race_id===r24?.id&&r.status==='FINISHED'),c=data.results.find(r=>r.race_id===r19?.id&&r.status==='FINISHED');
          document.querySelector('#headToHeadDialog')?.open&&document.querySelector('#headToHeadDialog').close();
          compareState.raceId='all';compareState.selected=[];addCompareRunner(a?.id);addCompareRunner(b?.id);document.querySelector('#compareH2HButton')?.click();
          return {same:!!a&&!!b,course:!!document.querySelector('#headToHeadDetail .h2h-course-map svg'),elevation:!!document.querySelector('#headToHeadDetail .h2h-course-elevation svg'),placement:!!document.querySelector('#headToHeadDetail .h2h-placement svg'),checkpoints:document.querySelectorAll('#headToHeadDetail [data-h2h-checkpoint]').length,finishCards:document.querySelectorAll('#headToHeadDetail .h2h-finish-grid article').length,warnings:document.querySelectorAll('#headToHeadDetail .h2h-warning').length,changed:!!c,id:c?.id};
        }""")
        check(h2h["same"] and h2h["course"] and h2h["elevation"] and h2h["placement"] and h2h["checkpoints"] > 0 and h2h["finishCards"] == 2,
              f"verified 2024-2025 cross-edition H2H must expose finish and checkpoint comparison: {h2h}")

        same_edition = page.evaluate("""() => {
          document.querySelector('#headToHeadDialog')?.open&&document.querySelector('#headToHeadDialog').close();
          const data=window.ULTRAVASAN_ACTIVE_DATA,r25=data.races.find(r=>r.race_key==='ultravasan90-2025');
          const finishers=data.results.filter(r=>r.race_id===r25?.id&&r.status==='FINISHED').slice(0,2);
          compareState.selected=[];finishers.forEach(r=>addCompareRunner(r.id));document.querySelector('#compareH2HButton')?.click();
          return {count:finishers.length,finishCards:document.querySelectorAll('#headToHeadDetail .h2h-finish-grid article').length,checkpoints:document.querySelectorAll('#headToHeadDetail [data-h2h-checkpoint]').length};
        }""")
        check(same_edition["count"] == 2 and same_edition["finishCards"] == 2 and same_edition["checkpoints"] > 0,
              f"same-RaceEdition H2H must allow direct finish comparison: {same_edition}")

        blocked = page.evaluate("""id => {
          document.querySelector('#headToHeadDialog')?.open&&document.querySelector('#headToHeadDialog').close();
          const first=compareState.selected[0];compareState.selected=[];if(first)addCompareRunner(first.id);if(id)addCompareRunner(id);document.querySelector('#compareH2HButton')?.click();
          return {map:!!document.querySelector('#headToHeadDetail .h2h-course-map svg'),elevation:!!document.querySelector('#headToHeadDetail .h2h-course-elevation svg'),placement:!!document.querySelector('#headToHeadDetail .h2h-placement svg'),warnings:document.querySelectorAll('#headToHeadDetail .h2h-warning').length};
        }""", h2h["id"])
        check(not blocked["map"] and not blocked["elevation"] and not blocked["placement"] and blocked["warnings"] > 0,
              f"incompatible CourseVersion H2H was not blocked: {blocked}")

        # Real Playwright viewport changes (not emulated through CDP), no horizontal overflow.
        for width, height in ((390, 844), (900, 900), (1536, 1024)):
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_timeout(100)
            overflow = page.evaluate("() => Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)")
            check(overflow <= 2, f"horizontal overflow at {width}x{height}: {overflow}px")

        check(not errors, f"unexpected browser console/page errors: {errors}")
        check(not failed_responses, f"unexpected local HTTP errors: {failed_responses}")
        print(json.dumps({"status": "PASS", "scenarios": ["UV90/UV45 deep-link+reload", "invalid URL fail-safe", "Hall of Fame local Leaflet and CDN absence", "Hall of Fame SVG fallback", "history Back/Forward", "XSS DOM negative", "contract-aware club history", "finish progression", "Runner Development seek", "H2H comparison contracts", "FINISHED/DNF/DNS", "390/900/1536 viewports"], "representative_results": representative, "errors": errors, "http_errors": failed_responses}, ensure_ascii=False, indent=2))
        context.close()
        browser.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8765/")
    args = parser.parse_args()
    try:
        run(args.base_url)
    except Exception as error:
        print(f"PLAYWRIGHT E2E FAILED: {error}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
