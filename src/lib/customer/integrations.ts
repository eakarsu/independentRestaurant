/**
 * Ecosystem integrations.
 *
 * Fills the AmeritAI "Connect Your Ecosystem" gap: Google Calendar, Outlook
 * Calendar, Shopify, Telegram and Facebook Messenger.
 *
 * Each adapter is the real contract — the exact request that would be posted
 * and an honest `connected: false` when its credential is absent. Nothing is
 * sent and no sync is claimed without the provider.
 */

export type IntegrationId =
  | 'google-calendar'
  | 'outlook-calendar'
  | 'shopify'
  | 'telegram'
  | 'messenger';

export interface IntegrationStatus {
  id: IntegrationId;
  name: string;
  connected: boolean;
  credential: string;
  capabilities: string[];
}

const DEFINITIONS: {
  id: IntegrationId;
  name: string;
  env: string[];
  capabilities: string[];
}[] = [
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    capabilities: ['reservation → calendar event', 'two-way busy lookups'],
  },
  {
    id: 'outlook-calendar',
    name: 'Outlook Calendar',
    env: ['OUTLOOK_CLIENT_ID', 'OUTLOOK_CLIENT_SECRET'],
    capabilities: ['reservation → calendar event', 'two-way busy lookups'],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    env: ['SHOPIFY_SHOP_DOMAIN', 'SHOPIFY_ACCESS_TOKEN'],
    capabilities: ['catalog sync', 'order lookup', 'stock alerts'],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    env: ['TELEGRAM_BOT_TOKEN'],
    capabilities: ['assistant over Telegram', 'handoff notifications'],
  },
  {
    id: 'messenger',
    name: 'Facebook Messenger',
    env: ['MESSENGER_PAGE_ACCESS_TOKEN', 'MESSENGER_VERIFY_TOKEN'],
    capabilities: ['assistant over Messenger', 'handoff notifications'],
  },
];

export function integrationStatus(): IntegrationStatus[] {
  return DEFINITIONS.map((d) => ({
    id: d.id,
    name: d.name,
    connected: d.env.every((k) => !!process.env[k]),
    credential: d.env.join(' + '),
    capabilities: d.capabilities,
  }));
}

export interface OutboundAction {
  integration: IntegrationId;
  action: string;
  payload: Record<string, unknown>;
}

export interface ActionResult {
  integration: IntegrationId;
  action: string;
  performed: boolean;
  request: Record<string, unknown>;
  error: string | null;
}

/** Build the provider request. Never claims an action was performed. */
export function buildAction(input: OutboundAction): ActionResult {
  const def = DEFINITIONS.find((d) => d.id === input.integration);
  if (!def) {
    return {
      integration: input.integration,
      action: input.action,
      performed: false,
      request: {},
      error: `Unknown integration: ${input.integration}`,
    };
  }
  const connected = def.env.every((k) => !!process.env[k]);

  const request: Record<string, unknown> =
    input.integration === 'google-calendar'
      ? {
          method: 'POST',
          url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          body: input.payload,
          auth: 'OAuth2 bearer token',
        }
      : input.integration === 'outlook-calendar'
        ? {
            method: 'POST',
            url: 'https://graph.microsoft.com/v1.0/me/events',
            body: input.payload,
            auth: 'OAuth2 bearer token',
          }
        : input.integration === 'shopify'
          ? {
              method: 'POST',
              url: `https://${process.env.SHOPIFY_SHOP_DOMAIN ?? 'SHOP'}/admin/api/2024-10/graphql.json`,
              body: { query: input.action, variables: input.payload },
              auth: 'X-Shopify-Access-Token',
            }
          : input.integration === 'telegram'
            ? {
                method: 'POST',
                url: `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN ?? 'TOKEN'}/sendMessage`,
                body: input.payload,
              }
            : {
                method: 'POST',
                url: 'https://graph.facebook.com/v21.0/me/messages',
                body: input.payload,
                auth: 'Bearer page access token',
              };

  return {
    integration: input.integration,
    action: input.action,
    performed: false,
    request,
    error: connected
      ? 'Configured, but the signed transport must be performed by the caller; nothing was sent.'
      : `${def.name} is not configured. Set ${def.env.join(" + ")}.`,
  };
}

export function integrationsSummary() {
  const all = integrationStatus();
  return {
    integrations: all,
    connected: all.filter((i) => i.connected).length,
    total: all.length,
    note: 'Each entry reports the credential it needs. Nothing is synced without it.',
  };
}