import os
import re
import sys
import datetime
import FinanceDataReader as fdr
from supabase import create_client, Client

# 1. config.js 또는 환경 변수에서 Supabase 설정 가져오기
def load_config():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    
    if url and key:
        return url, key
        
    config_path = os.path.join(os.path.dirname(__file__), 'config.js')
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                content = f.read()
                url_match = re.search(r'supabaseURL\s*:\s*["\']([^"\']*)["\']', content)
                key_match = re.search(r'supabaseKey\s*:\s*["\']([^"\']*)["\']', content)
                if url_match and not url:
                    url = url_match.group(1)
                if key_match and not key:
                    key = key_match.group(1)
        except Exception as e:
            print(f"⚠️ config.js 로드 실패: {e}")
            
    return url, key

supabase_url, supabase_key = load_config()

if not supabase_url or not supabase_key:
    print("❌ Supabase URL 또는 Key가 설정되지 않았습니다.")
    print("config.js에 설정하거나 환경 변수(SUPABASE_URL, SUPABASE_KEY)를 지정해주세요.")
    sys.exit(1)

# Supabase 클라이언트 초기화
supabase: Client = create_client(supabase_url, supabase_key)

# 2. FDR을 이용한 환율 및 주가/일일 변동률 수집 함수
def get_usd_krw_rate():
    try:
        today = datetime.date.today()
        start_date = today - datetime.timedelta(days=10)
        df = fdr.DataReader('USD/KRW', start=start_date.strftime('%Y-%m-%d'))
        if not df.empty:
            rate = float(df['Close'].iloc[-1])
            print(f"💵 최신 환율 수집 성공 (USD/KRW): {rate:.2f}원")
            return rate
    except Exception as e:
        print(f"⚠️ 환율 수집 실패: {e}")
    return 1350.0

def get_stock_data(ticker):
    """최근 종가와 전일 대비 변동률(%)을 함께 반환합니다."""
    try:
        today = datetime.date.today()
        start_date = today - datetime.timedelta(days=12)
        df = fdr.DataReader(ticker, start=start_date.strftime('%Y-%m-%d'))
        if not df.empty and len(df) >= 1:
            current_price = float(df['Close'].iloc[-1])
            daily_change = 0.0
            if len(df) >= 2:
                prev_close = float(df['Close'].iloc[-2])
                if prev_close > 0:
                    daily_change = ((current_price - prev_close) / prev_close) * 100.0
            return current_price, daily_change
    except Exception as e:
        print(f"⚠️ {ticker} 가격 수집 실패: {e}")
    return None, None

def main():
    print("🚀 자산 및 주가 동기화 배치 시작...")
    
    # 최신 환율 가져오기
    usd_krw_rate = get_usd_krw_rate()
    
    # 3. Supabase에서 모든 거래 기록 가져오기
    try:
        res = supabase.table("transactions").select("*").order("date", desc=False).order("created_at", desc=False).execute()
        txs = res.data
    except Exception as e:
        print(f"❌ 거래기록 조회 실패: {e}")
        return

    if not txs:
        print("ℹ️ 거래기록이 없습니다. 배치를 종료합니다.")
        return

    print(f"📦 총 {len(txs)}개의 거래 기록 로드 완료.")

    # 계좌별 현금 잔액 및 보유 주식 계산
    accounts_data = {}
    
    for tx in txs:
        acc = tx['account']
        stock_name = tx['stock_name']
        ticker = tx['stock_code']
        currency = tx['currency']
        tx_type = tx['type']
        qty = float(tx['quantity'] or 0)
        price = float(tx['price'] or 0)
        rate = float(tx['usd_krw_rate'] or 1.0)
        
        if acc not in accounts_data:
            accounts_data[acc] = {
                'cash_krw': 0.0,
                'holdings': {},
                'dividend_krw': 0.0
            }
            
        acc_info = accounts_data[acc]
        
        # 거래당 총액 (원화 기준)
        total_foreign = qty * price
        total_krw = total_foreign * rate
        
        if tx_type == "현금입금":
            acc_info['cash_krw'] += total_krw
        elif tx_type == "현금출금":
            acc_info['cash_krw'] -= abs(total_krw)
        elif tx_type == "배당금":
            acc_info['cash_krw'] += total_krw
            acc_info['dividend_krw'] += total_krw
        elif tx_type in ["매수", "매도"]:
            if ticker == "현금":
                continue
                
            holdings = acc_info['holdings']
            if ticker not in holdings:
                holdings[ticker] = {
                    'qty': 0.0,
                    'cost_sum_krw': 0.0,
                    'name': stock_name,
                    'currency': currency
                }
                
            h = holdings[ticker]
            
            if tx_type == "매수":
                h['qty'] += qty
                h['cost_sum_krw'] += total_krw
                acc_info['cash_krw'] -= total_krw
            elif tx_type == "매도":
                old_qty = h['qty']
                sell_qty = abs(qty)
                
                if old_qty > 0:
                    avg_price_krw = h['cost_sum_krw'] / old_qty
                    h['cost_sum_krw'] -= avg_price_krw * sell_qty
                    
                h['qty'] += qty
                # total_krw가 매도 거래로 인해 음수이므로, 캐시를 더할 때 절대값으로 더해줍니다.
                acc_info['cash_krw'] += abs(total_krw)
                
            if h['qty'] <= 0.0001:
                del holdings[ticker]

    # 4. 고유 티커 목록 추출하여 최신 가격 일괄 수집
    all_tickers = set()
    for acc, acc_info in accounts_data.items():
        all_tickers.update(acc_info['holdings'].keys())
        
    print(f"🔍 조회할 고유 주식 티커 목록: {list(all_tickers)}")
    
    ticker_prices = {}
    ticker_changes = {}
    for ticker in all_tickers:
        print(f"📊 {ticker} 가격 및 변동률 조회 중...")
        price, change = get_stock_data(ticker)
        if price is not None:
            ticker_prices[ticker] = price
            ticker_changes[ticker] = change or 0.0
            print(f"   -> 종가: {price:.2f}, 변동률: {change:+.2f}%")
        else:
            ticker_prices[ticker] = 0.0
            ticker_changes[ticker] = 0.0
            print(f"   ⚠️ {ticker} 가격 조회 실패. DB의 기존 보유 값을 참고하거나 0으로 처리합니다.")

    # 5. holdings 및 account_summary 테이블 업데이트 준비
    holdings_to_upsert = []
    summaries_to_upsert = []
    
    total_eval_all = 0
    total_invest_all = 0
    total_profit_all = 0
    total_div_all = 0
    
    # 먼저 각 계좌의 주식 평가금액 및 현금 잔고 계산하여 계좌별 총 평가금(total_eval) 산출
    for acc, acc_info in accounts_data.items():
        eval_total = acc_info['cash_krw']
        
        # 각 주식의 평가금 계산하여 누적
        for ticker, h in acc_info['holdings'].items():
            qty = h['qty']
            currency = h['currency']
            current_price_foreign = ticker_prices.get(ticker, 0.0)
            
            if current_price_foreign == 0.0:
                cost_krw = h['cost_sum_krw']
                avg_price_krw = cost_krw / qty if qty > 0 else 0.0
                current_price_foreign = avg_price_krw / usd_krw_rate if currency == 'USD' else avg_price_krw
                ticker_prices[ticker] = current_price_foreign
                
            current_price_krw = current_price_foreign * usd_krw_rate if currency == 'USD' else current_price_foreign
            eval_total += (qty * current_price_krw)
            
        # 계좌의 총 입금액 - 출금액을 투자금으로 산출
        acc_txs = [t for t in txs if t['account'] == acc]
        inflows = sum(float(t['quantity'] or 0) * float(t['price'] or 0) * float(t['usd_krw_rate'] or 1.0) for t in acc_txs if t['type'] == '현금입금')
        outflows = sum(abs(float(t['quantity'] or 0) * float(t['price'] or 0) * float(t['usd_krw_rate'] or 1.0)) for t in acc_txs if t['type'] == '현금출금')
        invest_total = inflows - outflows
        
        # 보유 종목 개별 세부 정보 계산 및 holdings_to_upsert 추가
        for ticker, h in acc_info['holdings'].items():
            qty = h['qty']
            cost_krw = h['cost_sum_krw']
            currency = h['currency']
            avg_price_krw = cost_krw / qty if qty > 0 else 0.0
            avg_price_foreign = avg_price_krw / usd_krw_rate if currency == 'USD' else avg_price_krw
            
            current_price_foreign = ticker_prices.get(ticker, 0.0)
            current_price_krw = current_price_foreign * usd_krw_rate if currency == 'USD' else current_price_foreign
            
            eval_krw = qty * current_price_krw
            profit_krw = eval_krw - cost_krw
            return_rate = (profit_krw / cost_krw * 100.0) if cost_krw > 0 else 0.0
            weight = (eval_krw / eval_total * 100.0) if eval_total > 0 else 0.0
            daily_change = ticker_changes.get(ticker, 0.0)
            
            holdings_to_upsert.append({
                'ticker': ticker,
                'account_name': acc,
                'stock_name': h['name'],
                'quantity': qty,
                'avg_price': avg_price_foreign,
                'currency': currency,
                'current_price': current_price_foreign,
                'eval_krw': eval_krw,
                'profit': profit_krw,
                'return_rate': round(return_rate, 2),
                'weight': round(weight, 2),
                'daily_change': round(daily_change, 2),
                'updated_at': datetime.datetime.now(datetime.timezone.utc).isoformat()
            })
            
        profit = eval_total - invest_total
        return_rate_acc = (profit / invest_total * 100.0) if invest_total > 0 else 0.0
        
        # 일일 변동 계산
        daily_change_pct = 0.0
        daily_change_amt = 0
        try:
            prev_summary = supabase.table("account_summary").select("eval_total").eq("account_name", acc).execute()
            if prev_summary.data:
                prev_eval = float(prev_summary.data[0]['eval_total'] or 0)
                if prev_eval > 0:
                    daily_change_amt = int(eval_total - prev_eval)
                    daily_change_pct = (daily_change_amt / prev_eval) * 100.0
        except Exception as e:
            print(f"⚠️ {acc} 이전 요약 조회 실패 (변동폭 0으로 설정): {e}")

        summaries_to_upsert.append({
            'account_name': acc,
            'eval_total': int(eval_total),
            'invest_total': int(invest_total),
            'profit': int(profit),
            'return_rate': round(return_rate_acc, 2),
            'daily_change_pct': round(daily_change_pct, 2),
            'daily_change_amt': int(daily_change_amt),
            'dividend': int(acc_info['dividend_krw']),
            'updated_at': datetime.datetime.now(datetime.timezone.utc).isoformat()
        })
        
        total_eval_all += eval_total
        total_invest_all += invest_total
        total_profit_all += profit
        total_div_all += acc_info['dividend_krw']

    # 6. Supabase에 데이터 반영
    try:
        supabase.table("holdings").delete().neq("ticker", "").execute()
        if holdings_to_upsert:
            supabase.table("holdings").insert(holdings_to_upsert).execute()
            print(f"✅ holdings 테이블 갱신 완료 ({len(holdings_to_upsert)}개 종목)")
    except Exception as e:
        print(f"❌ holdings 테이블 반영 실패: {e}")

    try:
        if summaries_to_upsert:
            supabase.table("account_summary").upsert(summaries_to_upsert).execute()
            print(f"✅ account_summary 테이블 갱신 완료 ({len(summaries_to_upsert)}개 계좌)")
    except Exception as e:
        print(f"❌ account_summary 테이블 반영 실패: {e}")

    today_str = datetime.date.today().strftime('%Y-%m-%d')
    history_data_db = {
        'record_date': today_str,
        'eval_total': int(total_eval_all),
        'invest_total': int(total_invest_all),
        'profit': int(total_profit_all),
        'dividend': int(total_div_all),
        'usd_krw_rate': usd_krw_rate,
        'updated_at': datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    
    try:
        supabase.table("asset_history").upsert(history_data_db).execute()
        print(f"✅ asset_history 테이블 오늘 자 스냅샷 갱신 완료 ({today_str})")
    except Exception as e:
        print(f"❌ asset_history 반영 실패: {e}")

    # 7. data_snapshot.json 로컬 덤프 생성 (폴백 및 고가용성 캐시)
    try:
        import json
        
        # A. Summary 어댑팅
        summary_data = [
            ["계좌명", "평가금", "투자금", "수입액", "수익률", "일일변동률", "일일변동액", "", "", "", "", "배당금"]
        ]
        for s in summaries_to_upsert:
            row = [
                s['account_name'],
                s['eval_total'],
                s['invest_total'],
                s['profit'],
                f"{s['return_rate']}%",
                f"{s['daily_change_pct']}%",
                s['daily_change_amt'],
                "", "", "", "",
                s['dividend']
            ]
            summary_data.append(row)
            
        # 합계 추가
        total_row = [
            "합계",
            int(total_eval_all),
            int(total_invest_all),
            int(total_profit_all),
            f"{(total_profit_all / total_invest_all * 100.0 if total_invest_all > 0 else 0.0):.2f}%",
            "0.00%", # 아래에서 갱신
            int(sum(s['daily_change_amt'] for s in summaries_to_upsert)),
            "", "", "", "",
            int(total_div_all)
        ]
        prev_sum_eval = total_eval_all - sum(s['daily_change_amt'] for s in summaries_to_upsert)
        sum_daily_pct = (sum(s['daily_change_amt'] for s in summaries_to_upsert) / prev_sum_eval * 100.0) if prev_sum_eval > 0 else 0.0
        total_row[5] = f"{sum_daily_pct:.2f}%"
        summary_data.append(total_row)
        
        # B. Holdings 어댑팅
        holdings_data = [
            ["종목명", "Ticker", "", "수량", "매수금액", "평균단가", "현재가", "수익률", "평가금액", "비중", "일일변동", "", "", "", "평가손익"]
        ]
        for h in holdings_to_upsert:
            cost_basis_krw = h['eval_krw'] - h['profit']
            row = [
                h['stock_name'],
                h['ticker'],
                "",
                h['quantity'],
                cost_basis_krw,
                h['avg_price'],
                h['current_price'],
                f"{h['return_rate']}%",
                h['eval_krw'],
                f"{h['weight']}%",
                f"{h['daily_change']}%",
                "", "", "",
                h['profit']
            ]
            holdings_data.append(row)
            
        # C. History 어댑팅
        res_history = supabase.table("asset_history").select("*").order("record_date", desc=False).execute()
        history_list = res_history.data or []
        history_data = [
            ["일자", "총 평가금", "총 투자금", "총 수입액", "", "", "", "", "", "", "", "총 배당금"]
        ]
        for item in history_list:
            row = [
                item['record_date'],
                item['eval_total'],
                item['invest_total'],
                item['profit'],
                "", "", "", "", "", "", "",
                item['dividend']
            ]
            history_data.append(row)
            
        snapshot = {
            "summary": summary_data,
            "holdings": holdings_data,
            "history": history_data,
            "timestamp": int(datetime.datetime.now().timestamp() * 1000)
        }
        
        snapshot_path = os.path.join(os.path.dirname(__file__), 'data_snapshot.json')
        with open(snapshot_path, 'w', encoding='utf-8') as f:
            json.dump(snapshot, f, ensure_ascii=False, indent=2)
        print("✅ data_snapshot.json 로컬 덤프 생성 완료!")
    except Exception as e:
        print(f"⚠️ data_snapshot.json 생성 실패: {e}")

    print("🎉 자산 및 주가 동기화 완료!")

if __name__ == "__main__":
    main()
