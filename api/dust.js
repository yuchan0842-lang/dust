// 인증키를 서버 환경변수에서만 읽어 공공데이터포털에 요청합니다.
const API_URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";
const REGIONS = new Set(["전국", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]);

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "조회 요청만 사용할 수 있습니다." });
  }
  const sido = req.query.sido ?? "서울";
  // 첫 페이지를 기본으로 사용하며 전체 측정소 조회를 위해 추가 페이지도 받습니다.
  const pageNo = req.query.pageNo ?? "1";
  if (typeof sido !== "string" || !REGIONS.has(sido) || typeof pageNo !== "string" || !/^[1-9]\d*$/.test(pageNo) || !Number.isSafeInteger(Number(pageNo))) {
    return res.status(400).json({ message: "인증키 또는 요청값을 확인해주세요" });
  }
  const key = process.env.AIRKOREA_KEY?.trim();
  if (!key) return res.status(500).json({ message: "서버에 대기정보 인증키가 설정되지 않았습니다." });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    // 디코딩 인증키를 한 번만 인코딩합니다.
    const url = `${API_URL}?serviceKey=${encodeURIComponent(key)}&returnType=json&sidoName=${encodeURIComponent(sido)}&numOfRows=100&pageNo=${pageNo}&ver=1.3`;
    const upstream = await fetch(url, { signal: controller.signal });
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); }
    catch { return res.status(502).json({ message: "인증키 또는 요청값을 확인해주세요" }); }
    const code = String(data?.response?.header?.resultCode);
    if (code !== "00" && code !== "0") {
      return res.status(502).json({ message: code === "20"
        ? "대기정보 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요."
        : "인증키 또는 요청값을 확인해주세요" });
    }
    if (!upstream.ok || !Array.isArray(data.response?.body?.items)) {
      return res.status(502).json({ message: "대기정보 서버의 응답을 확인할 수 없습니다." });
    }
    return res.status(200).json({ response: data.response });
  } catch (error) {
    // 외부 오류 원문 대신 한국어 메시지만 전달합니다.
    return res.status(error.name === "AbortError" ? 504 : 502).json({ message: error.name === "AbortError"
      ? "대기정보 서버의 응답 시간이 초과되었습니다."
      : "대기정보 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요." });
  } finally {
    clearTimeout(timeout);
  }
};
