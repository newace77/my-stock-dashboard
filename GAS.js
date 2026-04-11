  /**
   * 🐶 바둑이 주식 대시보드 전용 GAS 커넥터 (v2.0)
   * 기능: 
   * 1. Yahoo Finance 데이터 프록시 (MDD 분석용 CORS 회피)
   * 2. 시장 지수 갱신 트리거 (Z1 셀 타임스탬프)
   * 3. 매매 기록 저장 (Transactions 시트)
   */

  function doPost(e) {
    var output;
    try {
      // 1. 요청 데이터 파싱
      var jsonData = e.postData.contents;
      var params = JSON.parse(jsonData);
      var command = params.command;

      // --- [기능 1] Yahoo Finance 프록시 (MDD 분석 전용) ---
      if (command === "proxy_yahoo") {
        var yahooUrl = params.url;
        
        // 구글 서버의 IP로 야후 데이터를 직접 가져와서 브라우저의 CORS 차단을 우회함
        var fetchOptions = {
          muteHttpExceptions: true,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://finance.yahoo.com/"
          }
        };

        var response = UrlFetchApp.fetch(yahooUrl, fetchOptions);
        var responseCode = response.getResponseCode();
        var contentText = response.getContentText();
        
        // HTTP 오류 시 상세 메시지 반환
        if (responseCode !== 200) {
          return ContentService.createTextOutput(
            "GAS Error: Yahoo Finance 요청 실패 (HTTP " + responseCode + "). " +
            "티커가 올바른지 확인해주세요. 응답: " + contentText.substring(0, 300)
          ).setMimeType(ContentService.MimeType.TEXT);
        }

        // v8 API는 JSON, v7 API는 CSV 반환 - 그대로 전달
        var mimeType = yahooUrl.includes("/v8/") 
          ? ContentService.MimeType.JSON 
          : ContentService.MimeType.TEXT;
        
        return ContentService.createTextOutput(contentText).setMimeType(mimeType);
      }

      // --- [기능 2] 시장 지수 갱신 트리거 ---
      if (command === "refresh_market") {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var summarySheet = ss.getSheetByName("Summary");
        if (summarySheet) {
          // Summary 시트의 Z1 셀에 현재 시간을 기록하여 GOOGLEFINANCE 함수 등의 재계산을 유도
          summarySheet.getRange("Z1").setValue(new Date().getTime());
        }
        return ContentService.createTextOutput("Market refresh triggered.")
              .setMimeType(ContentService.MimeType.TEXT);
      }

      // --- [기능 3] 매매 기록 저장 (Transactions) ---
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var transSheet = ss.getSheetByName("Transactions");
      
      if (!transSheet) {
        return ContentService.createTextOutput("Error: 'Transactions' sheet not found.")
              .setMimeType(ContentService.MimeType.TEXT);
      }

      // 시트 컬럼 순서:
      // A=날짜, B=종목(종목명), C=종목코드, D=거래통화, E=거래종류,
      // F=거래가격(원), G=거래가격(현지통화), H=수량
      //
      // 거래 종류별 B, C열 규칙:
      //   매수/매도   → B=종목명(예: SPYM),        C=종목코드(예: NYSEARCA:SPYM)
      //   배당금      → B="현금"(고정),             C=배당 종목 티커(예: QQQM)
      //   현금입금/출금 → B="현금"(고정),           C=비워둠
      transSheet.appendRow([
        params.date,                // A: 날짜
        params.stockName || "",     // B: 종목명 또는 "현금"
        params.stockCode || "",     // C: 종목코드 또는 배당 종목명 (없으면 빈칸)
        params.currency || "",      // D: 거래통화 (KRW / USD)
        params.type || "",          // E: 거래종류 (매수/매도/배당금/현금입금/현금출금)
        "",                         // F: 거래가격(원) - 시트 수식으로 자동 계산
        params.price || 0,          // G: 단가(현지통화)
        params.quantity || 0        // H: 수량
      ]);

      // G열 단가 숫자 포맷 적용: USD → 소수점 2자리, KRW → 소수점 없음
      var lastRow = transSheet.getLastRow();
      var priceCell = transSheet.getRange(lastRow, 7); // G열 = 7번째 열
      var priceFormat = (params.currency === "USD") ? "#,##0.00" : "#,##0";
      priceCell.setNumberFormat(priceFormat);

      // F열, I열: 바로 위 행의 수식을 복사 (상대참조가 새 행에 맞게 자동 조정됨)
      if (lastRow > 2) { // 헤더 행(1행) 바로 아래가 아닌 경우에만
        var pasteType = SpreadsheetApp.CopyPasteType.PASTE_FORMULA;
        transSheet.getRange(lastRow - 1, 6).copyTo(transSheet.getRange(lastRow, 6), pasteType, false); // F열
        transSheet.getRange(lastRow - 1, 9).copyTo(transSheet.getRange(lastRow, 9), pasteType, false); // I열
      }

      return ContentService.createTextOutput("Success: Transaction recorded.")
            .setMimeType(ContentService.MimeType.TEXT);




    } catch (err) {
      // 예외 발생 시 상세 오류 메시지 반환 (클라이언트 디버깅용)
      return ContentService.createTextOutput("GAS Error: " + err.toString())
            .setMimeType(ContentService.MimeType.TEXT);
    }
  }

  /**
   * 브라우저에서 URL로 직접 접속(GET)했을 때 서버 상태 확인용
   */
  function doGet(e) {
    var ssUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
    return ContentService.createTextOutput("🐶 바둑이 대시보드 GAS 커넥터가 정상 작동 중입니다!\n\n연결된 시트: " + ssUrl)
          .setMimeType(ContentService.MimeType.TEXT);
  }
