/**
 * Inventory auto-deduction helpers.
 *
 * When an order item is added, this module:
 *   1. Looks up the MenuItemIngredient records for that menu item
 *   2. Deducts ingredient quantities from Ingredient.currentStock
 *   3. Creates a StockMovement record for each deduction (type: USED)
 *   4. Alerts (console + returned object) when stock falls below reorderPoint
 *
 * The schema already has MenuItemIngredient (menuItemId, ingredientId, quantity)
 * so no migration is needed.
 */

import prisma from "@/lib/prisma";

export interface InventoryAlert {
  ingredientId: string;
  ingredientName: string;
  currentStock: number;
  reorderPoint: number;
  unit: string;
}

/**
 * Deduct ingredients used by an order item.
 *
 * @param menuItemId  The menu item being ordered
 * @param quantity    How many portions were ordered
 * @param orderId     Order reference (stored in StockMovement.reference)
 * @returns Array of ingredients that have fallen below their reorder point
 */
export async function deductIngredients(
  menuItemId: string,
  quantity: number,
  orderId: string
): Promise<InventoryAlert[]> {
  // Fetch the recipe-level ingredient requirements for this menu item
  const recipeIngredients = await prisma.menuItemIngredient.findMany({
    where: { menuItemId },
    include: { ingredient: true },
  });

  if (recipeIngredients.length === 0) {
    // No recipe mapped; nothing to deduct
    return [];
  }

  const alerts: InventoryAlert[] = [];

  for (const ri of recipeIngredients) {
    const deductQty = ri.quantity * quantity;
    const newStock = Math.max(0, ri.ingredient.currentStock - deductQty);

    // Atomic update: decrement stock and create movement in a transaction
    await prisma.$transaction([
      prisma.ingredient.update({
        where: { id: ri.ingredientId },
        data: { currentStock: newStock },
      }),
      prisma.stockMovement.create({
        data: {
          ingredientId: ri.ingredientId,
          type: "USED",
          quantity: -deductQty,           // negative = consumed
          reason: `Order item: ${menuItemId} x${quantity}`,
          reference: orderId,
        },
      }),
    ]);

    // Check threshold
    if (newStock <= ri.ingredient.reorderPoint) {
      const alert: InventoryAlert = {
        ingredientId: ri.ingredient.id,
        ingredientName: ri.ingredient.name,
        currentStock: newStock,
        reorderPoint: ri.ingredient.reorderPoint,
        unit: ri.ingredient.unit,
      };
      alerts.push(alert);
      console.warn(
        `[Inventory] LOW STOCK ALERT: ${ri.ingredient.name} is at ${newStock} ${ri.ingredient.unit} ` +
        `(reorder point: ${ri.ingredient.reorderPoint})`
      );
    }
  }

  return alerts;
}
