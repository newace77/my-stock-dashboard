    /**
     * 🐶 바둑이 주식 대시보드 - GAS 최종 통합 버전 (프록시 및 계좌 통합 복구)
     */

    function doPost(e) {
    try {
        var data;
        if (e.postData && e.postData.contents) {
        data = JSON.parse(e.postData.contents);
        } else {
        data = e.parameter;
        }
        
        // 💡 1. [프록시/명령 처리] 계좌 기록보다 먼저 확인
        // script.js의 fetchWithFallback은 { command: "proxy_yahoo", url: "..." } 형식을 사용함
        if (data.command === "proxy_yahoo" && data.url) {
        return ContentService.createTextOutput(UrlFetchApp.fetch(data.url).getContentText());
        }
        
        if (data.command === "refresh_market") {
        var ss = SpreadsheetApp.openById("1YNMIqwg6mJjUFGtWEMRSPKNCJGcPMfKgyg_S0gkEVFw"); 
        updateMarketData(ss);
        return createResponse("Market Data Refreshed");
        }

        if (data.url) {
        return ContentService.createTextOutput(UrlFetchApp.fetch(data.url).getContentText());
        }

        // 💡 2. [매매 기록 저장] account 정보가 필요한 요청
        var accountMap = {
        "AJM": "1YNMIqwg6mJjUFGtWEMRSPKNCJGcPMfKgyg_S0gkEVFw",
        "AJMjr": "1aN52-xHUQm5ZmQOk6I9HLTVxCKMeMuYQoGcNlxCEIEI",
        "JJG-w-AJM": "1vdWQhHIEHk2mZHPCDzDnbDhYoqYCFE7m8LRk8xaXOUs",
        "JJG-w-KKO": "1Q0q2v60zcf-mfuQS8MiO1pBfSFo3YxVIZ7yo2TWBX3s",
        "JJG-w-AJMjr": "1m2zurh2hmMgYOWMo-t7BNagu2AkyK2EoygdMS594mj0",
        "JJG-w-AJM-ISA": "1Q1Sw-Z2doUvJNw1bAh351b8ZR9UFVbtnAsg5M6Js7sg",
        "JJG-w-KKO-ISA": "1GRz4BgS0SF5bsl7D2oo9z0BNkvqob9b2Mzd3QYVrVjY"
        };

        var ssId = accountMap[data.account];
        if (!ssId) {
        // command나 url이 없는 일반 POST 요청인데 account도 없다면 에러
        throw new Error("알 수 없는 계좌입니다: " + data.account);
        }
        
        var ss = SpreadsheetApp.openById(ssId);
        var sheet = ss.getSheetByName("record") || ss.getSheetByName("거래기록");

        if (!sheet) throw new Error("'record' 또는 '거래기록' 시트를 찾을 수 없습니다.");

        var lastRow = sheet.getLastRow();
        var nextRow = lastRow + 1;

        var stockName = data.stockName || "";
        var stockCode = data.stockCode || "";
        var type = data.type || "기타";
        var price = parseFloat(data.price) || 0;
        var qty = parseFloat(data.quantity) || 0;

        if (type === "현금입금" || type === "현금출금") {
        stockName = "현금"; stockCode = "현금";
        }

        if (type.includes("매도") || type.includes("출금")) {
        qty = -Math.abs(qty);
        }

        if (["현금입금", "현금출금", "배당금"].includes(type)) {
        if (price === 0) {
            price = Math.abs(qty);
            qty = (qty < 0 ? -1 : 1);
        }
        }

        var total = price * qty;

        var rowData = [
        data.date,          // A: 날짜
        stockName,          // B: 종목명
        stockCode,          // C: 종목코드
        data.currency,      // D: 통화
        type,               // E: 종류
        (data.currency == "KRW" ? price : ""), // F: 가격원
        price,              // G: 가격외
        qty,                // H: 수량
        (data.currency == "KRW" ? total : ""), // I: 총액원
        total,              // J: 총액외
        "",                 // K: 보유수량
        ""                  // L: 환율
        ];

        sheet.getRange(nextRow, 1, 1, 12).setValues([rowData]);

        if (data.currency == "USD") {
          var rateCell = sheet.getRange(nextRow, 12);
          // 해당 날짜(data.date)의 환율을 가져오는 수식으로 변경 (실패 시 현재 환율 시도)
          var formula = '=IFERROR(INDEX(GOOGLEFINANCE("CURRENCY:USDKRW", "' + data.date + '"), 2, 2), GOOGLEFINANCE("CURRENCY:USDKRW"))';
          rateCell.setFormula(formula);

          // 즉시 값으로 변환하기 전 계산이 완료되었는지 확인
          SpreadsheetApp.flush();
          var val = rateCell.getValue();
          if (typeof val === "number" && val > 0) {
            rateCell.setValue(val); // 숫자로 정상 계산되었을 때만 값으로 고정
          }
          // 만약 #N/A나 #ERROR인 경우 수식 상태로 두어, 사용자가 시트를 열었을 때 계산되도록 함
        }
        if (lastRow > 1) {
          // 1. K열(보유수량) 및 M열 이후 복사 (연속성을 위해 바로 윗행 lastRow에서 가져옴)
          sheet.getRange(lastRow, 11).copyTo(sheet.getRange(nextRow, 11));
          var maxCols = sheet.getMaxColumns();
          if (maxCols >= 13) {
              sheet.getRange(lastRow, 13, 1, maxCols - 12).copyTo(sheet.getRange(nextRow, 13));
          }
          
          // 2. F열(가격원)과 I열(총액원) 수식 복사 (사용자 요청: 동일 종류의 이전 행 탐색)
          var typeValues = sheet.getRange(1, 5, lastRow, 1).getValues(); // E열(종류) 전체 가져오기
          var sourceRow = -1;
          
          // 아래에서 위로 올라가며 동일한 종류(type)를 가진 행 찾기
          for (var r = lastRow - 1; r >= 1; r--) { // r은 0부터 시작, 헤더 제외하고 r=1까지
            if (typeValues[r][0] === type) {
              sourceRow = r + 1; // 1-based index로 변환
              break;
            }
          }
          
          // 만약 동일한 종류의 이전 기록이 없다면, 기본적으로 바로 윗행(lastRow)을 참조
          if (sourceRow === -1) sourceRow = lastRow;
          
          sheet.getRange(sourceRow, 6).copyTo(sheet.getRange(nextRow, 6));
          sheet.getRange(sourceRow, 9).copyTo(sheet.getRange(nextRow, 9));
        }

        SpreadsheetApp.flush();
        return createResponse("Success: Record Saved to " + data.account);

    } catch (err) {
        return createResponse("Error: " + err.toString());
    }
    }

    function doGet(e) {
    if (e && e.parameter && e.parameter.url) {
        return ContentService.createTextOutput(UrlFetchApp.fetch(e.parameter.url).getContentText()).setMimeType(ContentService.MimeType.TEXT);
    }
    return createResponse("바둑이 대시보드 연결 성공! 🐾 (계좌 통합 버전)");
    }

    function createResponse(msg) {
    return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
    }

    function updateMarketData(ss) {
    var sheet = ss.getSheetByName("Summary");
    if (!sheet) return;
    sheet.getRange("Z1").setValue(new Date());
    }

    function authTest() {
    Logger.log("권한 체크 완료! 🐾");
    }
    function forceAuth() {
    UrlFetchApp.fetch("https://www.google.com");
    }
