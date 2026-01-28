import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-3-haiku";

async function callOpenRouter(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OpenRouter API key not configured");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
      "X-Title": "Restaurant AI Platform",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("OpenRouter error:", error);
    throw new Error(`OpenRouter API error: ${response.status}`);
  }

  const result = await response.json();
  return result.choices[0]?.message?.content || "";
}

// AI endpoint for various features
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data } = body;

    switch (action) {
      case "menu_optimization": {
        // Analyze menu item performance and suggest optimizations
        const items = await prisma.menuItem.findMany({
          include: {
            category: true,
            orderItems: {
              where: {
                createdAt: {
                  gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                },
              },
            },
          },
        });

        const menuData = items.map((item) => {
          const salesCount = item.orderItems.reduce((sum, oi) => sum + oi.quantity, 0);
          const revenue = item.orderItems.reduce((sum, oi) => sum + oi.totalPrice, 0);
          const margin = item.cost ? ((item.price - item.cost) / item.price) * 100 : null;
          return {
            name: item.name,
            category: item.category?.name || "Uncategorized",
            price: item.price,
            cost: item.cost,
            salesCount,
            revenue,
            margin,
          };
        });

        const systemPrompt = `You are a restaurant menu optimization expert. Analyze the menu data and provide specific, actionable recommendations. Focus on:
1. Items that should be removed (low sales, low margin)
2. Items to feature/promote (high performers)
3. Pricing adjustments needed
4. Menu engineering suggestions (stars, puzzles, plowhorses, dogs)
Respond in JSON format with an array of recommendations, each having: item, salesCount, revenue, margin, suggestion`;

        const userPrompt = `Analyze this menu performance data and provide optimization recommendations:\n${JSON.stringify(menuData, null, 2)}`;

        try {
          const aiResponse = await callOpenRouter(systemPrompt, userPrompt);
          const parsed = JSON.parse(aiResponse);
          return NextResponse.json({ recommendations: parsed.recommendations || parsed });
        } catch {
          // Fallback to rule-based logic
          const recommendations = menuData.map((item) => {
            let suggestion = "";
            if (item.salesCount < 5) {
              suggestion = "Consider removing or revamping this low-selling item";
            } else if (item.margin && item.margin < 30) {
              suggestion = "Consider increasing price to improve margin";
            } else if (item.salesCount > 50 && item.margin && item.margin > 50) {
              suggestion = "High performer! Consider featuring as special";
            }
            return {
              item: item.name,
              salesCount: item.salesCount,
              revenue: item.revenue,
              margin: item.margin ? `${item.margin.toFixed(1)}%` : "N/A",
              suggestion,
            };
          }).filter((r) => r.suggestion);
          return NextResponse.json({ recommendations });
        }
      }

      case "demand_forecast": {
        // Get historical order data
        const historicalOrders = await prisma.order.groupBy({
          by: ["createdAt"],
          where: {
            createdAt: {
              gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            },
            status: { not: "CANCELLED" },
          },
          _count: true,
        });

        const reservations = await prisma.reservation.findMany({
          where: {
            date: {
              gte: new Date(),
              lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            },
            status: { in: ["CONFIRMED", "PENDING"] },
          },
        });

        const systemPrompt = `You are a restaurant demand forecasting expert. Analyze historical order patterns and upcoming reservations to predict demand for the next 7 days. Consider:
1. Day of week patterns
2. Upcoming reservations
3. Seasonal trends
4. Special events
Respond in JSON format with forecast array containing: dayOfWeek (0-6), dayName, avgOrders, predictedCovers, confidence, notes`;

        const orderSummary = historicalOrders.reduce((acc, day) => {
          const dow = new Date(day.createdAt).getDay();
          if (!acc[dow]) acc[dow] = [];
          acc[dow].push(day._count);
          return acc;
        }, {} as Record<number, number[]>);

        const userPrompt = `Historical orders by day of week:\n${JSON.stringify(orderSummary)}\n\nUpcoming reservations:\n${JSON.stringify(reservations.map(r => ({ date: r.date, partySize: r.partySize })))}`;

        try {
          const aiResponse = await callOpenRouter(systemPrompt, userPrompt);
          const parsed = JSON.parse(aiResponse);
          return NextResponse.json({ forecast: parsed.forecast || parsed });
        } catch {
          // Fallback
          const dayAverages: Record<number, number[]> = {};
          historicalOrders.forEach((day) => {
            const dow = new Date(day.createdAt).getDay();
            if (!dayAverages[dow]) dayAverages[dow] = [];
            dayAverages[dow].push(day._count);
          });

          const forecast = Object.entries(dayAverages).map(([dow, counts]) => ({
            dayOfWeek: parseInt(dow),
            dayName: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parseInt(dow)],
            avgOrders: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length),
            predictedCovers: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length * 2.5),
          }));
          return NextResponse.json({ forecast });
        }
      }

      case "inventory_prediction": {
        // Predict inventory needs based on usage
        const ingredients = await prisma.ingredient.findMany({
          include: {
            vendor: true,
            stockMovements: {
              where: {
                createdAt: {
                  gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
                },
              },
            },
          },
        });

        const inventoryData = ingredients.map((ing) => {
          const usedMovements = ing.stockMovements.filter(m => m.type === "USED");
          const totalUsed = usedMovements.reduce((sum, m) => sum + Math.abs(m.quantity), 0);
          return {
            name: ing.name,
            currentStock: ing.currentStock,
            unit: ing.unit,
            parLevel: ing.parLevel,
            totalUsed14Days: totalUsed,
            vendor: ing.vendor?.name,
          };
        });

        const systemPrompt = `You are a restaurant inventory management expert. Analyze inventory levels and usage patterns to predict what needs to be ordered. Consider:
1. Current stock vs par levels
2. Usage trends
3. Lead times
4. Upcoming demand
Respond in JSON format with predictions array containing: ingredient, currentStock, unit, dailyUsage, daysUntilEmpty, suggestedOrder, urgent (boolean), notes`;

        try {
          const aiResponse = await callOpenRouter(systemPrompt, `Inventory data:\n${JSON.stringify(inventoryData, null, 2)}`);
          const parsed = JSON.parse(aiResponse);
          return NextResponse.json({ predictions: parsed.predictions || parsed });
        } catch {
          // Fallback - show all ingredients with their status
          const predictions = ingredients.map((ing) => {
            const usedMovements = ing.stockMovements.filter(m => m.type === "USED");
            const totalUsed = usedMovements.reduce((sum, m) => sum + Math.abs(m.quantity), 0);
            const dailyUsage = totalUsed / 14;
            const daysUntilEmpty = dailyUsage > 0 ? ing.currentStock / dailyUsage : 999;
            const suggestedOrder = Math.max(0, ing.parLevel - ing.currentStock + dailyUsage * 7);
            const belowPar = ing.currentStock < ing.parLevel;

            return {
              ingredient: ing.name,
              currentStock: ing.currentStock,
              unit: ing.unit,
              dailyUsage: dailyUsage.toFixed(2),
              daysUntilEmpty: daysUntilEmpty === 999 ? null : Math.round(daysUntilEmpty),
              suggestedOrder: Math.ceil(suggestedOrder),
              urgent: daysUntilEmpty < 3 || belowPar,
              status: daysUntilEmpty < 3 ? "critical" : daysUntilEmpty < 7 ? "low" : belowPar ? "below_par" : "healthy",
            };
          }).sort((a, b) => (a.daysUntilEmpty ?? 999) - (b.daysUntilEmpty ?? 999));
          return NextResponse.json({ predictions });
        }
      }

      case "review_response": {
        const { rating, comment, customerName } = data;

        const systemPrompt = `You are a professional restaurant manager crafting responses to customer reviews. Create personalized, warm, and professional responses that:
1. Thank the customer by name
2. Address specific points from their feedback
3. For negative reviews, apologize sincerely and offer to make things right
4. For positive reviews, express genuine gratitude
5. Keep responses concise (2-4 sentences)
Do not use generic templates. Make each response feel personal and authentic.`;

        const userPrompt = `Write a response to this ${rating}-star review from ${customerName}:\n"${comment}"`;

        try {
          const response = await callOpenRouter(systemPrompt, userPrompt);
          return NextResponse.json({ response });
        } catch {
          // Fallback
          let response = "";
          if (rating >= 4) {
            response = `Thank you so much for your wonderful ${rating}-star review, ${customerName}! We're thrilled to hear you enjoyed your experience with us. Your kind words mean the world to our team, and we can't wait to welcome you back soon!`;
          } else if (rating === 3) {
            response = `Thank you for taking the time to share your feedback, ${customerName}. We appreciate your honest review and are always looking for ways to improve. We'd love the opportunity to exceed your expectations on your next visit.`;
          } else {
            response = `We sincerely apologize for not meeting your expectations, ${customerName}. Your feedback is incredibly valuable to us, and we take it seriously. We would love the opportunity to make things right. Please reach out to us directly so we can address your concerns.`;
          }
          return NextResponse.json({ response });
        }
      }

      case "marketing_generator": {
        const { type, occasion, restaurantName, specialItems } = data;

        // Get top menu items for context
        const topItems = await prisma.menuItem.findMany({
          where: { isAvailable: true },
          take: 5,
          orderBy: { price: "desc" },
        });

        const systemPrompt = `You are a creative restaurant marketing expert. Generate engaging ${type === "email" ? "email marketing" : "social media"} content that:
1. Captures attention immediately
2. Highlights the restaurant's unique offerings
3. Creates urgency or excitement
4. Includes a clear call-to-action
5. ${type === "social" ? "Uses relevant hashtags and emojis appropriately" : "Has a compelling subject line"}
Keep the tone professional but warm and inviting.`;

        const userPrompt = `Create ${type === "email" ? "an email" : "a social media post"} for ${occasion}.
Restaurant: ${restaurantName || "Our Restaurant"}
Featured items: ${topItems.map(i => i.name).join(", ")}
${specialItems ? `Special focus: ${specialItems}` : ""}`;

        try {
          const content = await callOpenRouter(systemPrompt, userPrompt);
          return NextResponse.json({ content });
        } catch {
          // Fallback
          const templates: Record<string, Record<string, string>> = {
            email: {
              holiday: "Celebrate the season with us! Enjoy our special holiday menu featuring festive favorites. Book your table today and create memories that last a lifetime.",
              promotion: "For a limited time only! Enjoy 20% off your entire order. Use code SAVE20 when booking online. Don't miss out on this delicious deal!",
              newItem: "Introducing our newest culinary creation! Our chef has crafted something special just for you. Be among the first to try our latest menu addition.",
            },
            social: {
              holiday: "Tis the season for great food! Join us for a memorable holiday dining experience. Link in bio to reserve your spot! #HolidayDining #FineDining",
              promotion: "FLASH SALE! 20% off all orders this weekend only! Tag a friend who needs to know about this deal! #FoodDeals #WeekendVibes",
              newItem: "NEW MENU ALERT! Our chef just dropped something incredible. Swipe to see what's cooking! #NewDish #FoodieFinds",
            },
          };
          const content = templates[type]?.[occasion] || "Check out our latest offerings! We can't wait to serve you.";
          return NextResponse.json({ content });
        }
      }

      case "staff_schedule": {
        const { date } = data;
        const targetDate = new Date(date);

        // Get existing staff
        const staff = await prisma.staff.findMany({
          where: { status: "ACTIVE" },
        });

        // Get reservations for the date
        const reservations = await prisma.reservation.findMany({
          where: {
            date: {
              gte: new Date(targetDate.setHours(0, 0, 0, 0)),
              lt: new Date(targetDate.setHours(23, 59, 59, 999)),
            },
            status: { in: ["CONFIRMED", "PENDING"] },
          },
        });

        const totalCovers = reservations.reduce((sum, r) => sum + r.partySize, 0);

        const systemPrompt = `You are a restaurant staffing expert. Create an optimal staff schedule based on:
1. Expected customer volume
2. Staff availability and roles
3. Labor cost optimization
4. Service quality requirements
Respond in JSON format with schedule array containing: role, recommended (number), shifts (array with time and count)`;

        const userPrompt = `Create staffing schedule for ${targetDate.toDateString()}
Day of week: ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][targetDate.getDay()]}
Expected covers from reservations: ${totalCovers}
Available staff by position: ${JSON.stringify(staff.reduce((acc, s) => {
  acc[s.position] = (acc[s.position] || 0) + 1;
  return acc;
}, {} as Record<string, number>))}`;

        try {
          const aiResponse = await callOpenRouter(systemPrompt, userPrompt);
          const parsed = JSON.parse(aiResponse);
          return NextResponse.json({ schedule: parsed.schedule || parsed, date: targetDate.toISOString() });
        } catch {
          // Fallback
          const dow = targetDate.getDay();
          const baseStaffing: Record<string, Record<number, number>> = {
            Server: { 0: 3, 1: 2, 2: 2, 3: 3, 4: 4, 5: 5, 6: 4 },
            Host: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 1 },
            Chef: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 3, 5: 3, 6: 2 },
            Bartender: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2 },
          };

          const schedule = Object.entries(baseStaffing).map(([role, days]) => ({
            role,
            recommended: days[dow],
            shifts: [
              { time: "11:00 AM - 4:00 PM", count: Math.ceil(days[dow] / 2) },
              { time: "4:00 PM - 10:00 PM", count: days[dow] },
            ],
          }));
          return NextResponse.json({ schedule, date: targetDate.toISOString() });
        }
      }

      case "cost_analysis": {
        const items = await prisma.menuItem.findMany({
          where: { cost: { not: null } },
          include: { category: true },
        });

        const costData = items.map((item) => ({
          name: item.name,
          category: item.category?.name,
          price: item.price,
          cost: item.cost,
        }));

        const systemPrompt = `You are a restaurant cost analysis expert. Analyze food costs and provide actionable recommendations to improve profitability. Consider:
1. Industry standard food cost percentages (28-35%)
2. Menu engineering principles
3. Pricing strategies
4. Portion optimization
Respond in JSON format with analysis array containing: item, price, cost, costPercentage, profitMargin, recommendation`;

        try {
          const aiResponse = await callOpenRouter(systemPrompt, `Menu items with costs:\n${JSON.stringify(costData, null, 2)}`);
          const parsed = JSON.parse(aiResponse);
          return NextResponse.json({ analysis: parsed.analysis || parsed });
        } catch {
          // Fallback
          const analysis = items.map((item) => {
            const foodCost = item.cost || 0;
            const costPercentage = (foodCost / item.price) * 100;
            const profitMargin = ((item.price - foodCost) / item.price) * 100;

            let recommendation = "";
            if (costPercentage > 35) {
              recommendation = "Food cost too high. Consider portion adjustment or price increase.";
            } else if (costPercentage < 20) {
              recommendation = "Excellent margins! Consider this for promotions.";
            }

            return {
              item: item.name,
              price: item.price,
              cost: foodCost,
              costPercentage: costPercentage.toFixed(1),
              profitMargin: profitMargin.toFixed(1),
              recommendation,
            };
          }).sort((a, b) => parseFloat(b.costPercentage) - parseFloat(a.costPercentage));
          return NextResponse.json({ analysis });
        }
      }

      case "customer_insights": {
        const customers = await prisma.customer.findMany({
          include: {
            orders: {
              include: { items: true },
              take: 10,
            },
            reservations: { take: 5 },
            feedback: { take: 5 },
            loyaltyPoints: true,
          },
          take: 50,
        });

        const customerData = customers.map((c) => ({
          name: `${c.firstName} ${c.lastName}`,
          totalOrders: c.orders.length,
          totalSpent: c.orders.reduce((sum, o) => sum + o.total, 0),
          avgOrderValue: c.orders.length > 0 ? c.orders.reduce((sum, o) => sum + o.total, 0) / c.orders.length : 0,
          loyaltyPoints: c.loyaltyPoints?.points || 0,
          reservations: c.reservations.length,
          feedbackCount: c.feedback.length,
        }));

        const systemPrompt = `You are a customer analytics expert for restaurants. Analyze customer data to identify:
1. Customer segments (VIP, regulars, at-risk, new)
2. Spending patterns and trends
3. Loyalty opportunities
4. Personalization recommendations
Respond in JSON format with insights array containing: segment, customerCount, avgSpend, recommendations`;

        try {
          const aiResponse = await callOpenRouter(systemPrompt, `Customer data:\n${JSON.stringify(customerData, null, 2)}`);
          const parsed = JSON.parse(aiResponse);
          return NextResponse.json({ insights: parsed.insights || parsed });
        } catch {
          // Fallback segmentation
          const segments = {
            vip: customerData.filter(c => c.totalSpent > 500 || c.totalOrders > 10),
            regular: customerData.filter(c => c.totalOrders >= 3 && c.totalOrders <= 10),
            occasional: customerData.filter(c => c.totalOrders >= 1 && c.totalOrders < 3),
            new: customerData.filter(c => c.totalOrders === 0),
          };

          const insights = [
            { segment: "VIP Customers", customerCount: segments.vip.length, avgSpend: segments.vip.reduce((s, c) => s + c.avgOrderValue, 0) / (segments.vip.length || 1), recommendations: "Offer exclusive perks and early access to specials" },
            { segment: "Regular Customers", customerCount: segments.regular.length, avgSpend: segments.regular.reduce((s, c) => s + c.avgOrderValue, 0) / (segments.regular.length || 1), recommendations: "Loyalty program enrollment and birthday rewards" },
            { segment: "Occasional Customers", customerCount: segments.occasional.length, avgSpend: segments.occasional.reduce((s, c) => s + c.avgOrderValue, 0) / (segments.occasional.length || 1), recommendations: "Re-engagement campaigns and special offers" },
            { segment: "New Customers", customerCount: segments.new.length, avgSpend: 0, recommendations: "Welcome offers and first-visit incentives" },
          ];
          return NextResponse.json({ insights });
        }
      }

      case "voice_order": {
        const { transcript } = data;

        // Get menu items for context
        const menuItems = await prisma.menuItem.findMany({
          where: { isAvailable: true },
          include: { category: true },
        });

        const systemPrompt = `You are a voice ordering assistant for a restaurant. Parse the customer's voice order and extract:
1. Items they want to order
2. Quantities
3. Special modifications or requests
4. Any clarifying questions needed

Available menu items: ${menuItems.map(i => `${i.name} ($${i.price})`).join(", ")}

Respond in JSON format with:
- items: array of { name, quantity, modifications }
- clarifications: array of questions if order is unclear
- total: estimated total`;

        try {
          const aiResponse = await callOpenRouter(systemPrompt, `Customer said: "${transcript}"`);
          const parsed = JSON.parse(aiResponse);
          return NextResponse.json(parsed);
        } catch {
          return NextResponse.json({
            items: [],
            clarifications: ["I'm sorry, I couldn't understand the order. Could you please repeat?"],
            total: 0,
          });
        }
      }

      default:
        return NextResponse.json({ error: "Unknown AI action" }, { status: 400 });
    }
  } catch (error) {
    console.error("AI error:", error);
    return NextResponse.json({ error: "AI processing failed" }, { status: 500 });
  }
}
