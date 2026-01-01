const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();

// 从 Render 环境变量安全读取阿里云凭证
const ACCESS_KEY_ID = process.env.ALIYUN_ACCESS_KEY_ID;
const ACCESS_KEY_SECRET = process.env.ALIYUN_ACCESS_KEY_SECRET;
const APP_KEY = process.env.ALIYUN_APP_KEY;

if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET || !APP_KEY) {
  console.error("❌ 缺少阿里云环境变量！请在 Render Dashboard 设置：");
  console.error("ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET, ALIYUN_APP_KEY");
}

const META_URL = 'https://nls-meta.cn-shanghai.aliyuncs.com/';
const TTS_URL = 'https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/tts';

// 阿里云要求的 HMAC-SHA1 签名
function computeSignature(stringToSign, secret) {
  const signature = crypto
    .createHmac('sha1', secret + '&')
    .update(stringToSign, 'utf8')
    .digest('base64');
  return encodeURIComponent(signature);
}

// 获取临时访问 Token（有效期 30 分钟）
async function getAccessToken() {
  const timestamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z'); // ISO8601 格式
  const params = {
    AccessKeyId: ACCESS_KEY_ID,
    Action: 'CreateToken',
    Format: 'JSON',
    Version: '2019-02-28',
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: Math.random().toString(36).substring(2, 10),
    Timestamp: timestamp
  };

  const sortedKeys = Object.keys(params).sort();
  const canonicalizedQueryString = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  const stringToSign = `GET&%2F&${encodeURIComponent(canonicalizedQueryString)}`;

  const signature = computeSignature(stringToSign, ACCESS_KEY_SECRET);
  const url = `${META_URL}?${canonicalizedQueryString}&Signature=${signature}`;

  const response = await axios.get(url);
  return response.data.Token.Id;
}

// 主 TTS 接口
app.get('/', async (req, res) => {
  try {
    let text = req.query.text;
    if (!text) {
      return res.status(400).send('Missing "text" parameter');
    }

    // ✅ 关键修复：不要 decodeURIComponent！Express 已自动解码
    // 如果你从 ESP32 发送的是 urlencode(text)，这里已经是原始中文

    const voice = req.query.voice || 'zhixiaoxia'; // 默认女声
    const sample_rate = req.query.sample_rate || '22050'; // 必须匹配 ESP32 I2S

    console.log(`🔊 合成语音: "${text}" | voice=${voice} | sample_rate=${sample_rate}`);

    const token = await getAccessToken();

    // 请求阿里云 TTS（返回 WAV 流）
    const ttsResponse = await axios({
      method: 'POST',
      url: TTS_URL,
      responseType: 'stream',
      params: {
        appkey: APP_KEY,
        token: token,
        text: text,           // 直接使用，无需额外解码
        format: 'wav',
        sample_rate: sample_rate,
        voice: voice,
        volume: 50,
        speech_rate: 0
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    // 转发音频流到客户端（ESP32）
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-cache');
    ttsResponse.data.pipe(res);

  } catch (err) {
    // 🔍 打印详细错误（关键！）
    console.error('❌ TTS 请求失败:');
    console.error('Error Message:', err.message || err);
    
    if (err.response) {
      console.error('HTTP Status:', err.response.status);
      console.error('阿里云返回:', err.response.data); // 这里会显示具体错误码，如 InvalidAppKey
    } else if (err.request) {
      console.error('No response received:', err.request);
    }

    res.status(500).send('TTS Service Error. Check logs.');
  }
});

// 健康检查（用于 Render 监控）
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'Aliyun TTS Proxy for ESP32' });
});

// 启动服务
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 阿里云 TTS 代理启动成功！监听端口: ${PORT}`);
  console.log(`📌 访问示例: /?text=你好世界&voice=zhixiaoxia`);
});
