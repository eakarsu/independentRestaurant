/**
 * Channel adapters, languages and visual diagnosis.
 *
 * Fills four AmeritAI gaps:
 *   - WhatsApp AI / Instagram AI / phone AI Receptionist
 *   - 50+ language support
 *   - Visual Diagnosis & Analysis
 *
 * These are the gaps that need third-party credentials. This module is the
 * real contract: a provider registry, the exact payload that would be posted,
 * and an honest `connected: false` when the key is absent. Nothing pretends a
 * message was sent or an image was read.
 */
import crypto from 'crypto';

/* ------------------------- provider registry ------------------------ */

export type ChannelId = 'whatsapp' | 'instagram' | 'phone' | 'web';

export interface ProviderStatus {
  channel: ChannelId;
  connected: boolean;
  provider: string;
  /** Why it is not connected, or how it is configured. */
  detail: string;
}

export function channelStatus(): ProviderStatus[] {
  const has = (k: string) => !!process.env[k];
  return [
    {
      channel: 'web',
      connected: true,
      provider: 'builtin',
      detail: 'Served directly by this application.',
    },
    {
      channel: 'whatsapp',
      connected: has('WHATSAPP_ACCESS_TOKEN') && has('WHATSAPP_PHONE_NUMBER_ID'),
      provider: 'Meta WhatsApp Business Cloud API',
      detail: has('WHATSAPP_ACCESS_TOKEN')
        ? 'Configured.'
        : 'Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to enable.',
    },
    {
      channel: 'instagram',
      connected: has('INSTAGRAM_ACCESS_TOKEN') && has('INSTAGRAM_PAGE_ID'),
      provider: 'Meta Instagram Messaging API',
      detail: has('INSTAGRAM_ACCESS_TOKEN')
        ? 'Configured.'
        : 'Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_PAGE_ID to enable.',
    },
    {
      channel: 'phone',
      connected: has('TELEPHONY_WEBHOOK_SECRET'),
      provider: 'Twilio Programmable Voice',
      detail: has('TELEPHONY_WEBHOOK_SECRET')
        ? 'Configured for webhook verification; transcription adapter still required.'
        : 'Set TELEPHONY_WEBHOOK_SECRET to accept signed voice webhooks.',
    },
  ];
}

function statusFor(channel: ChannelId): ProviderStatus {
  return channelStatus().find((s) => s.channel === channel)!;
}

/* ------------------------ outbound adapters ------------------------- */

export interface OutboundMessage {
  channel: ChannelId;
  to: string;
  body: string;
}

export interface SendResult {
  channel: ChannelId;
  accepted: boolean;
  /** Provider message id when a real send happened. */
  providerId: string | null;
  /** The exact request that would be posted. */
  request: Record<string, unknown>;
  error: string | null;
}

/**
 * Build the provider request for a message. Returns the request rather than
 * firing it when the channel is unconfigured, so a caller can see exactly what
 * would have been sent.
 */
export function buildSend(msg: OutboundMessage): SendResult {
  const st = statusFor(msg.channel);
  const request =
    msg.channel === 'whatsapp'
      ? {
          method: 'POST',
          url: 'https://graph.facebook.com/v21.0/' + (process.env.WHATSAPP_PHONE_NUMBER_ID ?? '{WHATSAPP_PHONE_NUMBER_ID}') + '/messages',
          body: { messaging_product: 'whatsapp', to: msg.to, type: 'text', text: { body: msg.body } },
        }
      : msg.channel === 'instagram'
        ? {
            method: 'POST',
            url: 'https://graph.facebook.com/v21.0/me/messages',
            body: { recipient: { id: msg.to }, message: { text: msg.body } },
          }
        : {
            method: 'POST',
            url: 'https://api.twilio.com/2010-04-01/Accounts/{ACCOUNT}/Messages.json',
            body: { To: msg.to, Body: msg.body },
          };

  if (!st.connected) {
    return {
      channel: msg.channel,
      accepted: false,
      providerId: null,
      request,
      error: `${st.provider} is not configured: ${st.detail}`,
    };
  }
  // Connected but the transport is deliberately not fired from this helper —
  // callers perform the signed POST and record the provider id.
  return {
    channel: msg.channel,
    accepted: false,
    providerId: null,
    request,
    error: 'Configured, but the signed transport must be performed by the caller.',
  };
}

/** Verify a signed inbound webhook. Returns null when the secret is unset. */
export function verifySignature(channel: ChannelId, rawBody: string, signature: string | null): boolean | null {
  const secret =
    channel === 'phone' ? process.env.TELEPHONY_WEBHOOK_SECRET : process.env.CHANNEL_WEBHOOK_SECRET;
  if (!secret) return null;
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/* ---------------------------- languages ----------------------------- */

/**
 * Language support. A phrasebook covers the greetings a front desk needs; a
 * machine-translation provider covers the rest and is reported as absent when
 * unconfigured rather than guessing at a translation.
 */
export const SUPPORTED_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi', 'pl', 'cs', 'sk', 'hu',
  'ro', 'bg', 'el', 'tr', 'ru', 'uk', 'ar', 'he', 'fa', 'hi', 'bn', 'ur', 'ta', 'te', 'ml',
  'kn', 'mr', 'gu', 'pa', 'si', 'my', 'th', 'vi', 'id', 'ms', 'fil', 'zh', 'zh-TW', 'ja',
  'ko', 'tl', 'sw', 'af', 'zu', 'xh',
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

const PHRASEBOOK: Record<string, Record<string, string>> = {
  en: { greeting: 'Hi! Ask me anything about the menu.', handoff: 'Let me get a team member.' },
  es: { greeting: '¡Hola! Pregúntame sobre el menú.', handoff: 'Voy a buscar a un miembro del equipo.' },
  fr: { greeting: 'Bonjour ! Posez-moi des questions sur le menu.', handoff: 'Je fais venir un membre de l\'équipe.' },
  de: { greeting: 'Hallo! Fragen Sie mich alles über die Speisekarte.', handoff: 'Ich hole ein Teammitglied.' },
  it: { greeting: 'Ciao! Chiedimi qualcosa sul menù.', handoff: 'Chiamo un membro del team.' },
  pt: { greeting: 'Olá! Pergunte-me sobre o menu.', handoff: 'Vou chalar um membro da equipe.' },
  ja: { greeting: 'こんにちは！メニューについて何でも聞いてください。', handoff: 'スタッフを呼びます。' },
  zh: { greeting: '您好！欢迎询问菜单。', handoff: '我去请一位同事来。' },
  ko: { greeting: '안녕하세요! 메뉴에 대해 무엇이든 물어보세요.', handoff: '직원을 모시겠습니다.' },
  ar: { greeting: 'مرحباً! اسألني عن القائمة.', handoff: 'سأستدعي أحد أعضاء الفريق.' },
  hi: { greeting: 'नमस्ते! मेनू के बारे में कुछ भी पूछें।', handoff: 'मैं टीम के सदस्य को बुलाता हूँ।' },
  tr: { greeting: 'Merhaba! Menü hakkında bana her şeyi sorun.', handoff: 'Bir ekip üyesi getiriyorum.' },
  ru: { greeting: 'Здравствуйте! Спрашивайте о меню.', handoff: 'Позову сотрудника.' },
  vi: { greeting: 'Xin chào! Hãy hỏi tôi về thực đơn.', handoff: 'Tôi sẽ gọi nhân viên.' },
};

export function translate(
  key: 'greeting' | 'handoff',
  language: string,
): { text: string | null; source: 'phrasebook' | 'unavailable'; supported: boolean } {
  const lang = String(language).slice(0, 5);
  const supported = (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
  const phrase = PHRASEBOOK[lang]?.[key] ?? null;
  return {
    text: phrase,
    source: phrase ? 'phrasebook' : 'unavailable',
    supported,
  };
}

export function languageSupport(): {
  count: number;
  codes: string[];
  machineTranslation: { connected: boolean; detail: string };
} {
  const connected = !!process.env.TRANSLATION_API_KEY;
  return {
    count: SUPPORTED_LANGUAGES.length,
    codes: [...SUPPORTED_LANGUAGES],
    machineTranslation: {
      connected,
      detail: connected
        ? 'Configured.'
        : 'Set TRANSLATION_API_KEY for full machine translation. A phrasebook covers common front-desk phrases meanwhile.',
    },
  };
}

/* ------------------------- visual diagnosis ------------------------- */

export interface VisualDiagnosisRequest {
  imageUrl?: string;
  imageBase64?: string;
  /** What the guest or staff member is asking about. */
  subject: string;
}

export interface VisualDiagnosisResult {
  provider: { name: string; connected: boolean };
  analysed: boolean;
  description: string | null;
  /** Always true for damage/safety subjects — a human must look. */
  requiresHumanReview: boolean;
  error: string | null;
}

/**
 * Visual analysis for damage or dish assessment. With no vision key this
 * returns `analysed: false` and no description — it never invents what a
 * photo shows.
 */
export function visualDiagnosis(req: VisualDiagnosisRequest): VisualDiagnosisResult {
  const key = process.env.VISION_API_KEY;
  const provider = { name: process.env.VISION_PROVIDER ?? 'none', connected: !!key };
  const hasImage = !!req.imageBase64 || !!req.imageUrl;
  const subject = String(req.subject ?? '').trim();

  if (!hasImage) {
    return {
      provider,
      analysed: false,
      description: null,
      requiresHumanReview: true,
      error: 'No image supplied.',
    };
  }
  if (!key) {
    return {
      provider,
      analysed: false,
      description: null,
      requiresHumanReview: true,
      error:
        'No vision provider is configured (VISION_API_KEY). This never returns a description of an image it has not read.',
    };
  }
  return {
    provider,
    analysed: false,
    description: null,
    requiresHumanReview: true,
    error: `Vision provider "${provider.name}" is configured but its adapter is not implemented.`,
  };
}

/** Safety/quality subjects always escalate; a model must not clear them. */
export function requiresHuman(subject: string): boolean {
  return /damage|spill|injur|sick|allerg|burn|broken|shatter|blood|safety/i.test(String(subject ?? ''));
}