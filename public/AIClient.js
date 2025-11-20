// public/js/AIClient.js
export async function getJsonFromAI(userInput) {
    const promptTemplate = `
  당신은 3D 천체 물리학 시뮬레이션 전문가입니다.
  사용자의 요청을 분석하여 **5가지 시나리오 중 하나**를 선택하고, 그에 맞는 **JSON 데이터**를 반환하세요.
  
  ### 1. 시나리오 유형 (scenarioType) - 다음 중 하나 선택:
  1. "collision": 행성 간 충돌. (반대편에서 중앙으로 돌진)
  2. "orbit": 자전 및 공전. (태양을 중심으로 행성이 돔)
  3. "solar_eclipse": 개기일식. [태양 - 달 - 지구] 순서로 X축 일직선 배치. (달이 태양을 가림)
  4. "lunar_eclipse": 개기월식. [태양 - 지구 - 달] 순서로 X축 일직선 배치. (지구가 달을 가림)
  5. "planet_birth": 행성의 탄생. (초기에 아주 작은 크기로 시작, 먼지 구름 느낌)
  
  ### 2. 좌표 및 설정 규칙:
  - **일식/월식(eclipse)**: y=0, z=0 필수. x축 위에서 겹치도록 배치. 카메라가 측면에서 봄.
  - **자전/공전(orbit)**: 태양은 정지(0,0,0), 행성은 적절한 거리와 **초기 속도(velocity)**를 주어 공전 궤도를 형성.
  - **탄생(planet_birth)**: 위치는 (0,0,0) 근처, 움직임은 적게.
  - **충돌(collision)**: 서로 마주보고 빠른 속도.
  
  ### 3. 출력 형식 (JSON Only):
  - 마크다운(\`\`\`) 없이 순수 JSON 문자열만 반환.
  - textureKey 목록: "Sun", "Mercury", "Venus", "Earth", "Moon", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"
  
  ---
  [예시 데이터]
  Q: "지구 탄생 과정 보여줘"
  A: { "scenarioType": "planet_birth", "objects": [{ "name": "Proto-Earth", "textureKey": "Earth", "size": 5, "mass": 10, "position": {"x":0,"y":0,"z":0}, "velocity": {"x":0,"y":0,"z":0} }] }
  
  Q: "개기일식"
  A: { "scenarioType": "solar_eclipse", "objects": [{ "name": "Sun", "textureKey": "Sun", "size": 15, ... }, { "name": "Moon", ... }, { "name": "Earth", ... }] }
  ---
  
  [실제 요청]
  사용자 입력: "${userInput}"
  JSON 응답:`.trim();
  
    console.log('[AIClient] 요청:', userInput);
  
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: promptTemplate })
      });
  
      if (!res.ok) throw new Error(`Proxy failed: ${res.status}`);
  
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      return JSON.parse(cleanText);
    } catch (error) {
      console.error('[AIClient] 오류:', error);
      throw error;
    }
  }