/**
 * 🐶 바둑이 주식 대시보드 - GAS 최종 통합 버전 (프록시 및 계좌 통합 복구)
 */

// ===== 계좌 매핑 (단일 소스) =====
var ACCOUNT_MAP = {
  AJM: "1YNMIqwg6mJjUFGtWEMRSPKNCJGcPMfKgyg_S0gkEVFw",
  AJMjr: "1aN52-xHUQm5ZmQOk6I9HLTVxCKMeMuYQoGcNlxCEIEI",
  "JJG-w-AJM": "1vdWQhHIEHk2mZHPCDzDnbDhYoqYCFE7m8LRk8xaXOUs",
  "JJG-w-KKO": "1Q0q2v60zcf-mfuQS8MiO1pBfSFo3YxVIZ7yo2TWBX3s",
  "JJG-w-AJMjr": "1m2zurh2hmMgYOWMo-t7BNagu2AkyK2EoygdMS594mj0",
  "JJG-w-AJM-ISA": "1Q1Sw-Z2doUvJNw1bAh351b8ZR9UFVbtnAsg5M6Js7sg",
  "JJG-w-KKO-ISA": "1GRz4BgS0SF5bsl7D2oo9z0BNkvqob9b2Mzd3QYVrVjY",
};

// ===== API Key (Script Properties에서 관리 권장) =====
var API_KEY =
  PropertiesService.getScriptProperties().getProperty("API_KEY") || "";

function doPost(e) {
  try {
    var data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      data = e.parameter;
    }

    // API Key 검증 (설정된 경우에만 체크)
    if (API_KEY && data.apiKey !== API_KEY) {
      return createResponse("Error: Unauthorized - Invalid API Key");
    }

    // 💡 1. [프록시/명령 처리] 계좌 기록보다 먼저 확인
    if (data.command === "proxy_yahoo" && data.url) {
      return ContentService.createTextOutput(
        UrlFetchApp.fetch(data.url).getContentText(),
      );
    }

    if (data.command === "refresh_market") {
      if (data.account && ACCOUNT_MAP[data.account]) {
        var ss = SpreadsheetApp.openById(ACCOUNT_MAP[data.account]);
        updateMarketData(ss);
        return createResponse("Refreshed: " + data.account);
      } else {
        for (var acc in ACCOUNT_MAP) {
          try {
            var ss = SpreadsheetApp.openById(ACCOUNT_MAP[acc]);
            updateMarketData(ss);
          } catch (err) {
            /* ignore error for single account */
          }
        }
        return createResponse("All Accounts Refreshed");
      }
    }

    if (data.url) {
      return ContentService.createTextOutput(
        UrlFetchApp.fetch(data.url).getContentText(),
      );
    }

    // 💡 2. [매매 기록 저장] account 정보가 필요한 요청
    var ssId = ACCOUNT_MAP[data.account];
    if (!ssId) {
      throw new Error("알 수 없는 계좌입니다: " + data.account);
    }

    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName("record") || ss.getSheetByName("거래기록");

    if (!sheet)
      throw new Error("'record' 또는 '거래기록' 시트를 찾을 수 없습니다.");

    var lastRow = sheet.getLastRow();
    var nextRow = lastRow + 1;

    var stockName = data.stockName || "";
    var stockCode = data.stockCode || "";
    var type = data.type || "기타";
    var price = parseFloat(data.price) || 0;
    var qty = parseFloat(data.quantity) || 0;

    if (type === "현금입금" || type === "현금출금" || type === "배당금") {
      var originalName = stockName;
      stockName = "현금";
      stockCode = type === "배당금" ? originalName : "현금";
    }
    if (type.includes("매도") || type.includes("출금")) {
      qty = -Math.abs(qty);
    }

    if (["현금입금", "현금출금", "배당금"].includes(type)) {
      if (price === 0) {
        price = Math.abs(qty);
        qty = qty < 0 ? -1 : 1;
      }
    }

    var total = price * qty;

    var rowData = [
      data.date, // A: 날짜
      stockName, // B: 종목명
      stockCode, // C: 종목코드
      data.currency, // D: 통화
      type, // E: 종류
      data.currency == "KRW" ? price : "", // F: 가격원
      price, // G: 가격외
      qty, // H: 수량
      data.currency == "KRW" ? total : "", // I: 총액원
      total, // J: 총액외
      "", // K: 보유수량
      "", // L: 환율
    ];

    sheet.getRange(nextRow, 1, 1, 12).setValues([rowData]);

    if (data.currency == "USD") {
      var rateCell = sheet.getRange(nextRow, 12);
      var formula =
        '=IFERROR(INDEX(GOOGLEFINANCE("CURRENCY:USDKRW", "' +
        data.date +
        '"), 2, 2), GOOGLEFINANCE("CURRENCY:USDKRW"))';
      rateCell.setFormula(formula);

      SpreadsheetApp.flush();
      var val = rateCell.getValue();
      if (typeof val === "number" && val > 0) {
        rateCell.setValue(val);
      }
    }

    if (lastRow > 1) {
      var maxCols = sheet.getMaxColumns();
      
      // K열(11열) 복사 시도
      if (maxCols >= 11) {
        try {
          sheet.getRange(lastRow, 11).copyTo(sheet.getRange(nextRow, 11));
        } catch (err) {
          Logger.log("K열 복사 실패: " + err.toString());
        }
      }
      
      // M열(13열) 이상 수식 복사 시도
      if (maxCols >= 13) {
        try {
          sheet
            .getRange(lastRow, 13, 1, maxCols - 12)
            .copyTo(sheet.getRange(nextRow, 13));
        } catch (err) {
          Logger.log("M열 이상 복사 실패: " + err.toString());
        }
      }

      var typeValues = sheet.getRange(1, 5, lastRow, 1).getValues();
      var sourceRow = -1;

      for (var r = lastRow - 1; r >= 1; r--) {
        if (typeValues[r][0] === type) {
          sourceRow = r + 1;
          break;
        }
      }

      if (sourceRow === -1) sourceRow = lastRow;

      // F열(6열) 서식 복사 시도
      if (maxCols >= 6 && sourceRow > 0) {
        try {
          sheet
            .getRange(sourceRow, 6)
            .copyTo(
              sheet.getRange(nextRow, 6),
              SpreadsheetApp.CopyPasteType.PASTE_FORMATS,
              false,
            );
        } catch (err) {
          Logger.log("F열 서식 복사 실패: " + err.toString());
        }
      }
      
      // I열(9열) 서식 복사 시도
      if (maxCols >= 9 && sourceRow > 0) {
        try {
          sheet
            .getRange(sourceRow, 9)
            .copyTo(
              sheet.getRange(nextRow, 9),
              SpreadsheetApp.CopyPasteType.PASTE_FORMATS,
              false,
            );
        } catch (err) {
          Logger.log("I열 서식 복사 실패: " + err.toString());
        }
      }

      if (data.currency === "USD") {
        try {
          sheet.getRange(nextRow, 6).setFormula("=G" + nextRow + "*L" + nextRow);
          sheet.getRange(nextRow, 9).setFormula("=J" + nextRow + "*L" + nextRow);
        } catch (err) {
          Logger.log("USD 환산 수식 적용 실패: " + err.toString());
        }
      }
    }

    SpreadsheetApp.flush();
    return createResponse("Success: Record Saved to " + data.account);
  } catch (err) {
    return createResponse("Error: " + err.toString());
  }
}

function doGet(e) {
  // API Key 검증 (설정된 경우에만 체크)
  if (API_KEY && e.parameter.apiKey !== API_KEY) {
    return createResponse("Error: Unauthorized - Invalid API Key");
  }

  if (e && e.parameter && e.parameter.url) {
    return ContentService.createTextOutput(
      UrlFetchApp.fetch(e.parameter.url).getContentText(),
    ).setMimeType(ContentService.MimeType.TEXT);
  }
  return createResponse("바둑이 대시보드 연결 성공! 🐾 (계좌 통합 버전)");
}

function createResponse(msg) {
  return ContentService.createTextOutput(msg).setMimeType(
    ContentService.MimeType.TEXT,
  );
}

/**
 * 모든 계좌의 시장 데이터를 갱신합니다.
 */
function refreshAllAccounts() {
  for (var acc in ACCOUNT_MAP) {
    try {
      var ss = SpreadsheetApp.openById(ACCOUNT_MAP[acc]);
      updateMarketData(ss);
    } catch (e) {
      Logger.log("Error refreshing " + acc + ": " + e.toString());
    }
  }
}

/**
 * 주기적으로 실행될 트리거를 수동으로 생성하는 함수입니다.
 */
function createTimeDrivenTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var handler = triggers[i].getHandlerFunction();
    if (handler === "refreshAllAccounts") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger("refreshAllAccounts")
    .timeBased()
    .everyMinutes(30)
    .create();

  Logger.log("트리거 설정 완료: 시장 데이터(30분)");
}

function updateMarketData(ss) {
  var sheet = ss.getSheetByName("Summary");
  if (!sheet) return;
  sheet.getRange("Z1").setValue(new Date());
}
