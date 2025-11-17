// server.js (Node 20+, ESM)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { API_KEY } from './config.js'; // config.js에서 API_KEY를 가져옵니다.

// __dirname 대체 (ESM 환경)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// JSON 요청 본문을 해석하기 위한 미들웨어
app.use(express.json());

// 'public' 폴더의 정적 파일(html, css, main.js 등)을 제공하는 미들웨어
app.use(express.static(path.join(__dirname, 'public')));

// 루트 URL('/')로 접속 시 public/index.html 파일을 명시적으로 제공
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// '/api/gemini' 경로로 오는 POST 요청을 처리하는 프록시 API
app.post('/api/gemini', async (req, res) => {
  try {
    const { userInput } = req.body; // 클라이언트에서 보낸 프롬프트

    // Google Gemini API로 요청 전송
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_KEY, // config.js에서 가져온 API 키 사용
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userInput }] }],
          generationConfig: { response_mime_type: 'application/json' },
        }),
      }
    );

    // Google API로부터 받은 응답이 성공적이지 않을 경우 에러 처리
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google API Error:', errorData);
      // 클라이언트에게도 에러 상태와 메시지를 전달
      return res.status(response.status).json(errorData);
    }

    const data = await response.json();
    res.json(data); // 성공 시, 받은 데이터를 클라이언트에게 전달

  } catch (error) {
    // 네트워크 오류 등 fetch 과정에서 문제 발생 시 서버 로그에 기록
    console.error('Proxy Server Error:', error);
    // 클라이언트에게 서버 내부 오류 메시지 전달
    res.status(500).json({ error: '서버 내부에서 오류가 발생했습니다.' });
  }
});

// 지정된 포트(3000)에서 서버 실행
app.listen(port, () => {
  console.log(`✅ Proxy server running on http://localhost:${port}`);
});