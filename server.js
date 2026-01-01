// server.js
require('dotenv').config();

const express = require('express');
const axios = require('axios');

const ACCESS_KEY_ID = process.env.ALIYUN_ACCESS_KEY_ID;
const ACCESS_KEY_SECRET = process.env.ALIYUN_ACCESS_KEY_SECRET;
const APP_KEY = process.env.ALIYUN_APP_KEY;

if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET || !APP_KEY) {
  console.error('❌ 缺少阿里云配置！请检查环境变量。');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ 正确获取 Token 的函数
async function getAliyunToken() {
  try {
    const response = await axios.post(
      'https://nls-meta.cn-shanghai.aliyuncs.com', // 注意：没有 /api/v1/token
      new URLSearchParams({
        AccessKeyId: ACCESS_KEY_ID,         // 首字母大写！
        AccessKeySecret: ACCESS_KEY_SECRET, // 首字母大写！
        AppKey: APP_KEY,                    // 首字母大写！
        Action: 'CreateToken',              // 必须指定 Action
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 5000,
      }
    );

    const data = response.data;
    if (data && data.Token) {
      console.log('✅ 成功获取 Token');
      return data.Token; // 注意：字段名是 Token（大写 T）
    } else {
      throw new Error('响应中缺少 Token 字段: ' + JSON.stringify(data));
    }
  } catch (error) {
    console.error('❌ 获取 Token 失败:', error.message);
    if (error.response) {
      console.error('阿里云返回:', error.response.status, error.response.data);
    }
    throw error;
  }
}

// TTS 代理接口
app.get('/', async (req, res) => {
  const { text = '你好世界', voice = 'zhixiaoxia', sample_rate = 22050 } = req.query;

  if (!text) {
    return res.status(400).json({ error: '缺少 text 参数' });
  }

  try {
    const token = await getAliyunToken();

    // ✅ TTS 请求：只传 token，不传 appkey
    const ttsUrl = new URL('https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/tts');
    ttsUrl.searchParams.append('token', token);
    ttsUrl.searchParams.append('text', text);
    ttsUrl.searchParams.append('format', 'wav');
    ttsUrl.searchParams.append('sample_rate', sample_rate);
    ttsUrl.searchParams.append('voice', voice);
    ttsUrl.searchParams.append('volume', '50');
    ttsUrl.searchParams.append('speech_rate', '0');

    console.log(`🔊 合成语音: "${text}" | voice=${voice}`);

    const ttsResponse = await axios({
      method: 'GET',
      url: ttsUrl.toString(),
      responseType: 'stream',
      headers: { Accept: 'audio/wav' },
      timeout: 10000,
    });

    res.setHeader('Content-Type', 'audio/wav');
    ttsResponse.data.pipe(res);
  } catch (error) {
    console.error('❌ TTS 请求失败:', error.message);
    res.status(500).json({
      error: 'TTS 合成失败',
      details: error.message,
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log('==> ///////////////////////////////////////////////////////////');
  console.log(`🚀 阿里云 TTS 代理启动成功！监听端口: ${PORT}`);
  console.log(`📌 访问示例: /?text=你好世界&voice=zhixiaoxia`);
  console.log('==> ///////////////////////////////////////////////////////////');
});
