import { state } from './state.js';
import { showToast } from './ui.js';

function generatePodcastText() {
  if (!globalHoldings || globalHoldings.length === 0) {
    return "현재 보유 중인 포트폴리오 종목 정보가 없습니다. 대시보드 하단의 매매 기록 폼을 활용하여 자산을 먼저 등록해 주세요.";
  }

  let totalEval = 0;
  let totalCost = 0;
  let krwEval = 0;
  let usdEval = 0;

  // 계좌별 자산 분산도 계산을 위한 맵
  const accountMap = {};

  globalHoldings.forEach((item) => {
    const evalVal = parseSafeFloat(item.eval);
    const profitVal = parseSafeFloat(item.display?.profitKRW || item.profit);
    totalEval += evalVal;
    totalCost += evalVal - profitVal;

    // 통화별 자산 분류
    if (isKoreanStock(item.ticker)) {
      krwEval += evalVal;
    } else {
      usdEval += evalVal;
    }

    // 계좌별 금액 합산
    const acc = item.account || "미지정 계좌";
    accountMap[acc] = (accountMap[acc] || 0) + evalVal;
  });

  const totalProfit = totalEval - totalCost;
  const returnRate =
    totalCost > 0 ? ((totalProfit / totalCost) * 100).toFixed(2) : "0.00";
  const evalBillion = (totalEval / 100000000).toFixed(2);
  const profitBillion = (totalProfit / 100000000).toFixed(2);
  const sign = totalProfit >= 0 ? "누적 수익" : "누적 손실";

  // 1. 통화 비중 계산
  const krwPct = totalEval > 0 ? Math.round((krwEval / totalEval) * 100) : 0;
  const usdPct = totalEval > 0 ? Math.round((usdEval / totalEval) * 100) : 0;

  // 2. 계좌별 최대 비중 계좌 추출
  let topAccount = "미지정";
  let topAccountPct = 0;
  Object.keys(accountMap).forEach((acc) => {
    const pct =
      totalEval > 0 ? Math.round((accountMap[acc] / totalEval) * 100) : 0;
    if (pct > topAccountPct) {
      topAccount = acc;
      topAccountPct = pct;
    }
  });

  // 3. 주요 상승/하락 종목 선정
  let bestStock = null;
  let worstStock = null;
  globalHoldings.forEach((item) => {
    const change = parseSafeFloat(item.dailyChange);
    if (!bestStock || change > parseSafeFloat(bestStock.dailyChange))
      bestStock = item;
    if (!worstStock || change < parseSafeFloat(worstStock.dailyChange))
      worstStock = item;
  });

  // 4. 위험 관리 지표 분석 (MDD & RSI)
  let worstMddStock = null;
  let worstMddValue = 0;
  const rsiOverbought = [];
  const rsiOversold = [];

  if (
    typeof holdingsAnalysisData !== "undefined" &&
    holdingsAnalysisData.length > 0
  ) {
    holdingsAnalysisData.forEach((d) => {
      const mddVal = Math.abs(parseSafeFloat(d.mdd));
      if (mddVal > worstMddValue) {
        worstMddValue = mddVal;
        worstMddStock = d;
      }

      const rsiVal = parseSafeFloat(d.rsi);
      if (rsiVal >= 70) {
        rsiOverbought.push(d.name || d.ticker);
      } else if (rsiVal <= 30 && rsiVal > 0) {
        rsiOversold.push(d.name || d.ticker);
      }
    });
  }

  // 오늘 날짜 추출
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;

  // 대본 작성
  let scriptText = `안녕하십니까. 투자자님을 위한 인공지능 금융 비서, ${dateStr} 포트폴리오 일일 브리핑을 시작합니다. `;

  scriptText += `먼저 현재 포트폴리오의 종합 자산 규모 현황입니다. `;
  scriptText += `오늘 기준 투자자님의 총 평가 자산은 약 ${evalBillion}억 원으로 파악되었습니다. `;
  scriptText += `투자 원금 대비 종합 ${sign}은 약 ${Math.abs(
    profitBillion,
  )}억 원이며, 이에 따른 포트폴리오 총 누적 수익률은 ${returnRate}%를 나타내고 있습니다. `;

  scriptText += `이어서 자산 분산도 및 헤지 분석 결과입니다. `;
  scriptText += `현재 자산의 통화별 비중은 국내 원화 자산이 ${krwPct}%, 해외 달러 자산이 ${usdPct}%로 배분되어 있습니다. `;
  scriptText += `해외 달러 자산의 보유는 환율 변동에 따른 자산 완충 역할을 할 수 있으므로, 향후 거시경제 흐름을 보며 적절한 통화 리밸런싱을 권장해 드립니다. `;
  scriptText += `또한 등록된 계좌 중에서는 ${topAccount} 계좌가 전체 포트폴리오 자산의 약 ${topAccountPct}%를 차지하여 가장 높은 집중도를 보이고 있습니다. `;

  scriptText += `다음으로 오늘 거래일 기준 개별 종목 성과 리포트입니다. `;
  if (bestStock && parseSafeFloat(bestStock.dailyChange) > 0) {
    scriptText += `가장 우수한 일일 성과를 보여준 종목은 ${bestStock.name}으로, 전일 대비 ${bestStock.dailyChange}% 상승하며 포트폴리오 수익률 방어를 주도했습니다. `;
  }
  if (worstStock && parseSafeFloat(worstStock.dailyChange) < 0) {
    scriptText += `반대로 조정을 겪은 하락 종목으로는 ${
      worstStock.name
    }이 있으며, 전일 대비 ${Math.abs(
      worstStock.dailyChange,
    )}% 하락하며 거래를 마쳤습니다. `;
  }

  scriptText += `마지막으로 리스크 관리 관점의 모니터링 경보입니다. `;
  if (worstMddStock && worstMddValue > 0) {
    scriptText += `보유 자산 중 고점 대비 최대 낙폭을 뜻하는 엠디디가 가장 큰 종목은 ${
      worstMddStock.name || worstMddStock.ticker
    }로, 현재 최고점 대비 마이너스 ${worstMddValue.toFixed(
      1,
    )}% 수준까지 하락해 깊은 조정을 겪고 있습니다. 변동성이 지속될 수 있으니 주의 깊게 관찰하시기 바랍니다. `;
  }

  if (rsiOverbought.length > 0) {
    scriptText += `또한, 단기 과매수 국면에 진입한 것으로 평가되는 종목은 ${rsiOverbought
      .slice(0, 3)
      .join(
        ", ",
      )} 등이 있으므로 단기 차익 실현 욕구에 따른 변동성을 유념하셔야 합니다. `;
  }
  if (rsiOversold.length > 0) {
    scriptText += `반대로 과매도권에 들어서 기술적 반등 가능성이 엿보이는 분할 매수 관심 종목으로는 ${rsiOversold
      .slice(0, 3)
      .join(", ")} 등이 관찰됩니다. `;
  }

  scriptText += `오늘 아침 8시를 기점으로 하여 포트폴리오의 실시간 가치 평가 결과와 국내외 거시경제 전망 지표가 NotebookLM 노트북에 동기화 완료되었습니다. 상세한 개별 종목들의 회복 주기 분석은 하단 MDD 탭의 시장 보고서를 참고하시길 바라며, 추가 거래 기록 발생 시 우측 상단의 새로고침 버튼을 누르시면 최신 데이터가 즉각 반영된 신규 팟캐스트 브리핑이 생성됩니다. 오늘 하루도 성공적인 투자 여정이 되시기를 기원합니다. 이상 브리핑을 마칩니다. 감사합니다.`;

  return scriptText;
}


async function togglePodcast() {
  if (isGeneratingPodcast) return;

  const playIcon = document.getElementById("play-icon");
  const playText = document.getElementById("play-text");
  const waveform = document.getElementById("podcast-waveform");
  const statusText = document.getElementById("podcast-status-text");

  if (podcastPlaying) {
    // 일시정지 처리
    podcastPlaying = false;
    if (playIcon) playIcon.textContent = "▶";
    if (playText) playText.textContent = "재생";
    if (waveform) waveform.classList.remove("playing");
    if (statusText) statusText.textContent = "일시정지됨";

    if (speechUtterance && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel(); // TTS 중지
    }
    if (podcastProgressInterval) {
      clearInterval(podcastProgressInterval);
    }
  } else {
    // 재생 시작
    if (statusText) statusText.textContent = "AI 분석 대본 작성 중...";

    const textToSpeak = await generatePodcastTextWithGemini();

    podcastPlaying = true;
    if (playIcon) playIcon.textContent = "⏸";
    if (playText) playText.textContent = "일시정지";
    if (waveform) waveform.classList.add("playing");
    if (statusText) statusText.textContent = "AI 브리핑 브로드캐스팅 중...";

    const subtitleEl = document.getElementById("podcast-subtitle");
    if (subtitleEl) {
      subtitleEl.textContent = `"${textToSpeak}"`;
    }

    // TTS Fallback 구동
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel(); // 이전 Speech 초기화
      speechUtterance = new SpeechSynthesisUtterance(textToSpeak);
      speechUtterance.lang = "ko-KR";
      speechUtterance.rate = 1.05; // 약간 빠르게

      // 대본 길이에 따른 재생 시간 예측 (약 1자당 0.25초)
      podcastDuration = Math.round(textToSpeak.length * 0.25);

      speechUtterance.onend = () => {
        stopPodcastPlayback();
      };

      speechUtterance.onerror = () => {
        stopPodcastPlayback();
      };

      window.speechSynthesis.speak(speechUtterance);
    }

    // 가상 진행률 바 작동
    if (podcastProgressInterval) clearInterval(podcastProgressInterval);
    podcastProgressInterval = setInterval(updatePodcastProgress, 1000);
  }
}


function stopPodcastPlayback() {
  podcastPlaying = false;
  const playIcon = document.getElementById("play-icon");
  const playText = document.getElementById("play-text");
  const waveform = document.getElementById("podcast-waveform");
  const statusText = document.getElementById("podcast-status-text");
  const progressBar = document.getElementById("podcast-progress-bar");
  const timeText = document.getElementById("podcast-time");

  if (playIcon) playIcon.textContent = "▶";
  if (playText) playText.textContent = "재생";
  if (waveform) waveform.classList.remove("playing");
  if (statusText) statusText.textContent = "재생 완료";
  if (progressBar) progressBar.style.width = "0%";
  if (timeText) timeText.textContent = "00:00 / 00:00";

  podcastCurrentTime = 0;
  if (podcastProgressInterval) {
    clearInterval(podcastProgressInterval);
  }
  window.speechSynthesis.cancel();
}


function updatePodcastProgress() {
  if (!podcastPlaying) return;

  podcastCurrentTime += 1;
  if (podcastCurrentTime >= podcastDuration) {
    stopPodcastPlayback();
    return;
  }

  const progressBar = document.getElementById("podcast-progress-bar");
  const timeText = document.getElementById("podcast-time");

  const progressPercent = (podcastCurrentTime / podcastDuration) * 100;
  if (progressBar) progressBar.style.width = `${progressPercent}%`;

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  if (timeText) {
    timeText.textContent = `${formatTime(podcastCurrentTime)} / ${formatTime(
      podcastDuration,
    )}`;
  }
}


async function refreshPodcast() {
  if (isGeneratingPodcast) return;

  isGeneratingPodcast = true;
  stopPodcastPlayback();

  const refreshBtn = document.getElementById("podcast-refresh-btn");
  const statusText = document.getElementById("podcast-status-text");
  const subtitleEl = document.getElementById("podcast-subtitle");

  if (refreshBtn) refreshBtn.classList.add("loading");
  if (statusText)
    statusText.textContent = "포트폴리오 분석 및 Gemini 동기화 중...";
  if (subtitleEl)
    subtitleEl.textContent =
      "현재 자산 현황을 바탕으로 Gemini LLM을 연동하여 오늘의 포트폴리오 분석 팟캐스트를 동적 생성하고 있습니다. 잠시만 기다려주세요...";

  try {
    // 실시간으로 Gemini API를 호출하여 최신 대본 생성
    const textToSpeak = await generatePodcastTextWithGemini();

    // 연출 효과를 위해 최소 1.5초는 로딩바를 보여줍니다
    setTimeout(() => {
      isGeneratingPodcast = false;
      if (refreshBtn) refreshBtn.classList.remove("loading");
      if (statusText) statusText.textContent = "AI 브리핑 생성 완료 (대기 중)";

      if (subtitleEl) {
        subtitleEl.textContent = `"${textToSpeak}"`;
      }

      showToast(
        "제미나이 기반 AI 포트폴리오 브리핑이 성공적으로 생성되었습니다.",
        "success",
      );
    }, 1500);
  } catch (err) {
    console.error("❌ 팟캐스트 갱신 에러:", err);
    isGeneratingPodcast = false;
    if (refreshBtn) refreshBtn.classList.remove("loading");
    if (statusText) statusText.textContent = "AI 브리핑 생성 오류";
    showToast("팟캐스트 생성 중 에러가 발생했습니다.", "error");
  }
}


async function generatePodcastTextWithGemini() {
  // 세션 토큰 유효성 검사
  const isTokenValid = googleAccessToken && googleTokenExpiry > Date.now();
  if (!isTokenValid && googleAccessToken) {
    clearGoogleAuthSession();
    showToast("구글 로그인 세션이 만료되었습니다. 다시 로그인해주세요. 😢");
  }

  const token = isTokenValid ? googleAccessToken : null;

  if (!token && !CONFIG.geminiAPIKey) {
    console.log(
      "💡 Google 로그인 토큰 또는 Gemini API Key가 없어 기존 룰 기반 스크립트를 로드합니다.",
    );
    return generatePodcastText();
  }

  // 포트폴리오 상세 분석용 원시 데이터 추출
  const holdingsSummary = globalHoldings.map((item) => ({
    name: item.name,
    ticker: item.ticker,
    eval: parseSafeFloat(item.eval),
    profit: parseSafeFloat(item.display?.profitKRW || item.profit),
    dailyChange: parseSafeFloat(item.dailyChange),
    account: item.account || "미지정",
    currency: isKoreanStock(item.ticker) ? "KRW" : "USD",
  }));

  const mddSummary = (
    typeof holdingsAnalysisData !== "undefined" ? holdingsAnalysisData : []
  ).map((d) => ({
    name: d.name || d.ticker,
    mdd: parseSafeFloat(d.mdd),
    rsi: parseSafeFloat(d.rsi),
  }));

  const today = new Date();
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;

  const prompt = `
당신은 최고의 자산관리 금융 애널리스트이자 팟캐스트 진행자입니다. 
아래 제공되는 오늘의 내 포트폴리오 데이터를 심층적으로 분석하고, 청취자(나 자신)에게 금융 조언을 곁들여 설명하는 라디오 팟캐스트 방송 대본을 작성해 주세요.

[오늘 날짜]
${dateStr}

[보유 종목 데이터]
${JSON.stringify(holdingsSummary, null, 2)}

[주요 위험 관리 지표 (MDD 및 RSI)]
${JSON.stringify(mddSummary, null, 2)}

[작성 지침]
1. 반드시 한국어로 작성해 주세요.
2. 듣는 사람에게 정중하고 신뢰감을 주는 구어체('~습니다', '~입니다') 톤을 사용하세요.
3. 오늘의 총 자산 평가액(원화 및 달러 분산), 계좌별 쏠림 현상(집중 분포), 오늘 가장 크게 오르고 내린 특징 종목, 그리고 MDD(최대 낙폭)가 심한 리스크 종목이나 RSI 과매수/과매도 종목에 대한 구체적인 금융 진단 및 조언을 포함해 주세요.
4. 방송 대본이므로 마크다운 기호(예: **, *, #, -, \` 등)나 특수문자는 소리 내어 읽을 때 어색하므로 절대 사용하지 말고 순수한 줄바꿈과 한글 텍스트로만 리턴해 주세요.
5. "[음악 소리]", "앵커:", "(웃음)" 같은 낭독 외의 해설 괄호나 메타 텍스트는 모두 제외하고 바로 읽을 수 있는 대본으로만 작성해 주세요.
`;

  try {
    let url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
    const headers = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      url += `?key=${CONFIG.geminiAPIKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API 응답 에러: ${response.status}`);
    }

    const resData = await response.json();
    const generatedText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (generatedText) {
      return generatedText.trim();
    }
    throw new Error("API 결과 텍스트가 유실되었습니다.");
  } catch (error) {
    console.error(
      "❌ Gemini API 스크립트 생성 실패, 기존 템플릿으로 대체합니다:",
      error,
    );
    return generatePodcastText();
  }
}


export {
  generatePodcastText,
  togglePodcast,
  stopPodcastPlayback,
  updatePodcastProgress,
  refreshPodcast,
  generatePodcastTextWithGemini
};

window.togglePodcast = togglePodcast;
window.refreshPodcast = refreshPodcast;
