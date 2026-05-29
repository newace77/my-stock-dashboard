import os
import re
import sys
import csv
import json
import time
import urllib.request
import urllib.parse

# SSL 인증서 검증 비활성화 (보안 인증서가 만료된 환경 등에서 fetch 실패 방지)
import ssl
ssl._create_default_https_context = ssl._create_unverified_context

def load_sheet_urls():
    # 1. 환경 변수에서 구글 시트 URL 가져오기
    summary_url = os.environ.get("SUMMARY_URL")
    holdings_url = os.environ.get("HOLDINGS_URL")
    history_url = os.environ.get("HISTORY_URL")
    
    # 2. 환경 변수가 없으면 config.js 파일에서 파싱하기
    config_path = os.path.join(os.path.dirname(__file__), 'config.js')
    if os.path.exists(config_path) and (not summary_url or not holdings_url or not history_url):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                content = f.read()
                summary_match = re.search(r'summaryURL\s*:\s*["\']([^"\']*)["\']', content)
                holdings_match = re.search(r'holdingsURL\s*:\s*["\']([^"\']*)["\']', content)
                history_match = re.search(r'historyURL\s*:\s*["\']([^"\']*)["\']', content)
                if summary_match and not summary_url:
                    summary_url = summary_match.group(1)
                if holdings_match and not holdings_url:
                    holdings_url = holdings_match.group(1)
                if history_match and not history_url:
                    history_url = history_match.group(1)
        except Exception as e:
            print(f"⚠️ config.js 파싱 실패: {e}")
            
    return summary_url, holdings_url, history_url

def fetch_csv_as_array(name, url):
    if not url:
        print(f"❌ {name}의 구글 시트 URL이 설정되지 않았습니다.")
        return []
    
    try:
        print(f"📥 구글 시트에서 {name} 데이터 다운로드 중...")
        import requests
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        response = requests.get(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'},
            verify=False,
            timeout=15
        )
        if response.status_code != 200:
            print(f"❌ {name} HTTP 에러 발생: {response.status_code}")
            return []
            
        csv_text = response.text
        
        # HTML 응답이 들어왔는지 확인 (웹 로그인 세션 만료 등 방지)
        if csv_text.strip().startswith("<!DOCTYPE") or csv_text.strip().startswith("<html"):
            print(f"❌ {name} CSV 대신 HTML을 받았습니다. 웹에 게시 설정을 다시 확인하세요.")
            return []
            
        # CSV 파싱
        reader = csv.reader(csv_text.splitlines())
        rows = list(reader)
        print(f"   -> {name} 데이터 성공적으로 수집 ({len(rows)}행)")
        return rows
    except Exception as e:
        print(f"⚠️ {name} 데이터 수집 중 에러 발생: {e}")
        return []

def main():
    print("🚀 구글 시트 기반 자산 데이터 스냅샷 빌드 시작...")
    
    summary_url, holdings_url, history_url = load_sheet_urls()
    
    if not summary_url or not holdings_url or not history_url:
        print("❌ 설정된 구글 시트 URL이 부족합니다. config.js 또는 환경 변수를 확인해주세요.")
        sys.exit(1)
        
    summary_data = fetch_csv_as_array("Summary", summary_url)
    holdings_data = fetch_csv_as_array("Holdings", holdings_url)
    history_data = fetch_csv_as_array("History", history_url)
    
    # 유효성 검증 (정상적인 데이터인지 최소 행 개수 체크)
    if len(summary_data) < 3 or len(holdings_data) < 2:
        print("❌ 수집된 데이터가 유효하지 않거나 비어 있어 업데이트를 중단합니다.")
        sys.exit(1)
        
    snapshot = {
        "summary": summary_data,
        "holdings": holdings_data,
        "history": history_data,
        "timestamp": int(time.time() * 1000)
    }
    
    # data_snapshot.json 생성
    snapshot_path = os.path.join(os.path.dirname(__file__), 'data_snapshot.json')
    try:
        with open(snapshot_path, 'w', encoding='utf-8') as f:
            json.dump(snapshot, f, ensure_ascii=False, indent=2)
        print("✅ data_snapshot.json 덤프 파일 생성 완료!")
    except Exception as e:
        print(f"❌ data_snapshot.json 저장 실패: {e}")
        sys.exit(1)
        
    print("🎉 모든 작업이 완료되었습니다!")

if __name__ == "__main__":
    main()
