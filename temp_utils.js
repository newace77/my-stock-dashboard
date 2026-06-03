function encodeYahooTicker(ticker) {
  if (!ticker) return "";
  return encodeURIComponent(ticker).replace(/%3D/g, "=");
}

function escapeHtml(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeValue(val, isName = false) {
  return escapeHtml(maskValue(val, isName));
}

function isKoreanStock(ticker) {
  if (!ticker) return false;
  const cleaned = String(ticker).replace("KRX:", "").trim();
  // 6자리 숫자이거나 숫자로 시작하고 문자가 섞인 6자리 코드(예: 0183J0)인 경우 한국 주식/ETF로 판단
  return /^[0-9][A-Z0-9]{5}$/i.test(cleaned);

function formatToEokWon(val) {
  const num = parseSafeFloat(val);
  return (num / 100000000).toFixed(1) + "억원";
}

function formatValueByMode(val, isKRW = true) {
  const num = parseSafeFloat(val);
  const isMobile =
    userViewMode === "mobile" ||
    (userViewMode === "auto" && window.innerWidth <= 768);

  if (!isMobile) {
    if (isKRW) return Math.round(num).toLocaleString("ko-KR") + "원";
    return (
      "$" +
      num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  // 모바일 포맷팅 (만/억 단위)
  const absNum = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  let result = "";

  if (isKRW) {
    if (absNum >= 100000000) {
      result =
        sign + (absNum / 100000000).toFixed(1) + "억(원)";
    } else if (absNum >= 10000) {
      result = sign + (absNum / 10000).toFixed(0) + "만";
    } else {
      result = sign + Math.round(absNum).toLocaleString() + "원";
    }
  } else {
    // USD는 모바일에서도 가급적 소수점 유지하되 $ 표시
    if (absNum >= 1000) {
      result =
        sign + "$" + (absNum / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    } else {
      result =
        sign +
        "$" +
        absNum.toLocaleString(undefined, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
    }
  }
  return result;
}

function formatPercent(val) {
  const num = parseSafeFloat(val);
  return num.toFixed(2) + "%";
}

function getResponsiveValueHTML(valStr) {
  if (!valStr || valStr === "-" || typeof valStr !== "string") return valStr;
  // 마스킹된 값이면 그대로 반환
  if (valStr.includes("●")) return valStr;

  // 비율(%) 데이터면 소수점 2자리 강제 적용
  if (valStr.includes("%")) {
    return formatPercent(valStr);
  }

  // 원본에서 숫자만 추출 (음수 기호 포함)
  const numStr = valStr.replace(/[^\d.-]/g, "");
  const num = Number(numStr);

  if (!isNaN(num)) {
    const isKRW = !valStr.includes("$");
    const shortStr = formatValueByMode(num, isKRW);

    // PC 모드에서는 툴팁으로 원본 값을 보여주기 위해 span 래핑 (기존 호환성 유지)
    if (shortStr !== valStr) {
      return `<span class="full-val">${valStr}</span><span class="short-val">${shortStr}</span>`;
    }
  }
  return valStr;
}

function formatTicker(ticker) {
  if (!ticker) return ticker;
  const cleanTicker = ticker.trim().toUpperCase();
  if (isKoreanStock(cleanTicker)) {
    // 기본적으로 .KS를 붙이되, 향후 시장 구분 로직 확장 가능
    return cleanTicker + ".KS";
  }
  return cleanTicker;
}

function parseSafeFloat(val) {
  if (val === undefined || val === null) return 0;
  const num = parseFloat(
    String(val).replace(/,/g, "").replace(/%/g, "").trim(),
  );
  return isNaN(num) ? 0 : num;
}

function formatKRWInteger(val) {
  const num = Math.round(parseSafeFloat(val));
  return num.toLocaleString("ko-KR");
}

function getColorClass(value) {
  const num = parseSafeFloat(value);
  return num > 0 ? "value-up" : num < 0 ? "value-down" : "";
}

function formatBillion(num) {
  if (num >= 1e9) {
    return "$" + (num / 1e9).toFixed(1) + "B";
  }
  return "$" + num.toLocaleString();
}

function formatKoreanCap(num) {
  if (num >= 1e12) {
    return "₩" + (num / 1e12).toFixed(1) + "조";
  }
  if (num >= 1e8) {
    return "₩" + (num / 1e8).toFixed(1) + "억";
  }
  return "₩" + num.toLocaleString();
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

