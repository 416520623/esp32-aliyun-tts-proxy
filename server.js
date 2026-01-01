// server.js
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const path = require('path');

// 阿里云配置（从环境变量读取）
const ACCESS_KEY_ID = process.env.ALIYUN_ACCESS_KEY_ID;
const ACCESS_KEY_SECRET = process.env.ALIYUN_ACCESS_KEY_SECRET;
const APP_KEY = process.env.ALIYUN_APP_KEY;

if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET || !APP_KEY) {
  console.error('❌ 缺少阿里云配置！请检查 .env 文件或环境变量。');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 10000;

// 获取 Token 的函数
async function getAliyunToken() {
  try {
    const url = 'https://nls-meta.cn-shanghai.aliyuncs.com/api/v1/token';
    const params = new URLSearchParams({
      access_key_id: ACCESS_KEY_ID,
      access_key_secret: ACCESS_KEY_SECRET,
      app_key: APP_KEY,
    });

    const response = await axios.post(url, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (response.data && response.data.token) {
      console.log('✅ 成功获取阿里云 Token');
      return response.data.token;
    } else {
      throw new Error('Token 响应格式错误');
    }
  } catch (error) {
    console.error('❌ 获取 Token 失败:', error.message);
    throw error;
  }
}

// TTS 语音合成代理接口
app.get('/', async (req, res) => {
  const { text = '你好世界', voice = 'zhixiaoxia', sample_rate = 22050 } = req.query;

  // 参数校验
  if (!text || text.length === 0) {
    return res.status(400).json({ error: '缺少 text 参数' });
  }

  try {
    // 1. 获取 Token
    const token = await getAliyunToken();

    // 2. 构建 TTS 请求 URL（注意：这里不包含 appkey！）
    const ttsUrl = new URL('https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/tts');
    ttsUrl.searchParams.append('token', token);
    ttsUrl.searchParams.append('text', text);
    ttsUrl.searchParams.append('format', 'wav');
    ttsUrl.searchParams.append('sample_rate', sample_rate);
    ttsUrl.searchParams.append('voice', voice);
    ttsUrl.searchParams.append('volume', '50');
    ttsUrl.searchParams.append('speech_rate', '0');

    console.log(`🔊 合成语音: "${text}" | voice=${voice} | sample_rate=${sample_rate}`);

    // 3. 转发请求到阿里云 TTS
    const ttsResponse = await axios({
      method: 'GET',
      url: ttsUrl.toString(),
      responseType: 'stream',
      headers: {
        'Accept': 'audio/wav',
      },
    });

    // 4. 设置响应头并流式返回音频
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `inline; filename="tts_${Date.now()}.wav"`);
    
    ttsResponse.data.pipe(res);

  } catch (error) {
    console.error('❌ TTS 请求失败:', error.message);
    res.status(500).json({ 
      error: 'TTS 合成失败',
      details: error.response?.data || error.message 
    });
  }
});

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log('==> ///////////////////////////////////////////////////////////');
  console.log('==> ');
  console.log(`==> Available at your primary URL https://your-app.onrender.com`);
  console.log('==> ');
  console.log('==> ///////////////////////////////////////////////////////////');
  console.log(`📌 访问示例: /?text=你好世界&voice=zhixiaoxia`);
  console.log(`🚀 阿里云 TTS 代理启动成功！监听端口: ${PORT}`);
});
