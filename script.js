// 인증키 없이 같은 사이트의 서버리스 함수에 조회를 요청합니다.
const API_URL = "/api/dust";
const REGIONS = ["전국", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
const GRADES = { "1": ["good", "좋음"], "2": ["normal", "보통"], "3": ["bad", "나쁨"], "4": ["very-bad", "매우나쁨"] };
const region = document.querySelector("#region");
const stations = document.querySelector("#stations");
const status = document.querySelector("#status");
let activeController;

// 빈 문자열과 결측 기호를 숫자 0으로 변환하지 않습니다.
function measurement(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
function displayValue(value) {
  const number = measurement(value);
  return number === null ? "측정 안 됨" : `${number} ㎍/㎥`;
}

// 응답 문자열을 HTML로 삽입하지 않고 텍스트 노드로 표시합니다.
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function render(items) {
  const fragment = document.createDocumentFragment();
  const values = [];
  for (const item of items) {
    const value = measurement(item.pm10Value);
    if (value !== null) values.push(value);
    const [color, label] = GRADES[String(item.pm10Grade ?? "").trim()] ?? ["unknown", "등급 정보 없음"];
    const card = element("article", undefined, `card ${color}`);
    card.append(element("h2", item.stationName || "측정소 이름 없음"), element("span", label, "badge"));
    const list = element("dl");
    for (const [name, measured] of [["미세먼지", item.pm10Value], ["초미세먼지", item.pm25Value]]) {
      const row = element("div");
      row.append(element("dt", name), element("dd", displayValue(measured)));
      list.append(row);
    }
    card.append(list, element("time", `측정 시각: ${item.dataTime || "정보 없음"}`));
    fragment.append(card);
  }
  stations.replaceChildren(fragment);
  document.querySelector("#average").textContent = values.length ? (values.reduce((sum, n) => sum + n, 0) / values.length).toFixed(1) : "측정 안 됨";
  document.querySelector("#average-note").textContent = `전체 ${items.length}개 측정소 중 유효한 ${values.length}개 측정소 기준`;
}

// 한 페이지가 100건이므로 전체 건수에 맞춰 나머지 페이지도 조회합니다.
async function fetchPage(sidoName, pageNo, signal) {
  const url = new URL(API_URL, window.location.origin);
  url.search = new URLSearchParams({ sido: sidoName, pageNo: String(pageNo) });
  const response = await fetch(url, { signal });
  let data;
  try { data = await response.json(); }
  catch { throw new Error("응답을 읽지 못했습니다. 인증키와 API 활용 승인을 확인해 주세요."); }
  if (!response.ok) throw new Error(data.message || "대기정보를 불러오지 못했습니다.");
  const header = data.response?.header;
  if (header?.resultCode !== "00") throw new Error("조회가 거절되었습니다. 인증키, 활용 승인 및 요청 한도를 확인해 주세요.");
  const body = data.response?.body;
  if (!Array.isArray(body?.items)) throw new Error("측정소 응답 형식이 올바르지 않습니다.");
  return body;
}

// 지역을 빠르게 바꾸면 이전 요청을 취소해 과거 결과가 덮어쓰지 않게 합니다.
async function load() {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  const selected = region.value;
  document.querySelector("#region-name").textContent = selected;
  stations.replaceChildren();
  document.querySelector("#average").textContent = "—";
  document.querySelector("#average-note").textContent = "측정소 데이터를 불러오는 중입니다.";
  stations.setAttribute("aria-busy", "true");
  status.textContent = "대기정보를 불러오는 중입니다…";
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const first = await fetchPage(selected, 1, controller.signal);
    const items = [...first.items];
    const pages = Math.ceil(Number(first.totalCount || items.length) / 100);
    for (let page = 2; page <= pages; page++) {
      status.textContent = `측정소를 불러오는 중입니다… (${page}/${pages}페이지)`;
      const next = await fetchPage(selected, page, controller.signal);
      items.push(...next.items);
    }
    if (controller.signal.aborted) return;
    render(items);
    status.textContent = items.length ? `${selected} 측정소 ${items.length}곳을 조회했습니다.` : "조회된 측정소가 없습니다.";
  } catch (error) {
    if (activeController !== controller) return;
    status.textContent = error.name === "AbortError" ? "응답 시간이 초과되었습니다. 새로고침을 눌러 다시 시도해 주세요." : `${error.message} 연결 오류가 계속되면 네트워크와 브라우저의 외부 요청 허용 여부도 확인해 주세요.`;
    document.querySelector("#average-note").textContent = "데이터를 불러오지 못했습니다.";
  } finally {
    clearTimeout(timeout);
    if (activeController === controller) stations.setAttribute("aria-busy", "false");
  }
}

// 시도 선택과 새로고침 버튼으로 같은 조회 함수를 실행합니다.
for (const name of REGIONS) region.append(new Option(name, name));
region.value = "서울";
region.addEventListener("change", load);
document.querySelector("#refresh").addEventListener("click", load);
load();

