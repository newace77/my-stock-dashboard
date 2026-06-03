import os
import re
import sys
import csv
import json
import time
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


def load_sheet_urls():
    summary_url = os.environ.get("SUMMARY_URL")
    holdings_url = os.environ.get("HOLDINGS_URL")
    history_url = os.environ.get("HISTORY_URL")

    config_path = os.path.join(os.path.dirname(__file__), "config.js")
    if os.path.exists(config_path) and not all([summary_url, holdings_url, history_url]):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                content = f.read()
            for key, var in [
                ("summaryURL", "summary_url"),
                ("holdingsURL", "holdings_url"),
                ("historyURL", "history_url"),
            ]:
                if not locals()[var]:
                    m = re.search(rf'{key}\s*:\s*["\']([^"\']*)["\']', content)
                    if m:
                        locals()[var]  # force eval — reassign below
            # Re-parse cleanly
            def _extract(key):
                m = re.search(rf'{key}\s*:\s*["\']([^"\']*)["\']', content)
                return m.group(1) if m else None

            if not summary_url:
                summary_url = _extract("summaryURL")
            if not holdings_url:
                holdings_url = _extract("holdingsURL")
            if not history_url:
                history_url = _extract("historyURL")
        except Exception as e:
            logger.warning("config.js 파싱 실패: %s", e)

    return summary_url, holdings_url, history_url


def fetch_csv_as_array(name, url, timeout=15, retries=3):
    if not url:
        logger.error("%s의 구글 시트 URL이 설정되지 않았습니다.", name)
        return []

    import requests

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }

    last_error = None
    for attempt in range(1, retries + 1):
        try:
            logger.info("구글 시트에서 %s 데이터 다운로드 중... (시도 %d/%d)", name, attempt, retries)
            response = requests.get(url, headers=headers, timeout=timeout)
            response.raise_for_status()

            csv_text = response.text
            if csv_text.strip().startswith(("<!DOCTYPE", "<html")):
                logger.error("%s CSV 대신 HTML을 받았습니다. 웹에 게시 설정을 다시 확인하세요.", name)
                return []

            rows = list(csv.reader(csv_text.splitlines()))
            logger.info("%s 데이터 수집 완료 (%d행)", name, len(rows))
            return rows
        except requests.HTTPError as e:
            logger.error("%s HTTP 에러: %s", name, e)
            return []
        except Exception as e:
            last_error = e
            if attempt < retries:
                wait = 2 ** attempt
                logger.warning("%s 재시도 %d/%d — %s (%.0f초 후)", name, attempt, retries, e, wait)
                time.sleep(wait)

    logger.error("%s 데이터 수집 실패: %s", name, last_error)
    return []


def main():
    logger.info("구글 시트 기반 자산 데이터 스냅샷 빌드 시작...")

    summary_url, holdings_url, history_url = load_sheet_urls()

    if not all([summary_url, holdings_url, history_url]):
        logger.error("설정된 구글 시트 URL이 부족합니다. config.js 또는 환경 변수를 확인해주세요.")
        sys.exit(1)

    summary_data = fetch_csv_as_array("Summary", summary_url)
    holdings_data = fetch_csv_as_array("Holdings", holdings_url)
    history_data = fetch_csv_as_array("History", history_url)

    if len(summary_data) < 3 or len(holdings_data) < 2:
        logger.error("수집된 데이터가 유효하지 않거나 비어 있어 업데이트를 중단합니다.")
        sys.exit(1)

    snapshot = {
        "summary": summary_data,
        "holdings": holdings_data,
        "history": history_data,
        "timestamp": int(time.time() * 1000),
    }

    snapshot_path = os.path.join(os.path.dirname(__file__), "data_snapshot.json")
    try:
        with open(snapshot_path, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, ensure_ascii=False, indent=2)
        logger.info("data_snapshot.json 저장 완료!")
    except Exception as e:
        logger.error("data_snapshot.json 저장 실패: %s", e)
        sys.exit(1)

    logger.info("모든 작업이 완료되었습니다!")


if __name__ == "__main__":
    main()
