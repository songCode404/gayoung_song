// 파일 이름: vite.config.js

import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      // '/api'로 시작하는 모든 요청을 target 주소로 전달합니다.
      '/api': {
        // ★★★ 여기에 팀의 실제 Lambda/API Gateway URL을 입력하세요. ★★★
        target: 'https://ad8abfiqpf.execute-api.ap-southeast-2.amazonaws.com/test_stage',
        changeOrigin: true, // CORS 오류 방지를 위해 필수
        rewrite: (path) => path.replace(/^\/api/, ''), // '/api' 부분을 제거하고 전달
      },
    },
  },
});