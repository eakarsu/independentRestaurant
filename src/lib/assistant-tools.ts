/**
 * Tool definitions and executors for the website AI assistant.
 *
 * The assistant uses OpenAI/OpenRouter-style function calling. Each tool is one
 * of two kinds:
 *   - read  → executed immediately, results fed back to the model.
 *   - write → NOT executed automatically. The route returns a `pendingAction`
 *             and the user must confirm before `commitWrite` runs.
 *
 * Keeping previews and commits in one place guarantees the confirmation summary
 * and the eventual DB write use identical logic.
 */
import { prisma } from "@/lib/prisma";

export type ToolKind = "read" | "write";

export interface ToolDef {
  kind: ToolKind;
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// OpenRouter expects { type: "function", function: {...} }.
export function toOpenRouterTools(defs: ToolDef[]) {
  return defs.map((d) => ({ type: "function" as const, function: d.function }));
}

// ---------------------------------------------------------------------------
// Endpoint registry — the catalog of app APIs the assistant can drive
// automatically. The model never names an endpoint to the user; it picks the
// right `id` here based on intent. Anything NOT listed cannot be called.
// `:param` segments are filled from the tool's `pathParams`.
// ---------------------------------------------------------------------------
export interface ApiEndpoint {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  kind: ToolKind;
  summary: string;
  params?: string; // hint to the model about query/body/path fields
}

export const ENDPOINTS: ApiEndpoint[] = [
  // ---- reads ----
  { id: "orders.list", method: "GET", path: "/api/orders", kind: "read", summary: "List orders", params: "query: status, type, date(YYYY-MM-DD)" },
  { id: "order.get", method: "GET", path: "/api/orders/:id", kind: "read", summary: "Get one order", params: "path: id" },
  { id: "reservations.list", method: "GET", path: "/api/reservations", kind: "read", summary: "List reservations", params: "query: date(YYYY-MM-DD), status" },
  { id: "tables.list", method: "GET", path: "/api/tables", kind: "read", summary: "List tables and today's reservations" },
  { id: "waitlist.list", method: "GET", path: "/api/waitlist", kind: "read", summary: "List the current waitlist" },
  { id: "customers.list", method: "GET", path: "/api/customers", kind: "read", summary: "List/search customers", params: "query: search" },
  { id: "staff.list", method: "GET", path: "/api/staff", kind: "read", summary: "List staff members" },
  { id: "schedules.list", method: "GET", path: "/api/schedules", kind: "read", summary: "List staff schedules", params: "query: date" },
  { id: "inventory.ingredients", method: "GET", path: "/api/inventory/ingredients", kind: "read", summary: "List inventory ingredients / stock levels" },
  { id: "inventory.vendors", method: "GET", path: "/api/inventory/vendors", kind: "read", summary: "List suppliers/vendors" },
  { id: "promotions.list", method: "GET", path: "/api/promotions", kind: "read", summary: "List promotions/discounts" },
  { id: "recipes.list", method: "GET", path: "/api/recipes", kind: "read", summary: "List recipes" },
  { id: "tips.list", method: "GET", path: "/api/tips", kind: "read", summary: "List tip distributions" },
  { id: "waste.list", method: "GET", path: "/api/waste", kind: "read", summary: "List waste records" },
  { id: "performance.summary", method: "GET", path: "/api/performance/summary", kind: "read", summary: "Performance summary metrics" },
  { id: "reports.get", method: "GET", path: "/api/reports", kind: "read", summary: "Sales/operations reports", params: "query: type, startDate, endDate" },
  { id: "notifications.list", method: "GET", path: "/api/notifications", kind: "read", summary: "List notifications", params: "query: status, type, channel" },
  { id: "locations.list", method: "GET", path: "/api/locations", kind: "read", summary: "List restaurant locations" },
  { id: "integrations.list", method: "GET", path: "/api/integrations", kind: "read", summary: "List third-party integrations and their status" },

  // ---- writes (require confirmation) ----
  { id: "waitlist.add", method: "POST", path: "/api/waitlist", kind: "write", summary: "Add a guest to the waitlist", params: "body: customerName, customerPhone, partySize, estimatedWait(min), notes" },
  { id: "waitlist.update", method: "PUT", path: "/api/waitlist/:id", kind: "write", summary: "Update a waitlist entry (e.g. status)", params: "path: id; body: status, notes" },
  { id: "reservation.update", method: "PUT", path: "/api/reservations/:id", kind: "write", summary: "Update a reservation (confirm/seat/change)", params: "path: id; body: status, partySize, date, time, notes" },
  { id: "reservation.cancel", method: "DELETE", path: "/api/reservations/:id", kind: "write", summary: "Cancel/delete a reservation", params: "path: id" },
  { id: "order.update", method: "PUT", path: "/api/orders/:id", kind: "write", summary: "Update an order (e.g. status)", params: "path: id; body: status, notes" },
  { id: "customer.create", method: "POST", path: "/api/customers", kind: "write", summary: "Create a customer", params: "body: name, email, phone" },
  { id: "customer.update", method: "PUT", path: "/api/customers/:id", kind: "write", summary: "Update a customer", params: "path: id; body fields" },
  { id: "promotion.create", method: "POST", path: "/api/promotions", kind: "write", summary: "Create a promotion/discount", params: "body: name, type, value, startDate, endDate" },
  { id: "table.update", method: "PUT", path: "/api/tables/:id", kind: "write", summary: "Update a table (e.g. status)", params: "path: id; body: status, capacity" },
  { id: "notification.send", method: "POST", path: "/api/notifications", kind: "write", summary: "Send/queue a notification", params: "body: type, channel, recipient, subject, message" },
  { id: "waste.record", method: "POST", path: "/api/waste", kind: "write", summary: "Record a waste entry", params: "body: ingredientId, quantity, reason" },
  { id: "ingredient.create", method: "POST", path: "/api/inventory/ingredients", kind: "write", summary: "Add an inventory ingredient", params: "body: name, unit, currentStock, parLevel, reorderPoint, cost, vendorId(optional)" },
  { id: "vendor.create", method: "POST", path: "/api/inventory/vendors", kind: "write", summary: "Add a supplier/vendor", params: "body: name, contactName, email, phone, address, paymentTerms" },
  { id: "menuitem.create", method: "POST", path: "/api/menu/items", kind: "write", summary: "Add a menu item", params: "body: name, categoryId, price, description, cost, prepTime, isAvailable" },
  { id: "recipe.create", method: "POST", path: "/api/recipes", kind: "write", summary: "Add a recipe for a menu item", params: "body: menuItemId, prepTime(min), cookTime(min), servings, difficulty(EASY|MEDIUM|HARD), instructions(array of step strings), notes" },
];

const ENDPOINTS_BY_ID = new Map(ENDPOINTS.map((e) => [e.id, e]));
export function findEndpoint(id: string): ApiEndpoint | undefined {
  return ENDPOINTS_BY_ID.get(id);
}
const READ_IDS = ENDPOINTS.filter((e) => e.kind === "read").map((e) => e.id);
const WRITE_IDS = ENDPOINTS.filter((e) => e.kind === "write").map((e) => e.id);

/** Compact catalog injected into the system prompt so the model knows options. */
export function endpointCatalog(): string {
  return ENDPOINTS.map(
    (e) => `- ${e.id} (${e.kind}): ${e.summary}${e.params ? ` [${e.params}]` : ""}`,
  ).join("\n");
}

function resolvePath(path: string, pathParams: Record<string, unknown> = {}): string {
  return path.replace(/:([A-Za-z]+)/g, (_, key) => {
    const v = pathParams[key];
    if (v == null || v === "") throw new Error(`Missing path parameter "${key}".`);
    return encodeURIComponent(String(v));
  });
}

export const ASSISTANT_TOOLS: ToolDef[] = [
  {
    kind: "read",
    function: {
      name: "get_menu",
      description:
        "List currently available menu items, optionally filtered by category name (e.g. 'Appetizers', 'Drinks'). Use to answer questions about dishes, prices, and what can be ordered.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Optional category name to filter by." },
        },
      },
    },
  },
  {
    kind: "read",
    function: {
      name: "check_availability",
      description:
        "Check which tables can seat a party on a given date. Returns the number of tables free and a few options. Use before offering a reservation time.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format." },
          partySize: { type: "integer", description: "Number of guests." },
        },
        required: ["date", "partySize"],
      },
    },
  },
  {
    kind: "read",
    function: {
      name: "list_reservations",
      description:
        "Look up existing reservations, optionally for a specific date (YYYY-MM-DD) or a customer's phone number.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Optional date in YYYY-MM-DD format." },
          customerPhone: { type: "string", description: "Optional customer phone number." },
        },
      },
    },
  },
  {
    kind: "write",
    function: {
      name: "create_reservation",
      description:
        "Create a new reservation. Always collect the guest name, phone number, party size, date and time first. Requires user confirmation before it is saved.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string" },
          customerPhone: { type: "string" },
          customerEmail: { type: "string" },
          partySize: { type: "integer" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "24h HH:MM, e.g. 19:30" },
          specialOccasion: { type: "string", description: "e.g. Birthday, Anniversary" },
          notes: { type: "string" },
        },
        required: ["customerName", "customerPhone", "partySize", "date", "time"],
      },
    },
  },
  {
    kind: "write",
    function: {
      name: "create_order",
      description:
        "Place a food order. Provide the items by menu item name and quantity. Requires user confirmation before it is saved.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["DINE_IN", "TAKEOUT", "DELIVERY"],
            description: "Order type. Default DINE_IN.",
          },
          tableNumber: { type: "integer", description: "Table number for dine-in orders." },
          customerName: { type: "string" },
          notes: { type: "string" },
          items: {
            type: "array",
            description: "Items to order.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Menu item name (or close match)." },
                quantity: { type: "integer" },
                notes: { type: "string" },
              },
              required: ["name", "quantity"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
  {
    kind: "read",
    function: {
      name: "query_data",
      description:
        "Look up any data in the system by choosing an endpoint id from the catalog in the system prompt (the read endpoints). Use this for anything not covered by the specific tools above — staff, inventory, customers, waitlist, promotions, reports, etc.",
      parameters: {
        type: "object",
        properties: {
          endpoint: { type: "string", enum: READ_IDS, description: "Read endpoint id from the catalog." },
          pathParams: { type: "object", description: "Values for :id style path segments, e.g. { id: \"abc\" }." },
          query: { type: "object", description: "Optional query-string filters, e.g. { date: \"2026-06-21\" }." },
        },
        required: ["endpoint"],
      },
    },
  },
  {
    kind: "write",
    function: {
      name: "perform_action",
      description:
        "Create, update, or delete data by choosing a write endpoint id from the catalog in the system prompt. Use for anything not covered by create_reservation/create_order — e.g. cancel a reservation, add to waitlist, update an order status. Requires user confirmation before it runs.",
      parameters: {
        type: "object",
        properties: {
          endpoint: { type: "string", enum: WRITE_IDS, description: "Write endpoint id from the catalog." },
          pathParams: { type: "object", description: "Values for :id style path segments, e.g. { id: \"abc\" }." },
          body: { type: "object", description: "Request body fields per the catalog hint for this endpoint." },
        },
        required: ["endpoint"],
      },
    },
  },
];

export const TOOL_KIND: Record<string, ToolKind> = Object.fromEntries(
  ASSISTANT_TOOLS.map((t) => [t.function.name, t.kind]),
);

// ---------------------------------------------------------------------------
// Read tool executors
// ---------------------------------------------------------------------------

export async function runReadTool(name: string, args: any): Promise<unknown> {
  switch (name) {
    case "query_data": {
      const ep = findEndpoint(args?.endpoint);
      if (!ep || ep.kind !== "read") {
        throw new Error(`Unknown data endpoint "${args?.endpoint}".`);
      }
      let path = resolvePath(ep.path, args?.pathParams || {});
      if (args?.query && typeof args.query === "object") {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(args.query)) {
          if (v != null && v !== "") qs.append(k, String(v));
        }
        const s = qs.toString();
        if (s) path += `?${s}`;
      }
      const data = await requestApi("GET", path);
      return truncateResult(data);
    }
    case "get_menu": {
      const items = await prisma.menuItem.findMany({
        where: {
          isAvailable: true,
          is86d: false,
          ...(args?.category
            ? { category: { name: { contains: args.category, mode: "insensitive" } } }
            : {}),
        },
        include: { category: true },
        orderBy: { name: "asc" },
      });
      // The same dish exists once per location, so dedupe by name to give the
      // model one clean entry per item (otherwise long duplicate lists cause it
      // to unreliably "miss" available items).
      const byName = new Map<string, { name: string; price: number; category?: string; description: string | null }>();
      for (const i of items) {
        if (!byName.has(i.name)) {
          byName.set(i.name, {
            name: i.name,
            price: i.price,
            category: i.category?.name,
            description: i.description,
          });
        }
      }
      const unique = [...byName.values()];
      return { count: unique.length, items: unique };
    }
    case "check_availability": {
      const partySize = Number(args.partySize) || 1;
      const start = new Date(args.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(args.date);
      end.setHours(23, 59, 59, 999);

      const tables = await prisma.table.findMany({
        where: { capacity: { gte: partySize } },
        include: {
          reservations: {
            where: {
              date: { gte: start, lt: end },
              status: { in: ["PENDING", "CONFIRMED", "SEATED"] },
            },
          },
        },
        orderBy: { capacity: "asc" },
      });
      const free = tables.filter((t) => t.reservations.length === 0);
      return {
        date: args.date,
        partySize,
        tablesThatFit: tables.length,
        tablesAvailable: free.length,
        options: free.slice(0, 5).map((t) => ({ tableNumber: t.number, seats: t.capacity })),
      };
    }
    case "list_reservations": {
      const where: Record<string, unknown> = {};
      if (args?.date) {
        const start = new Date(args.date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(args.date);
        end.setHours(23, 59, 59, 999);
        where.date = { gte: start, lt: end };
      }
      if (args?.customerPhone) where.customerPhone = args.customerPhone;
      const reservations = await prisma.reservation.findMany({
        where,
        orderBy: [{ date: "asc" }, { time: "asc" }],
        include: { table: true },
        take: 25,
      });
      return {
        count: reservations.length,
        reservations: reservations.map((r) => ({
          customerName: r.customerName,
          partySize: r.partySize,
          date: r.date.toISOString().split("T")[0],
          time: r.time.toISOString().substring(11, 16),
          status: r.status,
          table: r.table?.number ?? null,
        })),
      };
    }
    default:
      throw new Error(`Unknown read tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Write tools — preview (for confirmation) and commit (after confirmation)
// ---------------------------------------------------------------------------

export interface WritePreview {
  summary: string; // human-readable confirmation text
  normalized: any; // enriched args used by commitWrite
}

/** Combine a date (YYYY-MM-DD) and 24h time (HH:MM) into a Date. */
function combineDateTime(date: string, time: string): Date {
  const d = new Date(`${date}T${(time || "00:00").padStart(5, "0")}:00`);
  if (isNaN(d.getTime())) throw new Error("Invalid date or time.");
  return d;
}

/**
 * Validate and enrich a write action. Throws a user-friendly Error when the
 * request can't be fulfilled (the model relays it and asks for a correction).
 */
export async function previewWrite(name: string, args: any): Promise<WritePreview> {
  switch (name) {
    case "perform_action": {
      const ep = findEndpoint(args?.endpoint);
      if (!ep || ep.kind !== "write") {
        throw new Error(`Unknown action endpoint "${args?.endpoint}".`);
      }
      const path = resolvePath(ep.path, args?.pathParams || {});
      const detail =
        args?.body && Object.keys(args.body).length > 0
          ? ` — ${JSON.stringify(args.body)}`
          : args?.pathParams && Object.keys(args.pathParams).length > 0
            ? ` (${JSON.stringify(args.pathParams)})`
            : "";
      return {
        summary: `${ep.summary}${detail}`,
        normalized: { method: ep.method, path, body: args?.body },
      };
    }
    case "create_reservation": {
      if (!args.customerName || !args.customerPhone)
        throw new Error("A guest name and phone number are required.");
      const partySize = Number(args.partySize);
      if (!partySize || partySize < 1) throw new Error("Party size must be at least 1.");
      const dateTime = combineDateTime(args.date, args.time);
      const normalized = {
        customerName: String(args.customerName),
        customerPhone: String(args.customerPhone),
        customerEmail: args.customerEmail ? String(args.customerEmail) : null,
        partySize,
        // Store `date` as the full reservation datetime (not bare YYYY-MM-DD,
        // which becomes UTC midnight and lands on the previous local day in
        // behind-UTC timezones, hiding the booking from the day's view).
        date: dateTime.toISOString(),
        time: dateTime.toISOString(),
        specialOccasion: args.specialOccasion || null,
        notes: args.notes || null,
      };
      const when = dateTime.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      const summary =
        `Reserve a table for ${partySize} under ${normalized.customerName} ` +
        `on ${when}` +
        (normalized.specialOccasion ? ` (${normalized.specialOccasion})` : "") +
        `. Phone: ${normalized.customerPhone}.`;
      return { summary, normalized };
    }
    case "create_order": {
      const reqItems: any[] = Array.isArray(args.items) ? args.items : [];
      if (reqItems.length === 0) throw new Error("No items were provided for the order.");

      const resolved = [];
      let subtotal = 0;
      for (const it of reqItems) {
        const match = await prisma.menuItem.findFirst({
          where: { name: { contains: String(it.name), mode: "insensitive" }, isAvailable: true, is86d: false },
        });
        if (!match) throw new Error(`Menu item "${it.name}" was not found or is unavailable.`);
        const qty = Math.max(1, Number(it.quantity) || 1);
        subtotal += match.price * qty;
        resolved.push({
          menuItemId: match.id,
          name: match.name,
          quantity: qty,
          unitPrice: match.price,
          notes: it.notes || null,
        });
      }

      let tableId: string | null = null;
      if (args.tableNumber != null) {
        const table = await prisma.table.findFirst({ where: { number: Number(args.tableNumber) } });
        if (!table) throw new Error(`Table ${args.tableNumber} was not found.`);
        tableId = table.id;
      }

      const tax = subtotal * 0.0875;
      const total = subtotal + tax;
      const normalized = {
        type: args.type || "DINE_IN",
        tableId,
        tableNumber: args.tableNumber ?? null,
        customerName: args.customerName || null,
        notes: args.notes || null,
        items: resolved,
        subtotal,
        tax,
        total,
      };
      const lines = resolved.map((r) => `${r.quantity}× ${r.name}`).join(", ");
      const summary =
        `Place a ${normalized.type.replace("_", " ").toLowerCase()} order: ${lines}. ` +
        `Total $${total.toFixed(2)} (incl. tax)` +
        (args.tableNumber != null ? ` for table ${args.tableNumber}` : "") +
        `.`;
      return { summary, normalized };
    }
    default:
      throw new Error(`Unknown write tool: ${name}`);
  }
}

/** Base URL the app's own API routes are reachable at (server-to-server). */
function apiBase(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/** Call one of the app's own API routes (server-to-server) and return JSON. */
async function requestApi(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `API ${path} returned ${res.status}`);
  }
  return data;
}

/** Back-compat alias for the two specialized POST writes. */
const postApi = (path: string, body: unknown) => requestApi("POST", path, body);

/** Trim large/paginated read payloads so the model isn't flooded with tokens. */
function truncateResult(data: any): unknown {
  if (Array.isArray(data)) {
    return { count: data.length, items: data.slice(0, 25) };
  }
  if (data && Array.isArray(data.data)) {
    return { ...data, data: data.data.slice(0, 25), _truncated: data.data.length > 25 };
  }
  return data;
}

/**
 * Execute a previously previewed + confirmed write action by calling the app's
 * real API endpoints — so reservations/orders go through the exact same code
 * path (validation, order numbering, socket events, confirmation email) as the
 * rest of the system, instead of writing the database directly.
 */
export async function commitWrite(name: string, args: any): Promise<unknown> {
  // Re-derive from normalized args to guarantee server-side integrity.
  const { normalized } = await previewWrite(name, args);

  switch (name) {
    case "perform_action": {
      // Generic catalog-driven write: call the chosen endpoint directly.
      return await requestApi(normalized.method, normalized.path, normalized.body);
    }
    case "create_reservation": {
      // Calls POST /api/reservations and inserts a Reservation row.
      const r = await postApi("/api/reservations", {
        customerName: normalized.customerName,
        customerPhone: normalized.customerPhone,
        customerEmail: normalized.customerEmail,
        partySize: normalized.partySize,
        date: normalized.date,
        time: normalized.time,
        specialOccasion: normalized.specialOccasion,
        notes: normalized.notes,
        status: "PENDING",
        source: "ai_bot",
      });
      return {
        ok: true,
        reservationId: r.id,
        status: r.status,
        customerName: r.customerName,
        partySize: r.partySize,
      };
    }
    case "create_order": {
      // Calls POST /api/orders, which computes totals and inserts the Order row.
      const order = await postApi("/api/orders", {
        type: normalized.type,
        tableId: normalized.tableId,
        notes: normalized.notes,
        source: "ai_bot",
        items: normalized.items.map((i: any) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          notes: i.notes,
        })),
      });
      return { ok: true, orderNumber: order.orderNumber, total: order.total };
    }
    default:
      throw new Error(`Unknown write tool: ${name}`);
  }
}
