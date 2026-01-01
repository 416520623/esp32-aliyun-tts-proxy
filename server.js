// server.js - 阿里云 TTS 代理服务（Node.js + Express）
require('dotenv').config(); // 加载 .env 文件（必须在最顶部！）

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

// 从环境变量读取阿里云凭证
const ACCESS_KEY_ID = process.env.ALIYUN_ACCESS_KEY_ID;
const ACCESS_KEY_SECRET = process.env.ALIYUN_ACCESS_KEY_SECRET;
const APP_KEY = process.env.ALIYUN_APP_KEY;

// 阿里云 TTS 区域：华东2（上海）
const META_URL = 'https://nls-meta.cn-shanghai.aliyuncs.com/';
const TTS_URL = 'https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/tts';

// 检查必要环境变量
if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET || !APP_KEY) {
  console.error('❌ 缺少阿里云环境变量！请确保 .env 文件存在且包含：');
  console.error('ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET, ALIYUN_APP_KEY');
  process.exit(1);
}

// 生成阿里云签名
function signString(source, secret) {
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(source, 'utf8');
  return hmac.digest('base64');
}

// 获取访问令牌
async function getAccessToken() {
  try {
    const timestamp = Date.now();
    const params = new URLSearchParams({
      AccessKeyId: ACCESS_KEY_ID,
      Action: 'CreateToken',
      Format: 'JSON',
      RegionId: 'cn-shanghai',
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: Math.random().toString(36).substring(2),
      SignatureVersion: '1.0',
      Timestamp: new Date(timestamp).toISOString(),
      Version: '2019-02-28'
    });

    const stringToSign = `GET&%2F&${encodeURIComponent(params.toString())}`;
    const signature = signString(stringToSign, `${ACCESS_KEY_SECRET}&`);

    const url = `${META_URL}?${params.toString()}&Signature=${encodeURIComponent(signature)}`;
    const response = await axios.get(url);
    
    if (response.data && response.data.Token && response.data.Token.Id) {
      return response.data.Token.Id;
    } else {
      throw new Error('Token 格式异常');
    }
  } catch (error) {
    console.error('❌ 获取 Token 失败:', error.message);
    throw error;
  }
}

// 创建 Express 应用
const app = express();
const PORT = process.env.PORT || 3000;

// 路由：TTS 合成
app.get('/', async (req, res) => {
  try {
    let { text, voice = 'zhixiaoxia', sample_rate = '22050' } = req.query;

    // 参数校验
    if (!text) {
      return res.status(400).send('❌ 缺少参数: text');
    }
    if (text.length > 300) {
      return res.status(400).send('❌ 文本过长（最大300字符）');
    }

    // 获取 Token
    const token = await getAccessToken();

    // 构建 TTS 请求 URL
    const ttsParams = new URLSearchParams({
      appkey: APP_KEY,
      token: token,
      text: encodeURIComponent(text),
      format: 'wav',
      sample_rate: sample_rate,
      voice: voice,
      volume: '50',
      speech_rate: '0'
    });

    const ttsUrl = `${TTS_URL}?${ttsParams.toString()}`;

    // 转发请求到阿里云 TTS
    const ttsResponse = await axios({
      method: 'POST',
      url: ttsUrl,
      responseType: 'stream',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'audio/wav'
      }
    });

    // 设置响应头并流式返回音频
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `inline; filename="tts_${Date.now()}.wav"`);
    ttsResponse.data.pipe(res);

    console.log(`🔊 合成语音: "${text}" | voice=${voice} | sample_rate=${sample_rate}`);

  } catch (error) {
    console.error('❌ TTS 请求失败:', error.message);
    res.status(500).send('TTS Service Error. Check logs.');
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 阿里云 TTS 代理启动成功！监听端口: ${PORT}`);
  console.log(`📌 访问示例: /?text=你好世界&voice=zhixiaoxia`);
});
