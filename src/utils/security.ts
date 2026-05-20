import * as crypto from 'crypto'

export function verifyWebhookSignature(
  payload: any,
  signature: string,
  secret: string
) {
  const payloadString =
    typeof payload === 'string'
      ? payload
      : JSON.stringify(payload);

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadString, 'utf8')
    .digest('hex');

  const receivedSignature = signature.replace('sha256=', '');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(receivedSignature, 'hex')
  );
}