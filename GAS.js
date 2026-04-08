/**
 * 🐶 바둑이 주식 대시보드 - Google Apps Script (Backend)
 * 
 * [사용 방법]
 * 1. 구글 시트에서 [확장 프로그램] > [Apps Script] 클릭
 * 2. 이 파일(GAS.js)의 내용을 복사해서 붙여넣기
 * 3. 아래 accountMap의 "ID_입력" 부분을 각 계좌 파일의 실제 ID로 교체하세요.
 * 4. [배포] > [새 배포] (유형: 웹 앱, 액세스 권한: 모든 사용자)
 * 5. 생성된 웹 앱 URL을 홈페이지의 script.js 내 gasURL에 입력하세요.
 */

function doPost(e) {
  var data = JSON.parse(e.postData.contents);

  // 💡 [추가] 시장 지수만 즉시 새로고침하는 명령 처리
  if (data.command === "refresh_market") {
    try {
      // 메인 스프레드시트(Summary 시트가 있는 곳) ID 사용
      var ssId = "1YNMIqwg6mJjUFGtWEMRSPKNCJGcPMfKgyg_S0gkEVFw"; 
      var ss = SpreadsheetApp.openById(ssId);
      updateMarketData(ss);
      return ContentService.createTextOutput("Market Data Updated").setMimeType(ContentService.MimeType.TEXT);
    } catch (err) {
      return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
    }
  }

  // 💡 1. 7개 계좌명과 파일 ID를 정확히 매핑하세요.
  // 계좌명은 홈페이지(index.html)의 <option value="..."> 값과 일치해야 합니다.
  var accountMap = {
    "AJM": "1YNMIqwg6mJjUFGtWEMRSPKNCJGcPMfKgyg_S0gkEVFw",
    "AJMjr": "1aN52-xHUQm5ZmQOk6I9HLTVxCKMeMuYQoGcNlxCEIEI",
    "JJG-w-AJM": "1vdWQhHIEHk2mZHPCDzDnbDhYoqYCFE7m8LRk8xaXOUs",
    "JJG-w-KKO": "1Q0q2v60zcf-mfuQS8MiO1pBfSFo3YxVIZ7yo2TWBX3s",
    "JJG-w-AJMjr": "1m2zurh2hmMgYOWMo-t7BNagu2AkyK2EoygdMS594mj0",
    "JJG-w-AJM-ISA": "1Q1Sw-Z2doUvJNw1bAh351b8ZR9UFVbtnAsg5M6Js7sg",
    "JJG-w-KKO-ISA": "1GRz4BgS0SF5bsl7D2oo9z0BNkvqob9b2Mzd3QYVrVjY"
  };

  try {
    var ssId = accountMap[data.account];
    if (!ssId || ssId.includes("ID_입력")) {
      throw new Error("계좌 ID가 설정되지 않았습니다. Apps Script 코드를 확인하세요.");
    }

    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName("record");

    if (!sheet) {
      throw new Error("'record' 시트를 찾을 수 없습니다.");
    }

    var lastRow = sheet.getLastRow();
    var nextRow = lastRow + 1;

    // 💡 1. 종목명/티커 자동 매칭 로직
    var stockName = data.stockName || data.ticker || "";
    var stockCode = data.ticker || "";

    // 현금 입출금이 아닌 경우에만 티커 보완 로직 실행
    if (data.type !== "현금입금" && data.type !== "현금출금") {
      // 만약 티커가 이름과 동일하거나 부족한 경우, Holdings 시트나 과거 기록 참조
      if (!stockCode || stockCode === stockName || !stockCode.includes(":")) {
        // 1-A. 먼저 Holdings 시트에서 찾아보기
        var holdingsSheet = ss.getSheetByName("Holdings");
        if (holdingsSheet) {
          var hData = holdingsSheet.getDataRange().getValues();
          for (var i = 1; i < hData.length; i++) {
            if (hData[i][0] == stockName || hData[i][1] == stockName) {
              stockName = hData[i][0];
              stockCode = hData[i][1];
              break;
            }
          }
        }

        // 1-B. 여전히 못 찾았다면 과거 기록(record 시트) 참조
        if ((!stockCode || stockCode === stockName) && lastRow > 1) {
          var history = sheet.getRange(Math.max(2, lastRow - 500), 2, Math.min(lastRow - 1, 500), 2).getValues();
          for (var i = history.length - 1; i >= 0; i--) {
            if (history[i][0] == stockName || history[i][1] == stockName) {
              stockName = history[i][0];
              stockCode = history[i][1];
              break;
            }
          }
        }
      }
    }

    // 💡 2. 배당금, 현금성 거래 예외 처리
    var displayType = data.type; // 기본 거래 종류
    if (data.type === "현금입금" || data.type === "현금출금") {
      stockName = "현금"; 
      stockCode = "현금"; 
      if (data.type === "현금출금") {
        displayType = "현금인출"; 
      }
    } else if (data.type === "배당금") {
      stockName = stockName || "현금";
      stockCode = stockCode || "현금";
    }
    // "매수", "매도"는 위 조건에 해당하지 않으므로 stockName/stockCode가 유지됨

    var price = parseFloat(data.price) || 0;
    var qty = parseFloat(data.quantity) || 0;

    // 💡 매도 또는 현금출금 시 수량을 음수(-)로 보정
    if (data.type.includes("매도") || data.type.includes("출금")) {
      qty = -Math.abs(qty);
    }

    // 💡 현금 입금/출금/배당금의 경우: 입력한 숫자를 G열(가격)에 배치
    if (["현금입금", "현금출금", "배당금"].includes(data.type)) {
      if (price === 0) {
        price = Math.abs(qty); // 수량/금액 칸에 입력한 숫자를 G열(단가)로 이동
        qty = (qty < 0 ? -1 : 1); // 수량은 1 또는 -1로 고정
      }
    }
    var total = price * qty;

    // 💡 3. 데이터 입력 준비 (A~L열)
    var rowData = [
      data.date,      // 1. 날짜 (A)
      stockName,      // 2. 종목명 (B)
      stockCode,      // 3. 종목코드 (C)
      data.currency,  // 4. 통화 (D)
      displayType,    // 5. 종류 (E)
      (data.currency == "KRW" ? price : ""), // 6. 가격원 (F)
      price,          // 7. 가격외 (G)
      qty,            // 8. 수량 (H)
      (data.currency == "KRW" ? total : ""), // 9. 총액원 (I)
      total,          // 10. 총액외 (J)
      "",             // 11. 보유수량 (K) - 수식 복사 예정
      ""              // 12. 환율 (L) - USD인 경우에만 입력 예정
    ];

    sheet.getRange(nextRow, 1, 1, 12).setValues([rowData]);

    // 💡 4. USD일 경우 환율 고정 처리 (L열)
    if (data.currency == "USD") {
      var rateCell = sheet.getRange(nextRow, 12);
      rateCell.setFormula('=GOOGLEFINANCE("CURRENCY:USDKRW")');
      SpreadsheetApp.flush();
      var currentRate = rateCell.getValue();
      rateCell.setValue(currentRate);
    }

    // 💡 5. 윗줄 수식 복사 (필요한 경우에만)
    if (lastRow > 1) {
      // USD인 경우에만 가격원(F), 총액원(I) 수식 복사
      if (data.currency == "USD") {
        sheet.getRange(lastRow, 6).copyTo(sheet.getRange(nextRow, 6));
        sheet.getRange(lastRow, 9).copyTo(sheet.getRange(nextRow, 9));
      }

      // 보유수량(K) 및 기타 수식(M열 이후)은 항상 복사
      sheet.getRange(lastRow, 11).copyTo(sheet.getRange(nextRow, 11));
      var maxCols = sheet.getMaxColumns();
      if (maxCols >= 13) {
        sheet.getRange(lastRow, 13, 1, maxCols - 12).copyTo(sheet.getRange(nextRow, 13));
      }
    }

    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * 📈 시장 지수 업데이트 함수 (P14:Q19 위치에 수식 입력)
 */
function updateMarketData(ss) {
  var sheet = ss.getSheetByName("Summary");
  if (!sheet) return;

  // 1. 기존 위치(A14:B19) 데이터 삭제 (이동 처리)
  sheet.getRange("A14:B19").clearContent();

  // 2. 새로운 위치(P14:Q19)에 지수 수식 입력
  var indices = [
    "INDEXSP:.INX",      // S&P 500 (14행)
    "INDEXNASDAQ:.IXIC", // Nasdaq (15행)
    "KRX:KOSPI",         // KOSPI (16행)
    "CURRENCY:USDKRW",   // 환율 (17행)
    "GLD",               // 금(ETF) (18행)
    "BTCKRW"             // 비트코인 (19행)
  ];

  for (var i = 0; i < indices.length; i++) {
    var row = 14 + i;
    var ticker = indices[i];
    
    // P열(16번째): 현재가, Q열(17번째): 변동률
    sheet.getRange(row, 16).setFormula('=GOOGLEFINANCE("' + ticker + '", "price")');
    sheet.getRange(row, 17).setFormula('=GOOGLEFINANCE("' + ticker + '", "changepct") / 100');
  }
}
