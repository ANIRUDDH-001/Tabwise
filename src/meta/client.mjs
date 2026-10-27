// The only way to call the Meta Model API (AGENTS.md "Model calls and money").
// Reserve the worst case, log the request, call /responses, settle actual usage.
// Errors keep the reservation open: we cannot tell whether Meta billed the call.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { priceOf } from '../budget/prices.mjs';

export const BASE_URL = 'https://api.meta.ai/v1';

export class ClientError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'ClientError';
    this.status = status;
  }
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function outputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((c) => typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
}

export async function respond({
  broker, model, input, maxOutputTokens, images = 0, task = null, runId = null, inputClass = null, record = {},
  fetchImpl = fetch, apiKey = process.env.MODEL_API_KEY, baseUrl = BASE_URL, logDir = 'cache/payloads',
}) {
  const redact = (s) => (apiKey ? String(s).split(apiKey).join('[redacted]') : String(s));
  if (!apiKey) throw new ClientError('MODEL_API_KEY is not set: add it to .env');
  // D-29 and Meta terms 6.1-6.2: Contributor inputs may train Meta's models, so only our own fixtures go there.
  if (priceOf(model)?.mode === 'contributor' && inputClass !== 'own-fixture') {
    throw new ClientError(`${model} takes only inputClass 'own-fixture' (D-29)`);
  }

  const body = { model, input, max_output_tokens: maxOutputTokens };
  const bodyText = JSON.stringify(body);
  // UTF-8 bytes of the whole request bound its token count from above.
  const r = broker.reserve({ model, inputTokens: Buffer.byteLength(bodyText, 'utf8'), maxOutputTokens, images, runId, task });

  mkdirSync(logDir, { recursive: true });
  const stem = join(logDir, `${runId ?? 'run'}-${r.id}`);
  writeFileSync(`${stem}-request.json`, bodyText);

  const started = Date.now();
  let res;
  let text;
  try {
    res = await fetchImpl(`${baseUrl}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: bodyText,
    });
    text = await res.text();
  } catch (e) {
    throw new ClientError(`request failed, reservation ${r.id} kept open: ${redact(e?.message ?? e)}`);
  }
  const latency = Date.now() - started;
  writeFileSync(`${stem}-response.json`, redact(text));
  if (!res.ok) throw new ClientError(`HTTP ${res.status}, reservation ${r.id} kept open: ${redact(text).slice(0, 500)}`, res.status);

  const data = JSON.parse(text);
  const u = data.usage;
  if (!u) throw new ClientError(`response has no usage, reservation ${r.id} kept open`);
  const usage = {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cached_tokens: u.cached_tokens ?? u.input_tokens_details?.cached_tokens ?? 0,
  };
  const out = outputText(data);
  const settled = broker.settle(r.id, {
    usage,
    record: { latency_ms: latency, retries: 0, input_sha256: sha256(bodyText), output_sha256: sha256(out), ...record },
  });
  return { text: out, data, usage, reservationId: r.id, ...settled };
}
