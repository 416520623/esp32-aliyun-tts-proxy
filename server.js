const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();

// 从 Render 环境变量读取密钥（安全！）
const ACCESS_KEY_ID = process.env.ALIYUN_ACCESS_KEY_ID;
const ACCESS_KEY_SECRET = process.env.ALIYUN_ACCESS_KEY_SECRET;
const APP_KEY = process.env.ALIYUN_APP_KEY;

if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET || !APP_KEY) {
  console.error("❌ 缺少阿里云环境变量！请在 Render Dashboard 设置：");
  console.error("ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET, ALIYUN_APP_KEY");
}

const META_URL = 'https://nls-meta.cn-shanghai.aliyuncs.com/';
const TTS_URL = 'https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/tts';

// HMAC-SHA1 签名函数（阿里云要求）
function computeSignature(stringToSign, secret) {
  const signature = crypto
    .createHmac('sha1', secret + '&')
    .update(stringToSign, 'utf8')
    .digest('base64');
  return encodeURIComponent(signature);
}

// 获取临时 Token（有效期 30 分钟）
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

  // 构造待签名字符串
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

// TTS 合成接口
app.get('/', async (req, res) => {
  try {
    let text = req.query.text;
    if (!text) {
      return res.status(400).send('Missing "text" parameter');
    }

    // URL 解码（防止中文乱码）
    text = decodeURIComponent(tif (text.startsWith('%')) {
  text = decodeURIComponent(text);
}ext);

    // 可选参数
    const voice = req.query.voice || 'zhixiaoxia'; // 默认女声
    const sample_rate = req.query.sample_rate || '22050'; // 必须匹配 ESP32

    console.log(`合成语音: "${text}" (voice=${voice})`);

    // 获取 Token
    const token = await getAccessToken();

    // 请求 TTS（返回 WAV 流）
    const ttsResponse = await axios({
      method: 'POST',
      url: TTS_URL,
      responseType: 'stream',
      params: {
        appkey: APP_KEY,
        token: token,
        text: text,
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

    // 转发 WAV 到客户端
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-cache');
    ttsResponse.data.pipe(res);

  } catch (err) {
    console.error('TTS Error:', err.message || err);
    res.status(500).send('TTS Service Error');
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 阿里云 TTS 代理启动成功，监听端口 ${PORT}`);
});
