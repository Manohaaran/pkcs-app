const https = require('https');

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Scan service not configured.' }) };

  const { imageBase64, mimeType } = JSON.parse(event.body || '{}');
  if (!imageBase64 || !mimeType) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing image data.' }) };

  const prompt = `Read this handwritten note page and return ONLY this JSON object, no markdown, no explanation:
{"title":"","date":"YYYY-MM-DD or empty","facilitator":"","sourceType":"Meeting|Training|AI Session|Briefing|Conference|Workshop|Webinar|Other","suggestedTopicCode":"GOV|PRO|VND|STR|FIN|OPS|HR|AI|LEG|TRN|MKT|CUS","cueNotes":"","mainNotes":"","synthesis":"","actionNotes":"","confidence":"high|medium|low"}`;

  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
      { type: 'text', text: prompt }
    ]}]
  });

  const result = await new Promise((res, rej) => {
    const req = https.request({
      hostname: 'api.anthropic.com', port: 443, path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
    req.on('error', rej);
    req.write(body);
    req.end();
  });

  if (result.status !== 200) {
    console.error('Anthropic:', result.status, result.body.slice(0, 200));
    return { statusCode: result.status, headers: cors, body: JSON.stringify({ error: 'Scan failed (' + result.status + ').' }) };
  }

  const text = JSON.parse(result.body).content?.find(b => b.type === 'text')?.text || '';
  const extracted = JSON.parse(text.replace(/```json|```/g, '').trim());
  return { statusCode: 200, headers: cors, body: JSON.stringify(extracted) };
};
