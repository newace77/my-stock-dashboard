// 🐶 바둑이의 주식 데이터 처리 스크립트
// 업데이트: 2026-02-11 (최신 데이터 백업 반영 - 구글시트 복구 버전)

const CONFIG = {
    // 원본 주소 (CORS 에러 가능성 높음, 하지만 가장 빠름)
    summaryURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=0&single=true&output=csv",
    holdingsURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=58859590&single=true&output=csv",
    historyURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=1713255630&single=true&output=csv"
};

// 프록시 목록 (순서대로 시도)
const PROXIES = [
    // 1. AllOrigins (JSONP/Raw 지원, 안정적)
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    // 2. CorsProxy.io (간편함)
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    // 3. Google Apps Script Proxy (이건 예시, 필요하면 추가 가능)
];

// 종목별 한줄 전망 (AI Generated - 2026.02 기준)
const STOCK_OUTLOOKS = {
    "하나금융지주": "주주환원 확대 기대감 유효, 금리 인하 시기 순이자마진 방어가 관건.",
    "RKLB": "뉴트론 로켓 개발 순항 중, 우주 산업 성장성과 함께 장기적 주가 상승 기대.",
    "TSLA": "전기차 수요 둔화 우려와 로보택시/AI 모멘텀이 공존하는 구간, 변동성 주의.",
    "ABBV": "휴미라 특허 만료 방어 양호, 스카이리치 등 신약 포트폴리오 성장세 견조.",
    "VOO": "미국 시장 전체에 투자하는 가장 확실한 방법, 장기 우상향 믿음 여전.",
    "현대차2우B": "실적 호조 지속 및 높은 배당 수익률 매력, 피크아웃 우려는 상존.",
    "JNJ": "소비자 헬스 분사 후 제약/의료기기 집중, 소송 리스크 완화되며 안정세.",
    "T_NASDAQ(ETF)": "금리 인하 사이클 진입 시 기술주 중심의 나스닥 강세 지속 전망.",
    "MO": "높은 배당 수익률은 매력적이나, 흡연율 감소라는 구조적 리스크는 부담.",
    "DGRO": "배당 성장주 위주 포트폴리오로 하락장에서의 방어력과 장기 성장성 겸비.",
    "AAPL": "서비스 부문 성장과 온디바이스 AI 기대감으로 아이폰 판매 정체 상쇄.",
    "T_S&P500(ETF)": "워렌 버핏이 추천하는 최고의 장기 투자처, 적립식 투자에 최적.",
    "SCHD": "현금 흐름 중시 투자자에게 최고의 선택, 배당 성장 ETF의 대장주.",
    "S_SCHD(ETF)": "한국판 SCHD, 연금 계좌 활용 시 절세 효과와 함께 안정적 배당 기대.",
    "NEE": "신재생 에너지 대장주, 고금리 기조 완화 시 주가 반등 탄력 기대.",
    "O": "월배당 리츠 대장주, 금리 인하 시기 대표적인 수혜주로 꼽힘.",
    "PLUS50(ETF)": "코스피 대표 우량주 분산 투자, 한국 시장의 베타 수익 추구.",
    "K_S&P500(ETF)": "환노출형 S&P500 ETF, 달러 강세 시 환차익까지 기대 가능.",
    "QQQM": "QQQ와 동일한 지수 추종하나 수수료가 저렴해 장기 보유에 더 유리.",
    "SPYM": "S&P 500 추종으로 안정적인 시장 수익률 달성 목표.",
    "K_NASDAQ(ETF)": "나스닥 100 지수 추종, 미국 기술주 성장에 올라타는 효율적 수단.",
    "NVIDIA": "AI 칩 시장 독점적 지위 지속, 실적 서프라이즈 기대감 여전히 유효.",
    "K_AI테크(ETF)": "국내 AI 반도체 및 소프트웨어 생태계 성장에 집중 투자.",
    "GOOGLE": "검색 광고 매출 견조, 제미나이 등 AI 경쟁력 입증 여부가 주가 향방 결정.",
    "AMD": "엔비디아 추격하는 AI 칩 2인자, 데이터센터 점유율 확대 노력 지속.",
    "S_KDQ150(ETF)": "코스닥 대표 150종목 투자, 변동성은 크지만 높은 성장 잠재력 보유."
};

// ⚠️ 브라우저 보안(CORS) 대비 백업 데이터 (2026-02-11 최신화 - 시트 복구 버전)
const BACKUP_DATA = {
    summary: `,총 평가금,총 투자금,총 수입액,수익률,일 변화율,일 변화액,국내 1일 변화율,국내 1일 변화액,국외 1일 변화율,국외 1일 변화액,배당금
AJM,"417,008,218","251,183,881","165,824,337",66.02%,0.15%,"633,950",0.24%,"357,755",0.10%,"276,195","24,781,805"
AJM jr,"11,655,591","9,600,000","2,055,591",21.41%,0.55%,"63,324",0.58%,"65,350",-0.88%,"-2,026","155,121"
JJG-w-AJM,"35,308,882","60,000,000","-24,691,118",-41.15%,-1.01%,"-360,739",-0.29%,"-23,190",-1.22%,"-337,549","160,166"
JJG-w-KKO,"132,213,149","116,658,793","15,554,356",13.33%,0.21%,"273,805",-,0,0.21%,"273,805","625,326"
JJG-w-AJMjr,"103,823,896","91,270,000","12,553,896",13.75%,0.35%,"361,598",0.38%,"280,920",0.27%,"80,678","394,047"
JJG-w-AJM-ISA,"42,918,170","39,757,337","3,160,833",7.95%,0.31%,"131,360",0.31%,"131,360",-,0,0
JJG-w-KKO-ISA,"30,501,280","30,798,208","-296,928",-0.96%,0.31%,"95,590",0.31%,"95,590",-,0,"75,380"
합계,"773,429,186","599,268,219","174,160,967",29.06%,0.15%,"1,198,889",0.29%,"907,785",0.06%,"291,104","26,191,846"
달러 합산,"458,259,768",59.21%,,,,,,,,,
원화 합산,"315,675,515",40.79%,,,,,,,,,`,

    holdings: `종목명,Ticker,화폐단위,총 수량,"총 매수금액\n(현지통화)","평균단가\n(현지통화)","현재가\n(현지통화)","수익률\n(%)","평가금액\n(원)",비중(%),"일간 변동율\n(%)","일간 변동액\n(현지통화)","일간 변동액\n(원)","총 매수금액\n(원)","수익액\n(원)",환율
SPYM,NYSEARCA:SPYM,USD,864,"66,087",76.49,81.78,6.92,"103,072,947",13.32,0.33,0.24,350,"96,405,408","6,667,539"
QQQM,NASDAQ:QQQM,USD,268,"63,085",235.39,253.95,7.88,"99,281,163",12.83,0.38,0.95,"1,386","92,026,453","7,254,711",합산
K_S&P500(ETF),KRX:379800,KRW,2452,"51,030,120",20811.63,"23,005.00",10.54,"56,408,260",7.29,0.26,60.00,60,"51,030,120","5,378,140",달러 합산
K_NASDAQ(ETF),KRX:379810,KRW,2299,"52,723,430",22933.20,"24,420.00",6.48,"56,141,580",7.25,0.51,125.00,125,"52,723,430","3,418,150",원화 합산
T_S&P500(ETF),KRX:360750,KRW,2045,"41,117,680",20106.44,"25,175.00",25.21,"51,482,875",6.65,0.26,65.00,65,"41,117,680","10,365,195"
T_NASDAQ(ETF),KRX:133690,KRW,245,"28,990,860",118330.04,"163,020.00",37.77,"39,939,900",5.16,0.53,860.00,860,"28,990,860","10,949,040"
S_SCHD(ETF),KRX:446720,KRW,2907,"32,075,390",11033.85,"13,330.00",20.81,"38,750,310",5.01,-0.67,-90.00,-90,"32,075,390","6,674,920",비중
O,NYSE:O,USD,370,"19,584",52.93,63.27,19.54,"34,149,426",4.41,0.30,0.22,321,"28,567,688","5,581,738"
PLUS50(ETF),KRX:122090 ,KRW,594,"28,925,995",48696.96,"56,615.00",16.26,"33,629,310",4.35,-0.16,-90.00,-90,"28,925,995","4,703,315"
K_AI테크(ETF),KRX:485540,KRW,2311,"32,251,285",13955.55,"14,520.00",4.04,"33,555,720",4.34,1.61,230.00,230,"32,251,285","1,304,435"
DGRO,NYSEARCA:DGRO,USD,265,"14,980",56.53,74.03,30.96,"28,617,881",3.70,0.18,0.13,190,"21,852,726","6,765,154"
SCHD,NYSEARCA:SCHD,USD,538,"13,892",25.82,31.26,21.06,"24,533,251",3.17,-0.33,-0.09,-131,"20,265,548","4,267,703"
AAPL,NASDAQ:AAPL,USD,55,"12,094",219.89,274.81,24.98,"22,048,501",2.85,0.07,0.19,277,"17,642,197","4,406,304"
JNJ,NYSE:JNJ,USD,61,"10,064",164.99,238.33,44.45,"21,207,643",2.74,-0.09,-0.22,-321,"14,681,325","6,526,317"
VOO,NYSEARCA:VOO,USD,22,"8,767",398.49,640.10,60.63,"20,542,550",2.65,0.29,2.04,2,976,"12,788,768","7,753,782"
TSLA,NASDAQ:TSLA,USD,29,"6,823",235.26,422.86,79.74,"17,888,686",2.31,1.33,6.16,8,986,"9,952,648","7,936,038"
ABBV,NYSE:ABBV,USD,52,"6,807",130.91,223.83,70.99,"16,978,741",2.19,0.32,0.82,1,196,"9,929,911","7,048,830"
MO,NYSE:MO,USD,177,"8,594",48.55,64.16,32.14,"16,566,145",2.14,-0.37,-0.31,-452,"12,536,627","4,029,518"
GOOGLE,GOOGL,USD,34,"11,041",324.74,319.15,-1.72,"15,829,151",2.05,-1.46,-5.17,-7,542,"16,106,315","-277,164"
NEE,NYSE:NEE,USD,86,"6,414",74.58,90.11,20.83,"11,304,602",1.46,0.60,0.54,788,"9,355,845","1,948,757"
RKLB,NASDAQ:RKLB,USD,96,"3,879",40.41,74.55,84.50,"10,440,054",1.35,-1.70,-1.29,"-1,882","5,658,585","4,781,468"
NVIDIA,NASDAQ:NVDA,USD,31,"5,751",185.53,189.00,1.87,"8,546,875",1.10,-0.55,-1.04,"-1,517","8,390,031","156,844"
AMD,NASDAQ:AMD,USD,23,"5,098",221.64,216.15,-2.48,"7,252,152",0.94,0.07,0.15,219,"7,436,255","-184,103"
S_KDQ150(ETF),KRX:450910,KRW,287,"5,661,335",19725.91,"18,780.00",-4.80,"5,389,860",0.70,-2.26,-435.00,-435,"5,661,335","-271,475"
현대차2우B,KRX:005387,KRW,1,"156,578",156577.56,"255,500.00",63.18,"255,500",0.03,1.19,3,000.00,3,000,"156,578","98,922"
하나금융지주,KRX:086790,KRW,1,"60,491",60491.25,"122,200.00",102.01,"122,200",0.02,2.86,3,400.00,3,400,"60,491","61,709"`,

    history: `일자,총 평가금,총 투자금
25. 12. 10,"696,023,773","537,908,219"
25. 12. 11,"700,051,746","537,908,219"
25. 12. 12,"704,165,835","537,908,219"
25. 12. 13,"702,418,405","537,908,219"
25. 12. 15,"696,685,341","537,908,219"
25. 12. 16,"697,990,581","537,908,219"
25. 12. 17,"700,689,320","537,908,219"
25. 12. 18,"690,472,091","537,908,219"
25. 12. 19,"696,583,683","537,908,219"
25. 12. 20,"698,045,643","536,268,219"
25. 12. 21,"703,210,225","536,268,219"
25. 12. 22,"707,905,022","536,268,219"
25. 12. 23,"707,683,706","536,268,219"
25. 12. 24,"704,261,764","536,268,219"
25. 12. 25,"706,367,243","536,268,219"
25. 12. 26,"696,710,631","536,268,219"
25. 12. 27,"696,200,001","536,268,219"
25. 12. 29,"691,614,983","536,268,219"
25. 12. 30,"695,384,514","536,268,219"
25. 12. 31,"697,033,727","536,268,219"
26. 01. 02,"693,934,671","537,268,219"
26. 01. 03,"694,131,044","537,268,219"
26. 01. 04,"694,131,044","537,268,219"
26. 01. 06,"709,200,413","567,268,219"
26. 01. 07,"713,567,714","568,268,219"
26. 01. 08,"718,712,043","568,268,219"
26. 01. 10,"725,600,238","568,268,219"
26. 01. 12,"732,003,152","568,268,219"
26. 01. 13,"738,967,100","568,268,219"
26. 01. 14,"743,867,524","568,268,219"
26. 01. 15,"741,130,938","568,268,219"
26. 01. 16,"751,112,449","578,268,219"
26. 01. 17,"752,966,538","578,268,219"
26. 01. 19,"751,209,773","578,268,219"
26. 01. 20,"753,116,204","578,268,219"
26. 01. 21,"744,639,774","578,268,219"
26. 01. 22,"752,408,376","598,268,219"
26. 01. 23,"758,999,122","598,268,219"
26. 01. 24,"759,024,391","598,268,219"
26. 01. 25,"753,400,040","598,268,219"
26. 01. 26,"746,520,569","598,268,219"
26. 01. 27,"745,553,114","598,268,219"
26. 01. 29,"753,414,478","598,268,219"
26. 01. 30,"756,408,101","598,268,219"
26. 01. 31,"760,167,925","598,268,219"
26. 02. 02,"761,324,006","598,768,219"
26. 02. 03,"767,225,959","598,768,219"
26. 02. 04,"765,738,871","598,768,219"
26. 02. 05,"764,576,030","598,768,219"`
};

// 전역 변수
let globalHoldings = [];
let sortState = { column: 'weight', direction: 'desc' };
let summaryChart = null;
let historyChart = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchData();

    // 플로팅 버튼 이벤트
    const refreshBtn = document.getElementById('refresh-fab');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.classList.add('fab-spinning');
            refreshBtn.disabled = true;
            
            try {
                await fetchData();
            } finally {
                // 부드러운 전환을 위해 약간의 지연 후 애니메이션 제거
                setTimeout(() => {
                    refreshBtn.classList.remove('fab-spinning');
                    refreshBtn.disabled = false;
                }, 500);
            }
        });
    }
});

// 데이터 가져오기 (Waterfall 전략: 직접 -> 프록시1 -> 프록시2 -> 백업)
async function fetchData() {
    const summaryTable = document.querySelector('#summary-table tbody');
    const holdingsTable = document.querySelector('#holdings-table tbody');
    const lastUpdated = document.getElementById('last-updated');
    
    if (summaryTable) summaryTable.innerHTML = '<tr><td colspan="7" class="loading">데이터 불러오는 중... (연결 시도)</td></tr>';
    
    // 1. Summary
    await fetchWithFallback(CONFIG.summaryURL, 
        (data) => {
            renderSummary(data, summaryTable);
        }, 
        () => {
            const sumResults = Papa.parse(BACKUP_DATA.summary, { header: false });
            renderSummary(sumResults.data, summaryTable);
        }
    );

    // 2. Holdings
    await fetchWithFallback(CONFIG.holdingsURL, 
        (data) => {
            processHoldingsData(data);
            renderHoldingsTable();
        }, 
        () => {
            const holdResults = Papa.parse(BACKUP_DATA.holdings, { header: false });
            processHoldingsData(holdResults.data);
            renderHoldingsTable();
        }
    );

    // 3. History
    await fetchWithFallback(CONFIG.historyURL, 
        (data) => {
            renderHistoryChart(data);
        }, 
        () => {
            const histResults = Papa.parse(BACKUP_DATA.history, { header: false });
            renderHistoryChart(histResults.data);
        }
    );
}

// 재사용 가능한 Fetcher (Direct -> Proxies -> Fail)
async function fetchWithFallback(targetUrl, onSuccess, onFail) {
    const urlsToTry = [
        targetUrl + '&t=' + Date.now(), // Direct
        PROXIES[0](targetUrl + '&t=' + Date.now()), // Proxy 1
        PROXIES[1](targetUrl + '&t=' + Date.now())  // Proxy 2
    ];

    for (let i = 0; i < urlsToTry.length; i++) {
        const url = urlsToTry[i];
        const method = i === 0 ? "Direct" : `Proxy ${i}`;
        
        try {
            console.log(`Trying ${method}: ${url}`);
            
            const result = await new Promise((resolve, reject) => {
                Papa.parse(url, {
                    download: true,
                    header: false,
                    complete: (res) => resolve(res),
                    error: (err) => reject(err)
                });
            });

            if (result.errors.length === 0 && result.data && result.data.length > 0) {
                console.log(`Success via ${method}`);
                onSuccess(result.data);
                updateTimestamp(true, method);
                return true; 
            }
        } catch (e) {
            console.warn(`Failed via ${method}`, e);
        }
    }

    console.error("All fetch attempts failed. Using Backup.");
    onFail();
    updateTimestamp(false, "Backup");
    return false;
}

function updateTimestamp(isLive, method) {
    const lastUpdated = document.getElementById('last-updated');
    const now = new Date();
    const formattedTime = now.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    if (isLive) {
        lastUpdated.innerHTML = `Last Update: ${formattedTime} (Live 🟢 via ${method})`;
        lastUpdated.style.color = "#2e7d32"; 
    } else {
        if (!lastUpdated.innerHTML.includes("Live")) {
            lastUpdated.innerHTML = `Last Update: ${formattedTime} (Backup 🟠)`;
            lastUpdated.style.color = "#d84315"; 
        }
    }
}

function formatNumber(str) {
    if (!str) return "0";
    return str; 
}

function getColorClass(value) {
    if (!value) return "";
    const cleanVal = value.toString().replace(/,/g, '').replace(/%/g, '');
    const num = parseFloat(cleanVal);
    
    if (isNaN(num)) return "";
    if (num > 0) return "value-up";
    if (num < 0) return "value-down";
    return "";
}

// ------------------- Summary Logic -------------------
function renderSummary(data, tableElement) {
    if (!tableElement) return;
    tableElement.innerHTML = '';
    
    const chartLabels = [];
    const chartInvest = [];
    const chartEval = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row[0] || row[0].trim() === "") continue;

        const name = row[0];
        if (name.includes("달러 합산") || name.includes("원화 합산")) continue;

        const tr = document.createElement('tr');
        const isTotalRow = name.includes("합계");

        if (isTotalRow) {
            tr.classList.add("account-total");
        }

        const totalEval = row[1];
        const totalInvest = row[2];
        const totalIncome = row[3];
        const dailyChangeAmt = row[6] || "0";

        let calcReturnRateStr = "0.00%";
        const evalNum = parseFloat(totalEval.replace(/,/g, ''));
        const investNum = parseFloat(totalInvest.replace(/,/g, ''));

        if (investNum !== 0) {
            const rate = ((evalNum / investNum) - 1) * 100;
            calcReturnRateStr = rate.toFixed(2) + "%";
        }

        if (!isTotalRow) {
            chartLabels.push(name);
            chartInvest.push(investNum);
            chartEval.push(evalNum);
        }

        tr.innerHTML = `
            <td>${name}</td>
            <td>${totalEval}</td>
            <td>${totalInvest}</td>
            <td class="${getColorClass(totalIncome)}">${totalIncome}</td>
            <td class="${getColorClass(calcReturnRateStr)}">${calcReturnRateStr}</td>
            <td class="${getColorClass(dailyChangeAmt)}">${dailyChangeAmt}</td>
        `;
        tableElement.appendChild(tr);
    }

    renderSummaryChart(chartLabels, chartInvest, chartEval);
}

// ------------------- Holdings Logic -------------------
function processHoldingsData(data) {
    globalHoldings = [];
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row[0] || row[0] === "종목명" || row[0] === "환율") continue;

        const name = row[0];
        const returnRateStr = row[7] || "0";
        const evalKRWStr = row[8] || "0";
        const weightStr = row[9] || "0";
        const dailyChangeStr = row[10] || "0"; 
        const profitKRWStr = row[14] || "0";

        // AI 전망 Lookup
        const outlook = STOCK_OUTLOOKS[name] || "-";

        const weight = parseFloat(weightStr) || 0;
        const returnRate = parseFloat(returnRateStr.replace(/%/g, '')) || 0;
        const evalKRW = parseFloat(evalKRWStr.replace(/,/g, '')) || 0;
        const profitKRW = parseFloat(profitKRWStr.replace(/,/g, '')) || 0;
        const dailyChange = parseFloat(dailyChangeStr.replace(/%/g, '')) || 0;

        if (weight === 0 && evalKRW === 0) continue; 

        globalHoldings.push({
            name: name,
            weight: weight,
            returnRate: returnRate,
            eval: evalKRW,
            profit: profitKRW,
            dailyChange: dailyChange,
            outlook: outlook,
            display: {
                weight: weightStr,
                returnRate: returnRateStr,
                evalKRW: evalKRWStr,
                profitKRW: profitKRWStr,
                dailyChange: dailyChangeStr
            }
        });
    }
    sortHoldings(sortState.column, false);
}

function sortHoldings(column, toggle = true) {
    if (toggle) {
        if (sortState.column === column) {
            sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortState.column = column;
            sortState.direction = 'desc';
        }
    }

    globalHoldings.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        return sortState.direction === 'asc' ? valA - valB : valB - valA;
    });

    renderHoldingsTable();
    updateSortIcons();
}

function updateSortIcons() {
    const headers = document.querySelectorAll('#holdings-table th');
    headers.forEach(th => {
        if (th.textContent.includes('↕') || th.textContent.includes('↑') || th.textContent.includes('↓')) {
            let text = th.textContent.replace(' ↑', '').replace(' ↓', '').replace(' ↕', '');
            if (th.getAttribute('onclick') && th.getAttribute('onclick').includes(`'${sortState.column}'`)) {
                text += sortState.direction === 'asc' ? ' ↑' : ' ↓';
                th.style.color = "#333";
            } else {
                text += ' ↕';
                th.style.color = "#999";
            }
            th.textContent = text;
        }
    });
}

function renderHoldingsTable() {
    const tableElement = document.querySelector('#holdings-table tbody');
    if (!tableElement) return;
    tableElement.innerHTML = '';

    globalHoldings.forEach(item => {
        const tr = document.createElement('tr');
        let displayDailyChange = item.display.dailyChange;
        if (!displayDailyChange.includes('%')) {
            displayDailyChange += '%';
        }

        tr.innerHTML = `
            <td>${item.name}</td>
            <td>${item.display.weight}%</td>
            <td class="${getColorClass(item.display.returnRate)}">${item.display.returnRate}%</td>
            <td class="${getColorClass(item.display.profitKRW)}">${item.display.profitKRW}</td>
            <td>${item.display.evalKRW}</td>
            <td class="${getColorClass(item.display.dailyChange)}">${displayDailyChange}</td>
            <td style="font-size: 0.85em; color: #555; text-align: left;">${item.outlook}</td>
        `;
        tableElement.appendChild(tr);
    });
}

function renderSummaryChart(labels, investData, evalData) {
    const ctx = document.getElementById('summaryChart').getContext('2d');
    if (summaryChart) summaryChart.destroy();

    summaryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '투자원금',
                    data: investData,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                },
                {
                    label: '평가금액',
                    data: evalData,
                    backgroundColor: 'rgba(255, 99, 132, 0.6)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => new Intl.NumberFormat('ko-KR', { notation: "compact" }).format(v) }
                }
            }
        }
    });
}

function renderHistoryChart(data) {
    const dates = [];
    const totalEval = [];
    const totalInvest = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row[0]) continue;

        const date = row[0];
        const tEval = parseFloat(row[1].replace(/,/g, ''));
        const tInvest = parseFloat(row[2].replace(/,/g, ''));

        dates.push(date);
        totalEval.push(tEval);
        totalInvest.push(tInvest);
    }

    const ctx = document.getElementById('historyChart').getContext('2d');
    if (historyChart) historyChart.destroy();

    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: '총 평가금',
                    data: totalEval,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: '총 투자금',
                    data: totalInvest,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    fill: true,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { title: { display: true, text: '자산 변동 추이' } },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: { callback: v => new Intl.NumberFormat('ko-KR', { notation: "compact" }).format(v) }
                }
            }
        }
    });
}