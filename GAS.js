/**
 * @fileoverview 🐶 바둑이 주식 대시보드 - GAS 웹훅 서버
 * Google Apps Script V8 런타임 기반
 *
 * 주요 기능:
 * - doPost: 매매 기록 저장, Yahoo Finance 프록시, 시장 데이터 갱신
 * - doGet: Yahoo Finance 프록시, 연결 확인
 * - refreshAllAccounts: 모든 계좌 시장 데이터 갱신 (트리거용)
 *
 * 보안:
 * - SSRF 방지를 위한 URL 도메인 화이트리스트 적용
 * - 입력값 XSS/Injection 방지 sanitize 적용
 * - API Key 기반 인증 (Script Properties)
 */

// ===== 계좌 매핑 (단일 소스) =====
const ACCOUNT_MAP = {
  AJM: "1YNMIqwg6mJjUFGtWEMRSPKNCJGcPMfKgyg_S0gkEVFw",
  AJMjr: "1aN52-xHUQm5ZmQOk6I9HLTVxCKMeMuYQoGcNlxCEIEI",
  "JJG-w-AJM": "1vdWQhHIEHk2mZHPCDzDnbDhYoqYCFE7m8LRk8xaXOUs",
  "JJG-w-KKO": "1Q0q2v60zcf-mfuQS8MiO1pBfSFo3YxVIZ7yo2TWBX3s",
  "JJG-w-AJMjr": "1m2zurh2hmMgYOWMo-t7BNagu2AkyK2EoygdMS594mj0",
  "JJG-w-AJM-ISA": "1Q1Sw-Z2doUvJNw1bAh351b8ZR9UFVbtnAsg5M6Js7sg",
  "JJG-w-KKO-ISA": "1GRz4BgS0SF5bsl7D2oo9z0BNkvqob9b2Mzd3QYVrVjY",
};

// ===== 프록시 허용 도메인 화이트리스트 (SSRF 방지) =====
const ALLOWED_PROXY_DOMAINS = [
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
  "finance.yahoo.com",
  "api.finance.yahoo.com",
];

// ===== API Key (Script Properties에서 관리 권장) =====
const API_KEY =
  PropertiesService.getScriptProperties().getProperty("API_KEY") || "";

// ===== 한국투자증권 API 설정 =====
const KIS_API_URL = "https://openapi.koreainvestment.com:9443";
const KIS_APP_KEY = PropertiesService.getScriptProperties().getProperty("KIS_APP_KEY") || "";
const KIS_APP_SECRET = PropertiesService.getScriptProperties().getProperty("KIS_APP_SECRET") || "";

/**
 * 한국투자증권 API 토큰 발급 및 캐싱
 */
function getKisAccessToken() {
  const cache = CacheService.getScriptCache();
  let token = cache.get("KIS_TOKEN");
  if (token) return token;

  const url = KIS_API_URL + "/oauth2/tokenP";
  const payload = {
    "grant_type": "client_credentials",
    "appkey": KIS_APP_KEY,
    "appsecret": KIS_APP_SECRET
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    if (json.access_token) {
      // 만료시간(초)에서 10분 여유두고 캐싱
      const expiresIn = parseInt(json.expires_in) || 86400;
      cache.put("KIS_TOKEN", json.access_token, Math.max(0, expiresIn - 600)); 
      return json.access_token;
    } else {
      throw new Error("토큰 발급 실패: " + response.getContentText());
    }
  } catch(e) {
    throw new Error("KIS API 토큰 요청 중 오류: " + e.toString());
  }
}

// ===== SpreadsheetApp 캐시 (동일 실행 내 중복 호출 방지) =====
const _ssCache = {};

/**
 * 스프레드시트 ID로 SpreadsheetApp을 열고 캐시합니다.
 * 동일 실행 컨텍스트 내에서 같은 ID를 여러 번 열 때 불필요한 API 호출을 방지합니다.
 * @param {string} ssId - 스프레드시트 ID
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} 스프레드시트 객체
 */
function openSpreadsheetCached(ssId) {
  if (!_ssCache[ssId]) {
    _ssCache[ssId] = SpreadsheetApp.openById(ssId);
  }
  return _ssCache[ssId];
}

/**
 * URL이 허용된 도메인인지 검증합니다. (SSRF 방지)
 * @param {string} url - 검증할 URL
 * @returns {boolean} 허용 여부
 */
function isAllowedUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    // GAS 환경에서는 URL 생성자가 제한적이므로 정규식으로 파싱
    const match = url.match(/^https?:\/\/([^/?#]+)/i);
    if (!match) return false;
    const hostname = match[1].toLowerCase();
    return ALLOWED_PROXY_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain),
    );
  } catch (e) {
    return false;
  }
}

/**
 * 문자열에서 HTML 태그와 스크립트를 제거합니다. (XSS/Injection 방지)
 * @param {string} str - 정화할 문자열
 * @returns {string} 정화된 문자열
 */
function sanitizeInput(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/<[^>]*>/g, "")
    .replace(/[<>"'&]/g, "")
    .trim();
}

/**
 * JSON 형식의 성공 응답을 생성합니다.
 * @param {string} message - 응답 메시지
 * @returns {GoogleAppsScript.Content.TextOutput} JSON 응답
 */
function createSuccessResponse(message) {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "success", message: message }),
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * JSON 형식의 에러 응답을 생성합니다.
 * @param {string} message - 에러 메시지
 * @returns {GoogleAppsScript.Content.TextOutput} JSON 에러 응답
 */
function createErrorResponse(message) {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "error", message: message }),
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 하위 호환성을 위한 기존 createResponse 래퍼 (JSON 전환)
 * @param {string} msg - 응답 메시지
 * @returns {GoogleAppsScript.Content.TextOutput} JSON 응답
 */
function createResponse(msg) {
  if (typeof msg === "string" && msg.startsWith("Error")) {
    return createErrorResponse(msg);
  }
  return createSuccessResponse(msg);
}

/**
 * POST 요청을 처리합니다.
 * - 프록시 요청 (proxy_yahoo, url)
 * - 시장 데이터 갱신 (refresh_market)
 * - 매매 기록 저장
 * @param {GoogleAppsScript.Events.DoPost} e - POST 이벤트 객체
 * @returns {GoogleAppsScript.Content.TextOutput} 응답
 */
function doPost(e) {
  try {
    let data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      data = e.parameter;
    }

    // API Key 검증 (설정된 경우에만 체크)
    if (API_KEY && data.apiKey !== API_KEY) {
      return createErrorResponse("Unauthorized - Invalid API Key");
    }

    // 💡 1. [프록시/명령 처리] 계좌 기록보다 먼저 확인
    if (data.command === "proxy_yahoo" && data.url) {
      if (!isAllowedUrl(data.url)) {
        return createErrorResponse(
          "허용되지 않은 URL 도메인입니다. Yahoo Finance 도메인만 허용됩니다.",
        );
      }
      return ContentService.createTextOutput(
        UrlFetchApp.fetch(data.url).getContentText(),
      );
    }

    if (data.command === "proxy_kis" && data.endpoint) {
      try {
        const token = getKisAccessToken();
        const headers = {
          "content-type": "application/json",
          "authorization": "Bearer " + token,
          "appkey": KIS_APP_KEY,
          "appsecret": KIS_APP_SECRET,
          "tr_id": data.tr_id,
          "custtype": "P"
        };
        const options = {
          method: "get",
          headers: headers,
          muteHttpExceptions: true
        };
        const response = UrlFetchApp.fetch(KIS_API_URL + data.endpoint, options);
        return ContentService.createTextOutput(response.getContentText()).setMimeType(ContentService.MimeType.JSON);
      } catch (e) {
        return createErrorResponse(e.toString());
      }
    }

    if (data.command === "refresh_market") {
      if (data.account && ACCOUNT_MAP[data.account]) {
        const ss = openSpreadsheetCached(ACCOUNT_MAP[data.account]);
        updateMarketData(ss);
        return createSuccessResponse("Refreshed: " + data.account);
      } else {
        for (const acc in ACCOUNT_MAP) {
          try {
            const ss = openSpreadsheetCached(ACCOUNT_MAP[acc]);
            updateMarketData(ss);
          } catch (err) {
            Logger.log("계좌 갱신 실패 (" + acc + "): " + err.toString());
          }
        }
        return createSuccessResponse("All Accounts Refreshed");
      }
    }

    // 일반 URL 프록시 (SSRF 방지 검증 적용)
    if (data.url) {
      if (!isAllowedUrl(data.url)) {
        return createErrorResponse(
          "허용되지 않은 URL 도메인입니다. Yahoo Finance 도메인만 허용됩니다.",
        );
      }
      return ContentService.createTextOutput(
        UrlFetchApp.fetch(data.url).getContentText(),
      );
    }

    // 💡 2. [매매 기록 저장] account 정보가 필요한 요청
    const ssId = ACCOUNT_MAP[data.account];
    if (!ssId) {
      throw new Error("알 수 없는 계좌입니다: " + sanitizeInput(data.account));
    }

    const ss = openSpreadsheetCached(ssId);
    const sheet = ss.getSheetByName("record") || ss.getSheetByName("거래기록");

    if (!sheet)
      throw new Error("'record' 또는 '거래기록' 시트를 찾을 수 없습니다.");

    const lastRow = sheet.getLastRow();
    const nextRow = lastRow + 1;

    // 입력값 정화 및 유효성 검사
    let stockName = sanitizeInput(data.stockName);
    let stockCode = sanitizeInput(data.stockCode);
    const type = sanitizeInput(data.type) || "기타";
    let price = parseFloat(data.price);
    let qty = parseFloat(data.quantity);

    if (isNaN(price) || !isFinite(price)) price = 0;
    if (isNaN(qty) || !isFinite(qty)) qty = 0;

    if (type === "현금입금" || type === "현금출금" || type === "배당금") {
      const originalName = stockName;
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

    const total = price * qty;
    const currency = sanitizeInput(data.currency);

    const rowData = [
      sanitizeInput(data.date), // A: 날짜
      stockName, // B: 종목명
      stockCode, // C: 종목코드
      currency, // D: 통화
      type, // E: 종류
      currency == "KRW" ? price : "", // F: 가격원
      price, // G: 가격외
      qty, // H: 수량
      currency == "KRW" ? total : "", // I: 총액원
      total, // J: 총액외
      "", // K: 보유수량
      "", // L: 환율
    ];

    sheet.getRange(nextRow, 1, 1, 12).setValues([rowData]);

    if (currency == "USD") {
      const rateCell = sheet.getRange(nextRow, 12);
      const formula =
        '=IFERROR(INDEX(GOOGLEFINANCE("CURRENCY:USDKRW", "' +
        sanitizeInput(data.date) +
        '"), 2, 2), GOOGLEFINANCE("CURRENCY:USDKRW"))';
      rateCell.setFormula(formula);

      SpreadsheetApp.flush();
      const val = rateCell.getValue();
      if (typeof val === "number" && val > 0) {
        rateCell.setValue(val);
      }
    }

    if (lastRow > 1) {
      const maxCols = sheet.getMaxColumns();

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

      const typeValues = sheet.getRange(1, 5, lastRow, 1).getValues();
      let sourceRow = -1;

      for (let r = lastRow - 1; r >= 1; r--) {
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

      if (currency === "USD") {
        try {
          sheet.getRange(nextRow, 6).setFormula("=G" + nextRow + "*L" + nextRow);
          sheet.getRange(nextRow, 9).setFormula("=J" + nextRow + "*L" + nextRow);
        } catch (err) {
          Logger.log("USD 환산 수식 적용 실패: " + err.toString());
        }
      }
    }

    SpreadsheetApp.flush();
    return createSuccessResponse("Record Saved to " + data.account);
  } catch (err) {
    return createErrorResponse(err.toString());
  }
}

/**
 * GET 요청을 처리합니다.
 * - URL 프록시 (Yahoo Finance 전용)
 * - 연결 상태 확인
 * @param {GoogleAppsScript.Events.DoGet} e - GET 이벤트 객체
 * @returns {GoogleAppsScript.Content.TextOutput} 응답
 */
function doGet(e) {
  // API Key 검증 (설정된 경우에만 체크)
  if (API_KEY && e.parameter.apiKey !== API_KEY) {
    return createErrorResponse("Unauthorized - Invalid API Key");
  }

  if (e && e.parameter && e.parameter.url) {
    if (!isAllowedUrl(e.parameter.url)) {
      return createErrorResponse(
        "허용되지 않은 URL 도메인입니다. Yahoo Finance 도메인만 허용됩니다.",
      );
    }
    return ContentService.createTextOutput(
      UrlFetchApp.fetch(e.parameter.url).getContentText(),
    ).setMimeType(ContentService.MimeType.TEXT);
  }
  return createSuccessResponse("바둑이 대시보드 연결 성공! 🐾 (계좌 통합 버전)");
}

/**
 * 모든 계좌의 시장 데이터를 갱신합니다.
 * 타이머 트리거에 의해 주기적으로 실행됩니다.
 */
function refreshAllAccounts() {
  for (const acc in ACCOUNT_MAP) {
    try {
      const ss = openSpreadsheetCached(ACCOUNT_MAP[acc]);
      updateMarketData(ss);
    } catch (e) {
      Logger.log("Error refreshing " + acc + ": " + e.toString());
    }
  }
}

/**
 * 주기적으로 실행될 트리거를 수동으로 생성하는 함수입니다.
 * 기존 refreshAllAccounts 트리거를 삭제하고 새로 생성합니다.
 */
function createTimeDrivenTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    const handler = triggers[i].getHandlerFunction();
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

/**
 * 스프레드시트의 Summary 시트에 현재 시각을 기록하여 시장 데이터 갱신을 트리거합니다.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 스프레드시트 객체
 */
function updateMarketData(ss) {
  const sheet = ss.getSheetByName("Summary");
  if (!sheet) return;
  sheet.getRange("Z1").setValue(new Date());
}
