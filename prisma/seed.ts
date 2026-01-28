import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clear existing data in correct order (respecting foreign keys)
  console.log("Clearing existing data...");
  try { await prisma.payment.deleteMany(); } catch {}
  try { await prisma.deliveryInfo.deleteMany(); } catch {}
  try { await prisma.orderItem.deleteMany(); } catch {}
  try { await prisma.order.deleteMany(); } catch {}
  try { await prisma.reservation.deleteMany(); } catch {}
  try { await prisma.waitlist.deleteMany(); } catch {}
  try { await prisma.stockMovement.deleteMany(); } catch {}
  try { await prisma.ingredient.deleteMany(); } catch {}
  try { await prisma.menuItem.deleteMany(); } catch {}
  try { await prisma.menuCategory.deleteMany(); } catch {}
  try { await prisma.vendor.deleteMany(); } catch {}
  try { await prisma.table.deleteMany(); } catch {}
  try { await prisma.loyaltyPoints.deleteMany(); } catch {}
  try { await prisma.feedback.deleteMany(); } catch {}
  try { await prisma.customer.deleteMany(); } catch {}
  try { await prisma.timeClock.deleteMany(); } catch {}
  try { await prisma.schedule.deleteMany(); } catch {}
  try { await prisma.staff.deleteMany(); } catch {}
  try { await prisma.user.deleteMany(); } catch {}
  try { await prisma.aIRecommendation.deleteMany(); } catch {}
  try { await prisma.integration.deleteMany(); } catch {}

  const adminPassword = await bcrypt.hash("password123", 10);
  const managerPassword = await bcrypt.hash("password123", 10);
  const staffPassword = await bcrypt.hash("password123", 10);

  // ============= USERS & STAFF (15+) =============
  console.log("Creating users and staff...");

  const staffData = [
    { firstName: "Admin", lastName: "User", email: "admin@restaurant.com", position: "Administrator", hourlyRate: 0, role: "ADMIN" as const, password: adminPassword },
    { firstName: "Manager", lastName: "Demo", email: "manager@restaurant.com", position: "General Manager", hourlyRate: 35, role: "MANAGER" as const, password: managerPassword },
    { firstName: "Staff", lastName: "Demo", email: "staff@restaurant.com", position: "Server", hourlyRate: 12, role: "STAFF" as const, password: staffPassword },
    { firstName: "John", lastName: "Smith", email: "john@restaurant.com", position: "General Manager", hourlyRate: 35, role: "MANAGER" as const, password: managerPassword },
    { firstName: "Sarah", lastName: "Johnson", email: "sarah@restaurant.com", position: "Assistant Manager", hourlyRate: 28, role: "MANAGER" as const },
    { firstName: "Mike", lastName: "Williams", email: "mike@restaurant.com", position: "Head Chef", hourlyRate: 30, role: "CHEF" as const },
    { firstName: "Emily", lastName: "Brown", email: "emily@restaurant.com", position: "Sous Chef", hourlyRate: 25, role: "CHEF" as const },
    { firstName: "David", lastName: "Garcia", email: "david@restaurant.com", position: "Line Cook", hourlyRate: 18, role: "CHEF" as const },
    { firstName: "Lisa", lastName: "Martinez", email: "lisa@restaurant.com", position: "Line Cook", hourlyRate: 18, role: "CHEF" as const },
    { firstName: "Chris", lastName: "Anderson", email: "chris@restaurant.com", position: "Prep Cook", hourlyRate: 15, role: "STAFF" as const },
    { firstName: "Jessica", lastName: "Taylor", email: "jessica@restaurant.com", position: "Host", hourlyRate: 14, role: "HOST" as const },
    { firstName: "Kevin", lastName: "Thomas", email: "kevin@restaurant.com", position: "Host", hourlyRate: 14, role: "HOST" as const },
    { firstName: "Amanda", lastName: "White", email: "amanda@restaurant.com", position: "Server", hourlyRate: 12, role: "STAFF" as const },
    { firstName: "Ryan", lastName: "Harris", email: "ryan@restaurant.com", position: "Server", hourlyRate: 12, role: "STAFF" as const },
    { firstName: "Nicole", lastName: "Clark", email: "nicole@restaurant.com", position: "Server", hourlyRate: 12, role: "STAFF" as const },
    { firstName: "Brandon", lastName: "Lewis", email: "brandon@restaurant.com", position: "Server", hourlyRate: 12, role: "STAFF" as const },
    { firstName: "Michelle", lastName: "Walker", email: "michelle@restaurant.com", position: "Bartender", hourlyRate: 16, role: "STAFF" as const },
    { firstName: "Daniel", lastName: "Hall", email: "daniel@restaurant.com", position: "Bartender", hourlyRate: 16, role: "STAFF" as const },
    { firstName: "Ashley", lastName: "Young", email: "ashley@restaurant.com", position: "Busser", hourlyRate: 11, role: "STAFF" as const },
    { firstName: "Matthew", lastName: "King", email: "matthew@restaurant.com", position: "Dishwasher", hourlyRate: 13, role: "STAFF" as const },
  ];

  for (const staff of staffData) {
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      update: {},
      create: {
        email: staff.email,
        name: `${staff.firstName} ${staff.lastName}`,
        password: (staff as { password?: string }).password || staffPassword,
        role: staff.role,
      },
    });

    await prisma.staff.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        phone: `(555) ${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`,
        position: staff.position,
        hourlyRate: staff.hourlyRate,
        status: "ACTIVE",
      },
    });
  }

  // ============= TABLES (15+) =============
  console.log("Creating tables...");

  const tables = [
    { number: 1, capacity: 2, section: "Main Dining" },
    { number: 2, capacity: 2, section: "Main Dining" },
    { number: 3, capacity: 2, section: "Main Dining" },
    { number: 4, capacity: 4, section: "Main Dining" },
    { number: 5, capacity: 4, section: "Main Dining" },
    { number: 6, capacity: 4, section: "Main Dining" },
    { number: 7, capacity: 4, section: "Main Dining" },
    { number: 8, capacity: 6, section: "Main Dining" },
    { number: 9, capacity: 6, section: "Main Dining" },
    { number: 10, capacity: 8, section: "Private Room" },
    { number: 11, capacity: 10, section: "Private Room" },
    { number: 12, capacity: 4, section: "Patio" },
    { number: 13, capacity: 4, section: "Patio" },
    { number: 14, capacity: 6, section: "Patio" },
    { number: 15, capacity: 2, section: "Bar" },
    { number: 16, capacity: 2, section: "Bar" },
    { number: 17, capacity: 4, section: "Bar" },
    { number: 18, capacity: 12, section: "Private Room" },
  ];

  for (const table of tables) {
    await prisma.table.upsert({
      where: { number: table.number },
      update: {},
      create: table,
    });
  }

  // ============= MENU CATEGORIES =============
  console.log("Creating menu categories...");

  const categories = [
    { name: "Appetizers", description: "Starters and small plates to share", sortOrder: 1 },
    { name: "Salads", description: "Fresh garden salads", sortOrder: 2 },
    { name: "Soups", description: "Homemade soups", sortOrder: 3 },
    { name: "Entrees", description: "Main courses", sortOrder: 4 },
    { name: "Steaks", description: "Premium aged steaks", sortOrder: 5 },
    { name: "Seafood", description: "Fresh seafood dishes", sortOrder: 6 },
    { name: "Pasta", description: "Italian pasta specialties", sortOrder: 7 },
    { name: "Pizza", description: "Wood-fired pizzas", sortOrder: 8 },
    { name: "Sandwiches", description: "Gourmet sandwiches", sortOrder: 9 },
    { name: "Sides", description: "Side dishes", sortOrder: 10 },
    { name: "Desserts", description: "Sweet endings", sortOrder: 11 },
    { name: "Beverages", description: "Drinks and refreshments", sortOrder: 12 },
    { name: "Kids Menu", description: "For our younger guests", sortOrder: 13 },
    { name: "Specials", description: "Chef's specials", sortOrder: 14 },
    { name: "Happy Hour", description: "Discounted appetizers and drinks", sortOrder: 15 },
  ];

  const createdCategories: Record<string, string> = {};
  for (const cat of categories) {
    const created = await prisma.menuCategory.upsert({
      where: { id: cat.name.toLowerCase().replace(/\s+/g, '-') },
      update: {},
      create: { ...cat, id: cat.name.toLowerCase().replace(/\s+/g, '-') },
    });
    createdCategories[cat.name] = created.id;
  }

  // ============= MENU ITEMS (60+) =============
  console.log("Creating menu items...");

  const menuItems = [
    // Appetizers (15+)
    { category: "Appetizers", name: "Crispy Calamari", description: "Lightly breaded calamari with marinara and aioli", price: 14.99, cost: 4.50, allergens: ["Shellfish", "Wheat"] },
    { category: "Appetizers", name: "Bruschetta Trio", description: "Three toasted breads with tomato, olive, and mushroom toppings", price: 12.99, cost: 3.50, allergens: ["Wheat", "Dairy"] },
    { category: "Appetizers", name: "Spinach Artichoke Dip", description: "Creamy dip served with tortilla chips", price: 11.99, cost: 3.00, allergens: ["Dairy"] },
    { category: "Appetizers", name: "Buffalo Wings", description: "12 crispy wings with choice of sauce", price: 15.99, cost: 5.00, allergens: [] },
    { category: "Appetizers", name: "Coconut Shrimp", description: "Six coconut-crusted shrimp with Thai chili sauce", price: 16.99, cost: 5.50, allergens: ["Shellfish", "Tree Nuts"] },
    { category: "Appetizers", name: "Loaded Potato Skins", description: "Crispy potato skins with bacon and cheddar", price: 12.99, cost: 3.50, allergens: ["Dairy"] },
    { category: "Appetizers", name: "Ahi Tuna Tartare", description: "Fresh ahi tuna with avocado and wonton chips", price: 18.99, cost: 7.00, allergens: ["Fish", "Soy", "Wheat"] },
    { category: "Appetizers", name: "Mozzarella Sticks", description: "Eight sticks with marinara sauce", price: 10.99, cost: 2.50, allergens: ["Dairy", "Wheat"] },
    { category: "Appetizers", name: "Stuffed Mushrooms", description: "Mushroom caps filled with crab and cream cheese", price: 14.99, cost: 4.00, allergens: ["Shellfish", "Dairy"] },
    { category: "Appetizers", name: "Chicken Quesadilla", description: "Grilled chicken with peppers and cheese", price: 13.99, cost: 3.50, allergens: ["Dairy", "Wheat"] },
    { category: "Appetizers", name: "Beef Carpaccio", description: "Thin-sliced beef with arugula and parmesan", price: 17.99, cost: 6.00, allergens: ["Dairy"] },
    { category: "Appetizers", name: "Garlic Bread", description: "Toasted bread with garlic butter and herbs", price: 7.99, cost: 1.50, allergens: ["Wheat", "Dairy"] },
    { category: "Appetizers", name: "Onion Rings", description: "Beer-battered crispy onion rings", price: 9.99, cost: 2.00, allergens: ["Wheat"] },
    { category: "Appetizers", name: "Crab Cakes", description: "Two jumbo lump crab cakes with remoulade", price: 19.99, cost: 8.00, allergens: ["Shellfish", "Eggs", "Wheat"] },
    { category: "Appetizers", name: "Fried Pickles", description: "Crispy dill pickles with ranch", price: 8.99, cost: 2.00, allergens: ["Wheat", "Dairy"] },

    // Salads (15+)
    { category: "Salads", name: "Caesar Salad", description: "Romaine, parmesan, croutons, caesar dressing", price: 12.99, cost: 3.00, allergens: ["Dairy", "Wheat", "Eggs", "Fish"] },
    { category: "Salads", name: "House Garden Salad", description: "Mixed greens with house vinaigrette", price: 9.99, cost: 2.50, allergens: [] },
    { category: "Salads", name: "Greek Salad", description: "Cucumbers, tomatoes, olives, feta, red onion", price: 13.99, cost: 4.00, allergens: ["Dairy"] },
    { category: "Salads", name: "Wedge Salad", description: "Iceberg wedge with bacon, tomato, blue cheese", price: 11.99, cost: 3.00, allergens: ["Dairy"] },
    { category: "Salads", name: "Cobb Salad", description: "Chicken, bacon, egg, avocado, blue cheese", price: 16.99, cost: 5.00, allergens: ["Dairy", "Eggs"] },
    { category: "Salads", name: "Asian Chicken Salad", description: "Grilled chicken with mandarin, almonds, sesame dressing", price: 15.99, cost: 4.50, allergens: ["Tree Nuts", "Soy", "Sesame"] },
    { category: "Salads", name: "Spinach Salad", description: "Baby spinach with warm bacon dressing", price: 13.99, cost: 3.50, allergens: ["Eggs"] },
    { category: "Salads", name: "Caprese Salad", description: "Fresh mozzarella, tomatoes, basil, balsamic glaze", price: 14.99, cost: 4.00, allergens: ["Dairy"] },
    { category: "Salads", name: "Kale Caesar", description: "Kale with parmesan and white anchovy dressing", price: 13.99, cost: 3.50, allergens: ["Dairy", "Fish"] },
    { category: "Salads", name: "Grilled Salmon Salad", description: "Mixed greens topped with grilled salmon", price: 19.99, cost: 7.00, allergens: ["Fish"] },
    { category: "Salads", name: "Steak Salad", description: "Sliced ribeye over mixed greens", price: 21.99, cost: 8.00, allergens: [] },
    { category: "Salads", name: "Shrimp Louie", description: "Bay shrimp with thousand island dressing", price: 18.99, cost: 6.00, allergens: ["Shellfish", "Eggs"] },
    { category: "Salads", name: "Quinoa Power Bowl", description: "Quinoa with roasted vegetables and tahini", price: 14.99, cost: 4.00, allergens: ["Sesame"] },
    { category: "Salads", name: "Beet Salad", description: "Roasted beets with goat cheese and walnuts", price: 13.99, cost: 4.00, allergens: ["Dairy", "Tree Nuts"] },
    { category: "Salads", name: "Mediterranean Salad", description: "Mixed greens with hummus and falafel", price: 14.99, cost: 4.00, allergens: ["Wheat", "Sesame"] },

    // Soups
    { category: "Soups", name: "French Onion Soup", description: "Classic with melted gruyere", price: 9.99, cost: 2.50, allergens: ["Dairy", "Wheat"] },
    { category: "Soups", name: "Tomato Basil Soup", description: "Creamy tomato with fresh basil", price: 8.99, cost: 2.00, allergens: ["Dairy"] },
    { category: "Soups", name: "Clam Chowder", description: "New England style", price: 10.99, cost: 3.00, allergens: ["Shellfish", "Dairy"] },
    { category: "Soups", name: "Lobster Bisque", description: "Rich and creamy lobster soup", price: 14.99, cost: 5.00, allergens: ["Shellfish", "Dairy"] },
    { category: "Soups", name: "Chicken Noodle", description: "Homemade with vegetables", price: 8.99, cost: 2.00, allergens: ["Wheat"] },

    // Entrees
    { category: "Entrees", name: "Herb Roasted Chicken", description: "Half chicken with roasted vegetables", price: 24.99, cost: 8.00, allergens: [] },
    { category: "Entrees", name: "Pork Chop", description: "Bone-in pork chop with apple chutney", price: 26.99, cost: 9.00, allergens: [] },
    { category: "Entrees", name: "Lamb Chops", description: "New Zealand lamb with mint pesto", price: 38.99, cost: 14.00, allergens: ["Tree Nuts"] },
    { category: "Entrees", name: "Duck Breast", description: "Pan-seared with cherry reduction", price: 34.99, cost: 12.00, allergens: [] },
    { category: "Entrees", name: "Beef Short Ribs", description: "Braised short ribs with mashed potatoes", price: 32.99, cost: 11.00, allergens: ["Dairy"] },

    // Steaks
    { category: "Steaks", name: "Filet Mignon 8oz", description: "USDA Prime with red wine reduction", price: 48.99, cost: 20.00, allergens: [] },
    { category: "Steaks", name: "Ribeye 14oz", description: "USDA Prime with garlic butter", price: 52.99, cost: 22.00, allergens: ["Dairy"] },
    { category: "Steaks", name: "NY Strip 12oz", description: "USDA Prime with peppercorn sauce", price: 46.99, cost: 18.00, allergens: ["Dairy"] },
    { category: "Steaks", name: "Porterhouse 24oz", description: "For the serious steak lover", price: 68.99, cost: 28.00, allergens: [] },
    { category: "Steaks", name: "Tomahawk Ribeye 32oz", description: "Bone-in showstopper for two", price: 98.99, cost: 40.00, allergens: [] },

    // Seafood
    { category: "Seafood", name: "Grilled Salmon", description: "Atlantic salmon with lemon dill sauce", price: 28.99, cost: 10.00, allergens: ["Fish"] },
    { category: "Seafood", name: "Pan-Seared Sea Bass", description: "Chilean sea bass with miso glaze", price: 38.99, cost: 15.00, allergens: ["Fish", "Soy"] },
    { category: "Seafood", name: "Lobster Tail", description: "8oz tail with drawn butter", price: 52.99, cost: 24.00, allergens: ["Shellfish", "Dairy"] },
    { category: "Seafood", name: "Shrimp Scampi", description: "Sautéed shrimp in garlic butter over linguine", price: 26.99, cost: 9.00, allergens: ["Shellfish", "Dairy", "Wheat"] },
    { category: "Seafood", name: "Ahi Tuna Steak", description: "Sesame-crusted rare ahi", price: 32.99, cost: 12.00, allergens: ["Fish", "Sesame"] },
    { category: "Seafood", name: "Cioppino", description: "Seafood stew with mussels, clams, shrimp", price: 36.99, cost: 14.00, allergens: ["Shellfish", "Fish"] },
    { category: "Seafood", name: "Fish & Chips", description: "Beer-battered cod with fries", price: 22.99, cost: 7.00, allergens: ["Fish", "Wheat"] },

    // Pasta
    { category: "Pasta", name: "Spaghetti Bolognese", description: "Classic meat sauce with parmesan", price: 18.99, cost: 5.00, allergens: ["Wheat", "Dairy"] },
    { category: "Pasta", name: "Fettuccine Alfredo", description: "Creamy parmesan sauce", price: 17.99, cost: 4.50, allergens: ["Wheat", "Dairy"] },
    { category: "Pasta", name: "Chicken Parmesan", description: "Breaded chicken with marinara and mozzarella", price: 22.99, cost: 7.00, allergens: ["Wheat", "Dairy", "Eggs"] },
    { category: "Pasta", name: "Shrimp Linguine", description: "Garlic shrimp in white wine sauce", price: 26.99, cost: 9.00, allergens: ["Shellfish", "Wheat"] },
    { category: "Pasta", name: "Lasagna", description: "House-made with meat and ricotta", price: 19.99, cost: 5.50, allergens: ["Wheat", "Dairy", "Eggs"] },
    { category: "Pasta", name: "Penne Vodka", description: "Creamy tomato vodka sauce", price: 18.99, cost: 5.00, allergens: ["Wheat", "Dairy"] },

    // Sides
    { category: "Sides", name: "Mashed Potatoes", description: "Creamy garlic mashed potatoes", price: 6.99, cost: 1.50, allergens: ["Dairy"] },
    { category: "Sides", name: "Grilled Asparagus", description: "With lemon and olive oil", price: 7.99, cost: 2.00, allergens: [] },
    { category: "Sides", name: "Mac and Cheese", description: "Three cheese blend", price: 7.99, cost: 2.00, allergens: ["Dairy", "Wheat"] },
    { category: "Sides", name: "Sautéed Spinach", description: "With garlic and olive oil", price: 6.99, cost: 1.50, allergens: [] },
    { category: "Sides", name: "Baked Potato", description: "With butter and sour cream", price: 5.99, cost: 1.00, allergens: ["Dairy"] },
    { category: "Sides", name: "French Fries", description: "Crispy golden fries", price: 5.99, cost: 1.00, allergens: [] },
    { category: "Sides", name: "Sweet Potato Fries", description: "With chipotle aioli", price: 6.99, cost: 1.50, allergens: ["Eggs"] },
    { category: "Sides", name: "Creamed Spinach", description: "Classic steakhouse style", price: 7.99, cost: 2.00, allergens: ["Dairy"] },
    { category: "Sides", name: "Brussels Sprouts", description: "Roasted with bacon", price: 8.99, cost: 2.50, allergens: [] },
    { category: "Sides", name: "Onion Rings", description: "Beer-battered", price: 7.99, cost: 1.50, allergens: ["Wheat"] },

    // Desserts
    { category: "Desserts", name: "Chocolate Lava Cake", description: "Warm chocolate cake with molten center", price: 10.99, cost: 3.00, allergens: ["Dairy", "Eggs", "Wheat"] },
    { category: "Desserts", name: "Tiramisu", description: "Classic Italian dessert", price: 9.99, cost: 2.50, allergens: ["Dairy", "Eggs", "Wheat"] },
    { category: "Desserts", name: "New York Cheesecake", description: "With berry compote", price: 9.99, cost: 2.50, allergens: ["Dairy", "Eggs", "Wheat"] },
    { category: "Desserts", name: "Crème Brûlée", description: "Vanilla bean custard", price: 9.99, cost: 2.50, allergens: ["Dairy", "Eggs"] },
    { category: "Desserts", name: "Apple Pie", description: "Warm with vanilla ice cream", price: 8.99, cost: 2.00, allergens: ["Dairy", "Wheat"] },
    { category: "Desserts", name: "Gelato", description: "Choice of three flavors", price: 7.99, cost: 2.00, allergens: ["Dairy"] },
    { category: "Desserts", name: "Chocolate Mousse", description: "Rich and creamy", price: 8.99, cost: 2.00, allergens: ["Dairy", "Eggs"] },

    // Beverages
    { category: "Beverages", name: "Soft Drinks", description: "Coke, Diet Coke, Sprite, etc.", price: 3.49, cost: 0.50, allergens: [] },
    { category: "Beverages", name: "Fresh Lemonade", description: "House-made", price: 4.99, cost: 0.75, allergens: [] },
    { category: "Beverages", name: "Iced Tea", description: "Fresh brewed", price: 3.49, cost: 0.30, allergens: [] },
    { category: "Beverages", name: "Coffee", description: "Regular or decaf", price: 3.99, cost: 0.40, allergens: [] },
    { category: "Beverages", name: "Espresso", description: "Single or double shot", price: 4.99, cost: 0.60, allergens: [] },
    { category: "Beverages", name: "Cappuccino", description: "With steamed milk", price: 5.99, cost: 0.80, allergens: ["Dairy"] },
    { category: "Beverages", name: "Hot Tea", description: "Selection of teas", price: 3.99, cost: 0.40, allergens: [] },
    { category: "Beverages", name: "Sparkling Water", description: "San Pellegrino", price: 4.99, cost: 1.00, allergens: [] },

    // Kids Menu
    { category: "Kids Menu", name: "Kids Chicken Tenders", description: "With fries", price: 9.99, cost: 2.50, allergens: ["Wheat"] },
    { category: "Kids Menu", name: "Kids Pasta", description: "Butter or marinara", price: 8.99, cost: 2.00, allergens: ["Wheat", "Dairy"] },
    { category: "Kids Menu", name: "Kids Burger", description: "Small burger with fries", price: 10.99, cost: 3.00, allergens: ["Wheat"] },
    { category: "Kids Menu", name: "Kids Grilled Cheese", description: "With fries", price: 7.99, cost: 2.00, allergens: ["Wheat", "Dairy"] },
    { category: "Kids Menu", name: "Kids Pizza", description: "Personal cheese pizza", price: 8.99, cost: 2.50, allergens: ["Wheat", "Dairy"] },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.create({
      data: {
        categoryId: createdCategories[item.category],
        name: item.name,
        description: item.description,
        price: item.price,
        cost: item.cost,
        allergens: item.allergens,
        isAvailable: true,
        is86d: false,
        prepTime: Math.floor(10 + Math.random() * 20),
        calories: Math.floor(200 + Math.random() * 800),
      },
    });
  }

  // ============= VENDORS (15+) =============
  console.log("Creating vendors...");

  const vendors = [
    { name: "Fresh Farms Produce", contactName: "Tom Wilson", email: "orders@freshfarms.com", phone: "(555) 234-5678", paymentTerms: "Net 30" },
    { name: "Premium Meats Co", contactName: "Mary Johnson", email: "sales@premiummeats.com", phone: "(555) 345-6789", paymentTerms: "Net 15" },
    { name: "Ocean Fresh Seafood", contactName: "Bob Smith", email: "bob@oceanfresh.com", phone: "(555) 456-7890", paymentTerms: "Net 7" },
    { name: "Dairy Best", contactName: "Lisa Brown", email: "orders@dairybest.com", phone: "(555) 567-8901", paymentTerms: "Net 30" },
    { name: "Baker's Flour Supply", contactName: "Jim Baker", email: "jim@bakersflour.com", phone: "(555) 678-9012", paymentTerms: "Net 30" },
    { name: "Italian Imports", contactName: "Marco Rossi", email: "marco@italianimports.com", phone: "(555) 789-0123", paymentTerms: "Net 45" },
    { name: "Sysco Foods", contactName: "Regional Rep", email: "orders@sysco.com", phone: "(555) 890-1234", paymentTerms: "Net 30" },
    { name: "US Foods", contactName: "Account Manager", email: "orders@usfoods.com", phone: "(555) 901-2345", paymentTerms: "Net 30" },
    { name: "Local Organic Farm", contactName: "Sarah Green", email: "sarah@localorganic.com", phone: "(555) 012-3456", paymentTerms: "COD" },
    { name: "Wine & Spirits Dist", contactName: "Michael Vine", email: "michael@winespirits.com", phone: "(555) 123-4567", paymentTerms: "Net 15" },
    { name: "Coffee Roasters Inc", contactName: "Juan Valdez", email: "juan@coffeeroasters.com", phone: "(555) 234-5679", paymentTerms: "Net 30" },
    { name: "Paper & Supplies Co", contactName: "Pat Paper", email: "pat@papersupplies.com", phone: "(555) 345-6790", paymentTerms: "Net 30" },
    { name: "Cleaning Solutions", contactName: "Clean Team", email: "orders@cleaningsolutions.com", phone: "(555) 456-7891", paymentTerms: "Net 30" },
    { name: "Equipment Parts Plus", contactName: "Tech Support", email: "parts@equipplus.com", phone: "(555) 567-8902", paymentTerms: "Net 15" },
    { name: "Linen Service Co", contactName: "Laura Linen", email: "laura@linenservice.com", phone: "(555) 678-9013", paymentTerms: "Weekly" },
    { name: "Ice Cream Distributors", contactName: "Cold Supply", email: "orders@icecreamdist.com", phone: "(555) 789-0124", paymentTerms: "Net 30" },
  ];

  const createdVendors: Record<string, string> = {};
  for (const vendor of vendors) {
    const created = await prisma.vendor.create({ data: vendor });
    createdVendors[vendor.name] = created.id;
  }

  // ============= INGREDIENTS (20+) =============
  console.log("Creating ingredients...");

  const ingredients = [
    { name: "Chicken Breast", unit: "lbs", currentStock: 45, parLevel: 50, reorderPoint: 15, cost: 4.99, vendorName: "Premium Meats Co" },
    { name: "Ground Beef", unit: "lbs", currentStock: 35, parLevel: 40, reorderPoint: 12, cost: 5.99, vendorName: "Premium Meats Co" },
    { name: "Ribeye Steak", unit: "lbs", currentStock: 25, parLevel: 30, reorderPoint: 10, cost: 18.99, vendorName: "Premium Meats Co" },
    { name: "Filet Mignon", unit: "lbs", currentStock: 20, parLevel: 25, reorderPoint: 8, cost: 24.99, vendorName: "Premium Meats Co" },
    { name: "Pork Chops", unit: "lbs", currentStock: 18, parLevel: 25, reorderPoint: 8, cost: 7.99, vendorName: "Premium Meats Co" },
    { name: "Salmon Fillet", unit: "lbs", currentStock: 15, parLevel: 20, reorderPoint: 5, cost: 12.99, vendorName: "Ocean Fresh Seafood" },
    { name: "Shrimp", unit: "lbs", currentStock: 12, parLevel: 18, reorderPoint: 6, cost: 14.99, vendorName: "Ocean Fresh Seafood" },
    { name: "Lobster Tails", unit: "units", currentStock: 8, parLevel: 15, reorderPoint: 5, cost: 24.99, vendorName: "Ocean Fresh Seafood" },
    { name: "Sea Bass", unit: "lbs", currentStock: 10, parLevel: 15, reorderPoint: 5, cost: 18.99, vendorName: "Ocean Fresh Seafood" },
    { name: "Romaine Lettuce", unit: "units", currentStock: 24, parLevel: 30, reorderPoint: 10, cost: 2.99, vendorName: "Fresh Farms Produce" },
    { name: "Tomatoes", unit: "lbs", currentStock: 28, parLevel: 35, reorderPoint: 12, cost: 2.49, vendorName: "Fresh Farms Produce" },
    { name: "Onions", unit: "lbs", currentStock: 35, parLevel: 40, reorderPoint: 15, cost: 1.49, vendorName: "Fresh Farms Produce" },
    { name: "Potatoes", unit: "lbs", currentStock: 60, parLevel: 75, reorderPoint: 25, cost: 0.99, vendorName: "Fresh Farms Produce" },
    { name: "Asparagus", unit: "bunches", currentStock: 12, parLevel: 18, reorderPoint: 6, cost: 4.99, vendorName: "Fresh Farms Produce" },
    { name: "Heavy Cream", unit: "gallons", currentStock: 6, parLevel: 8, reorderPoint: 3, cost: 8.99, vendorName: "Dairy Best" },
    { name: "Butter", unit: "lbs", currentStock: 15, parLevel: 20, reorderPoint: 8, cost: 4.99, vendorName: "Dairy Best" },
    { name: "Parmesan Cheese", unit: "lbs", currentStock: 8, parLevel: 12, reorderPoint: 4, cost: 15.99, vendorName: "Dairy Best" },
    { name: "Mozzarella", unit: "lbs", currentStock: 12, parLevel: 15, reorderPoint: 5, cost: 8.99, vendorName: "Dairy Best" },
    { name: "Eggs", unit: "dozens", currentStock: 10, parLevel: 15, reorderPoint: 5, cost: 4.99, vendorName: "Dairy Best" },
    { name: "Olive Oil", unit: "liters", currentStock: 8, parLevel: 12, reorderPoint: 4, cost: 15.99, vendorName: "Italian Imports" },
    { name: "Pasta", unit: "lbs", currentStock: 25, parLevel: 30, reorderPoint: 10, cost: 2.99, vendorName: "Italian Imports" },
    { name: "Marinara Sauce", unit: "gallons", currentStock: 6, parLevel: 10, reorderPoint: 4, cost: 12.99, vendorName: "Italian Imports" },
    { name: "All Purpose Flour", unit: "lbs", currentStock: 40, parLevel: 50, reorderPoint: 15, cost: 0.99, vendorName: "Baker's Flour Supply" },
    { name: "Sugar", unit: "lbs", currentStock: 20, parLevel: 25, reorderPoint: 8, cost: 1.49, vendorName: "Baker's Flour Supply" },
  ];

  for (const ing of ingredients) {
    const ingredient = await prisma.ingredient.create({
      data: {
        name: ing.name,
        unit: ing.unit,
        currentStock: ing.currentStock,
        parLevel: ing.parLevel,
        reorderPoint: ing.reorderPoint,
        cost: ing.cost,
        vendorId: createdVendors[ing.vendorName],
      },
    });

    // Create stock movements for each ingredient (usage patterns for AI)
    const daysBack = 14;
    for (let d = 0; d < daysBack; d++) {
      const movementDate = new Date();
      movementDate.setDate(movementDate.getDate() - d);

      // Random daily usage between 20-80% of par level
      const dailyUsage = Math.round((ing.parLevel * (0.2 + Math.random() * 0.6)) / daysBack);

      if (dailyUsage > 0) {
        await prisma.stockMovement.create({
          data: {
            ingredientId: ingredient.id,
            type: "USED",
            quantity: -dailyUsage,
            reason: "Kitchen usage",
            createdAt: movementDate,
          },
        });
      }
    }

    // Add a recent receiving movement
    await prisma.stockMovement.create({
      data: {
        ingredientId: ingredient.id,
        type: "RECEIVED",
        quantity: ing.currentStock + Math.floor(Math.random() * 20),
        reason: `Received from ${ing.vendorName}`,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      },
    });
  }

  // ============= CUSTOMERS (20+) =============
  console.log("Creating customers...");

  const customers = [
    { firstName: "James", lastName: "Wilson", email: "james.wilson@email.com", phone: "(555) 111-2222", vipStatus: true },
    { firstName: "Patricia", lastName: "Taylor", email: "patricia.taylor@email.com", phone: "(555) 222-3333", vipStatus: false },
    { firstName: "Robert", lastName: "Anderson", email: "robert.anderson@email.com", phone: "(555) 333-4444", vipStatus: true },
    { firstName: "Jennifer", lastName: "Thomas", email: "jennifer.thomas@email.com", phone: "(555) 444-5555", vipStatus: false },
    { firstName: "Michael", lastName: "Jackson", email: "michael.j@email.com", phone: "(555) 555-6666", vipStatus: false },
    { firstName: "Linda", lastName: "Martinez", email: "linda.martinez@email.com", phone: "(555) 666-7777", vipStatus: true },
    { firstName: "William", lastName: "Garcia", email: "william.garcia@email.com", phone: "(555) 777-8888", vipStatus: false },
    { firstName: "Elizabeth", lastName: "Rodriguez", email: "elizabeth.r@email.com", phone: "(555) 888-9999", vipStatus: false },
    { firstName: "David", lastName: "Lee", email: "david.lee@email.com", phone: "(555) 999-0000", vipStatus: true },
    { firstName: "Barbara", lastName: "Walker", email: "barbara.walker@email.com", phone: "(555) 000-1111", vipStatus: false },
    { firstName: "Richard", lastName: "Hall", email: "richard.hall@email.com", phone: "(555) 111-3333", vipStatus: false },
    { firstName: "Susan", lastName: "Allen", email: "susan.allen@email.com", phone: "(555) 222-4444", vipStatus: true },
    { firstName: "Joseph", lastName: "Young", email: "joseph.young@email.com", phone: "(555) 333-5555", vipStatus: false },
    { firstName: "Margaret", lastName: "King", email: "margaret.king@email.com", phone: "(555) 444-6666", vipStatus: false },
    { firstName: "Thomas", lastName: "Wright", email: "thomas.wright@email.com", phone: "(555) 555-7777", vipStatus: true },
    { firstName: "Dorothy", lastName: "Scott", email: "dorothy.scott@email.com", phone: "(555) 666-8888", vipStatus: false },
    { firstName: "Charles", lastName: "Green", email: "charles.green@email.com", phone: "(555) 777-9999", vipStatus: false },
    { firstName: "Karen", lastName: "Adams", email: "karen.adams@email.com", phone: "(555) 888-0000", vipStatus: true },
    { firstName: "Christopher", lastName: "Baker", email: "chris.baker@email.com", phone: "(555) 999-1111", vipStatus: false },
    { firstName: "Nancy", lastName: "Nelson", email: "nancy.nelson@email.com", phone: "(555) 000-2222", vipStatus: false },
  ];

  for (const customer of customers) {
    await prisma.customer.create({
      data: {
        ...customer,
        dietaryPrefs: [],
        allergens: [],
        loyaltyPoints: {
          create: {
            points: Math.floor(Math.random() * 1000),
            tier: customer.vipStatus ? (Math.random() > 0.5 ? "GOLD" : "PLATINUM") : (Math.random() > 0.5 ? "BRONZE" : "SILVER"),
            lifetimePoints: Math.floor(Math.random() * 5000),
          },
        },
      },
    });
  }

  // ============= RESERVATIONS (20+) =============
  console.log("Creating reservations...");

  const reservationNames = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Anderson", "Taylor", "Thomas", "Moore", "Jackson",
    "Martin", "Lee", "Thompson", "White", "Harris"
  ];

  const tablesForRes = await prisma.table.findMany();

  for (let i = 0; i < 20; i++) {
    const date = new Date();
    date.setDate(date.getDate() + Math.floor(Math.random() * 14) - 3); // -3 to +10 days
    date.setHours(17 + Math.floor(Math.random() * 5), Math.random() > 0.5 ? 0 : 30, 0, 0); // 5pm-9pm

    const table = tablesForRes[Math.floor(Math.random() * tablesForRes.length)];
    const partySize = Math.min(table.capacity, 2 + Math.floor(Math.random() * 6));

    await prisma.reservation.create({
      data: {
        customerName: `${["Mr.", "Mrs.", "Ms."][Math.floor(Math.random() * 3)]} ${reservationNames[i]}`,
        customerPhone: `(555) ${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`,
        customerEmail: `${reservationNames[i].toLowerCase()}${Math.floor(Math.random() * 100)}@email.com`,
        partySize,
        date,
        time: date,
        tableId: table.id,
        status: date < new Date() ? "COMPLETED" : ["PENDING", "CONFIRMED"][Math.floor(Math.random() * 2)] as "PENDING" | "CONFIRMED",
        specialOccasion: Math.random() > 0.7 ? ["birthday", "anniversary", "business"][Math.floor(Math.random() * 3)] : null,
        notes: Math.random() > 0.8 ? "Window seat preferred" : null,
        source: ["direct", "phone", "online"][Math.floor(Math.random() * 3)],
      },
    });
  }

  // ============= WAITLIST (5+) =============
  console.log("Creating waitlist entries...");

  for (let i = 0; i < 5; i++) {
    await prisma.waitlist.create({
      data: {
        customerName: `${["John", "Jane", "Bob", "Alice", "Tom"][i]} ${["Doe", "Smith", "Brown", "White", "Green"][i]}`,
        customerPhone: `(555) ${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`,
        partySize: 2 + Math.floor(Math.random() * 4),
        estimatedWait: 15 + Math.floor(Math.random() * 30),
        status: "WAITING",
      },
    });
  }

  // ============= FEEDBACK (15+) =============
  console.log("Creating feedback entries...");

  const feedbackComments = [
    "Amazing food and service! Will definitely come back.",
    "The steak was cooked to perfection. Great atmosphere.",
    "Loved the seafood selection. Fresh and delicious.",
    "Service was a bit slow but the food made up for it.",
    "Perfect date night spot. Romantic ambiance.",
    "Best Italian pasta in town!",
    "The desserts are to die for. Try the lava cake!",
    "Friendly staff and quick service. Kids loved it.",
    "A bit pricey but worth every penny.",
    "The chef really knows what they're doing.",
    "Great wine selection to complement the meal.",
    "Parking was difficult but the food was excellent.",
    "Perfect for business dinners. Professional atmosphere.",
    "The appetizers were outstanding. Must try the calamari.",
    "Will be celebrating all our special occasions here.",
  ];

  for (let i = 0; i < 15; i++) {
    await prisma.feedback.create({
      data: {
        source: ["google", "yelp", "in_app", "tripadvisor"][Math.floor(Math.random() * 4)],
        rating: 3 + Math.floor(Math.random() * 3), // 3-5 stars
        comment: feedbackComments[i],
        response: Math.random() > 0.5 ? "Thank you for your feedback! We look forward to serving you again." : null,
        respondedAt: Math.random() > 0.5 ? new Date() : null,
      },
    });
  }

  // ============= AI RECOMMENDATIONS (10+) =============
  console.log("Creating AI recommendations...");

  const aiRecommendations = [
    { type: "menu_price", title: "Increase Ribeye Price", description: "Based on demand analysis, consider increasing ribeye price by $3 to improve margin." },
    { type: "inventory", title: "Reorder Salmon", description: "Salmon stock is low. Suggest ordering 20 lbs based on weekly usage patterns." },
    { type: "schedule", title: "Add Friday Server", description: "Historical data shows Friday nights are understaffed. Recommend adding one server." },
    { type: "marketing", title: "Promote Happy Hour", description: "Low traffic on Tuesdays. Consider promoting happy hour specials." },
    { type: "menu_price", title: "Bundle Desserts", description: "Create dessert + coffee combo to increase dessert sales by estimated 25%." },
    { type: "inventory", title: "Reduce Asparagus Order", description: "Asparagus shows high waste. Reduce weekly order by 20%." },
    { type: "schedule", title: "Adjust Sunday Hours", description: "Low traffic after 8pm on Sundays. Consider closing at 9pm instead of 10pm." },
    { type: "marketing", title: "Birthday Email Campaign", description: "Send birthday discount to loyalty members. Expected 15% redemption rate." },
    { type: "menu_price", title: "Remove Beef Carpaccio", description: "Low sales and high cost. Consider removing or revamping this dish." },
    { type: "inventory", title: "Switch Olive Oil Vendor", description: "Italian Imports price increased. Local Organic Farm offers similar quality at 15% less." },
  ];

  for (const rec of aiRecommendations) {
    await prisma.aIRecommendation.create({
      data: {
        type: rec.type,
        title: rec.title,
        description: rec.description,
        status: Math.random() > 0.7 ? "applied" : "pending",
        appliedAt: Math.random() > 0.7 ? new Date() : null,
      },
    });
  }

  // ============= INTEGRATIONS (10+) =============
  console.log("Creating integrations...");

  const integrations = [
    { type: "pos", name: "Square POS", isActive: true },
    { type: "delivery", name: "DoorDash", isActive: true },
    { type: "delivery", name: "Uber Eats", isActive: true },
    { type: "delivery", name: "Grubhub", isActive: false },
    { type: "reservation", name: "OpenTable", isActive: true },
    { type: "reservation", name: "Resy", isActive: false },
    { type: "payment", name: "Stripe", isActive: true },
    { type: "accounting", name: "QuickBooks", isActive: true },
    { type: "review", name: "Google Reviews", isActive: true },
    { type: "review", name: "Yelp", isActive: true },
    { type: "marketing", name: "Mailchimp", isActive: true },
    { type: "analytics", name: "Google Analytics", isActive: true },
  ];

  for (const integration of integrations) {
    await prisma.integration.create({
      data: {
        type: integration.type,
        name: integration.name,
        isActive: integration.isActive,
        lastSync: integration.isActive ? new Date() : null,
      },
    });
  }

  // ============= PROMOTIONS =============
  console.log("Creating promotions...");

  try { await prisma.promotion.deleteMany(); } catch {}

  const promotions = [
    {
      name: "Summer Sale",
      description: "20% off all orders this summer",
      code: "SUMMER20",
      type: "PERCENTAGE" as const,
      value: 20,
      minOrderAmount: 25,
      maxDiscount: 50,
      startDate: new Date(),
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      isActive: true,
      dayOfWeek: [],
    },
    {
      name: "Happy Hour",
      description: "15% off appetizers and drinks",
      code: null,
      type: "HAPPY_HOUR" as const,
      value: 15,
      minOrderAmount: null,
      maxDiscount: null,
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      isActive: true,
      startTime: "16:00",
      endTime: "18:00",
      dayOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
    },
    {
      name: "New Customer Discount",
      description: "$10 off your first order",
      code: "WELCOME10",
      type: "FIXED_AMOUNT" as const,
      value: 10,
      minOrderAmount: 30,
      maxDiscount: null,
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      isActive: true,
      dayOfWeek: [],
    },
    {
      name: "Weekend Special",
      description: "25% off entrees on weekends",
      code: "WEEKEND25",
      type: "PERCENTAGE" as const,
      value: 25,
      minOrderAmount: 50,
      maxDiscount: 30,
      startDate: new Date(),
      endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      isActive: true,
      dayOfWeek: [0, 6], // Sat-Sun
    },
    {
      name: "Expired Promo",
      description: "This promo has expired",
      code: "OLD20",
      type: "PERCENTAGE" as const,
      value: 20,
      minOrderAmount: null,
      maxDiscount: null,
      startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      isActive: false,
      dayOfWeek: [],
    },
  ];

  for (const promo of promotions) {
    await prisma.promotion.create({
      data: {
        name: promo.name,
        description: promo.description,
        code: promo.code,
        type: promo.type,
        value: promo.value,
        minOrderAmount: promo.minOrderAmount,
        maxDiscount: promo.maxDiscount,
        startDate: promo.startDate,
        endDate: promo.endDate,
        isActive: promo.isActive,
        dayOfWeek: promo.dayOfWeek,
        startTime: (promo as { startTime?: string }).startTime || null,
        endTime: (promo as { endTime?: string }).endTime || null,
        applicableTo: ["all"],
      },
    });
  }

  // ============= ORDERS & KITCHEN DISPLAY (20+) =============
  console.log("Creating orders and kitchen display items...");

  const allMenuItems = await prisma.menuItem.findMany();
  const allTables = await prisma.table.findMany();
  const allStaff = await prisma.staff.findMany();
  const allCustomers = await prisma.customer.findMany();

  const orderStatuses = ["PENDING", "CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED"] as const;
  const orderTypes = ["DINE_IN", "TAKEOUT", "DELIVERY"] as const;
  const orderItemStatuses = ["PENDING", "SENT", "PREPARING", "READY", "SERVED"] as const;

  for (let i = 0; i < 20; i++) {
    const table = allTables[Math.floor(Math.random() * allTables.length)];
    const staff = allStaff[Math.floor(Math.random() * allStaff.length)];
    const customer = i < 15 ? allCustomers[Math.floor(Math.random() * allCustomers.length)] : null;
    const orderType = orderTypes[Math.floor(Math.random() * orderTypes.length)];
    const status = orderStatuses[Math.floor(Math.random() * orderStatuses.length)];

    // Calculate order time - mix of recent orders (last 2 hours) and today's orders
    const orderTime = new Date();
    if (i < 8) {
      // Recent orders (kitchen display active)
      orderTime.setMinutes(orderTime.getMinutes() - Math.floor(Math.random() * 120));
    } else {
      // Earlier today
      orderTime.setHours(orderTime.getHours() - Math.floor(Math.random() * 8));
    }

    // Select 2-5 random menu items for this order
    const numItems = 2 + Math.floor(Math.random() * 4);
    const selectedItems = [];
    for (let j = 0; j < numItems; j++) {
      const menuItem = allMenuItems[Math.floor(Math.random() * allMenuItems.length)];
      selectedItems.push({
        menuItem,
        quantity: Math.random() > 0.7 ? 2 : 1,
      });
    }

    // Calculate order totals
    let subtotal = 0;
    selectedItems.forEach(item => {
      subtotal += item.menuItem.price * item.quantity;
    });

    const tax = subtotal * 0.08; // 8% tax
    const tip = status === "COMPLETED" || status === "SERVED" ? subtotal * (0.15 + Math.random() * 0.1) : 0; // 15-25% tip
    const total = subtotal + tax + tip;

    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${Date.now()}-${i.toString().padStart(3, "0")}`,
        tableId: orderType === "DINE_IN" ? table.id : null,
        customerId: customer?.id,
        staffId: staff.id,
        type: orderType,
        status,
        subtotal,
        tax,
        tip,
        total,
        paymentStatus: status === "COMPLETED" ? "PAID" : status === "SERVED" ? Math.random() > 0.5 ? "PAID" : "UNPAID" : "UNPAID",
        paymentMethod: status === "COMPLETED" || (status === "SERVED" && Math.random() > 0.5) ? ["Cash", "Card", "Card"][Math.floor(Math.random() * 3)] : null,
        source: orderType === "DELIVERY" ? ["doordash", "ubereats", "grubhub"][Math.floor(Math.random() * 3)] : "pos",
        createdAt: orderTime,
      },
    });

    // Create order items for kitchen display
    for (const item of selectedItems) {
      const itemStatus = i < 8 ?
        // Active kitchen orders have varied statuses
        orderItemStatuses[Math.floor(Math.random() * orderItemStatuses.length)] :
        // Older orders are mostly completed
        Math.random() > 0.2 ? "SERVED" : orderItemStatuses[Math.floor(Math.random() * orderItemStatuses.length)];

      const sentTime = itemStatus !== "PENDING" ? new Date(orderTime.getTime() + Math.random() * 300000) : null; // Within 5 min
      const preparedTime = itemStatus === "READY" || itemStatus === "SERVED" ? new Date(orderTime.getTime() + Math.random() * 600000 + 300000) : null; // 5-15 min

      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          menuItemId: item.menuItem.id,
          quantity: item.quantity,
          unitPrice: item.menuItem.price,
          totalPrice: item.menuItem.price * item.quantity,
          status: itemStatus,
          sentToKitchen: sentTime,
          preparedAt: preparedTime,
          notes: Math.random() > 0.8 ? ["No onions", "Extra sauce", "Well done", "Gluten free", "Allergy: nuts"][Math.floor(Math.random() * 5)] : null,
        },
      });
    }

    // Create payment record if paid
    if (order.paymentStatus === "PAID") {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: order.total,
          method: order.paymentMethod || "Card",
          reference: `TXN-${Date.now()}-${i}`,
          status: "completed",
        },
      });
    }

    // Create delivery info for delivery orders
    if (orderType === "DELIVERY") {
      await prisma.deliveryInfo.create({
        data: {
          orderId: order.id,
          address: ["123 Main St", "456 Oak Ave", "789 Pine Rd"][Math.floor(Math.random() * 3)],
          city: "San Francisco",
          state: "CA",
          zipCode: ["94102", "94103", "94104"][Math.floor(Math.random() * 3)],
          instructions: Math.random() > 0.6 ? "Ring doorbell" : null,
          driverName: status !== "PENDING" ? ["Mike D.", "Sarah L.", "John K."][Math.floor(Math.random() * 3)] : null,
          estimatedTime: new Date(orderTime.getTime() + 1800000 + Math.random() * 1800000), // 30-60 min
          deliveredAt: status === "COMPLETED" ? new Date(orderTime.getTime() + 2400000) : null,
          platform: order.source as string,
        },
      });
    }
  }

  // ============= SCHEDULES =============
  console.log("Creating schedules...");

  try { await prisma.schedule.deleteMany(); } catch {}

  const positions = ["Server", "Bartender", "Host", "Line Cook", "Prep Cook", "Busser"];
  const scheduleStaff = await prisma.staff.findMany({ take: 10 });

  for (let day = 0; day < 7; day++) {
    const date = new Date();
    date.setDate(date.getDate() + day);
    date.setHours(0, 0, 0, 0);

    for (let i = 0; i < 5; i++) {
      const staff = scheduleStaff[Math.floor(Math.random() * scheduleStaff.length)];
      const isEvening = Math.random() > 0.5;

      const startTime = new Date(date);
      startTime.setHours(isEvening ? 16 : 9);

      const endTime = new Date(date);
      endTime.setHours(isEvening ? 23 : 16);

      await prisma.schedule.create({
        data: {
          staffId: staff.id,
          date,
          startTime,
          endTime,
          position: staff.position,
          notes: Math.random() > 0.8 ? "Opening shift" : null,
        },
      });
    }
  }

  // ============= TIP DISTRIBUTIONS =============
  console.log("Creating tip distributions...");

  try { await prisma.tipDistribution.deleteMany(); } catch {}

  const tipStaff = await prisma.staff.findMany({
    where: { position: { in: ["Server", "Bartender", "Host", "Busser"] } },
  });

  for (let day = 0; day < 14; day++) {
    const date = new Date();
    date.setDate(date.getDate() - day);

    for (const staff of tipStaff) {
      if (Math.random() > 0.4) {
        await prisma.tipDistribution.create({
          data: {
            staffId: staff.id,
            date,
            amount: Math.floor(50 + Math.random() * 150),
            source: ["card", "cash", "pooled"][Math.floor(Math.random() * 3)],
          },
        });
      }
    }
  }

  // ============= WASTE RECORDS =============
  console.log("Creating waste records...");

  try { await prisma.wasteRecord.deleteMany(); } catch {}

  const wasteIngredients = await prisma.ingredient.findMany({ take: 10 });
  const wasteReasons = ["Expired", "Spoiled", "Overproduction", "Customer Return", "Preparation Error"];

  for (let day = 0; day < 7; day++) {
    const date = new Date();
    date.setDate(date.getDate() - day);

    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      const ingredient = wasteIngredients[Math.floor(Math.random() * wasteIngredients.length)];
      const quantity = 0.5 + Math.random() * 2;

      await prisma.wasteRecord.create({
        data: {
          ingredientId: ingredient.id,
          quantity,
          reason: wasteReasons[Math.floor(Math.random() * wasteReasons.length)],
          cost: ingredient.cost * quantity,
          createdAt: date,
        },
      });
    }
  }

  // ============= LOCATIONS =============
  console.log("Creating locations...");

  try { await prisma.location.deleteMany(); } catch {}

  const locations = [
    {
      name: "Downtown",
      code: "DT",
      address: "123 Main Street",
      city: "San Francisco",
      state: "CA",
      zipCode: "94102",
      phone: "(415) 555-0001",
      email: "downtown@restaurant.com",
      timezone: "America/Los_Angeles",
      isPrimary: true,
      operatingHours: {
        monday: { open: "11:00", close: "22:00" },
        tuesday: { open: "11:00", close: "22:00" },
        wednesday: { open: "11:00", close: "22:00" },
        thursday: { open: "11:00", close: "23:00" },
        friday: { open: "11:00", close: "23:00" },
        saturday: { open: "10:00", close: "23:00" },
        sunday: { open: "10:00", close: "21:00" },
      },
    },
    {
      name: "Marina District",
      code: "MR",
      address: "456 Marina Blvd",
      city: "San Francisco",
      state: "CA",
      zipCode: "94123",
      phone: "(415) 555-0002",
      email: "marina@restaurant.com",
      timezone: "America/Los_Angeles",
      isPrimary: false,
      operatingHours: {
        monday: { open: "11:30", close: "21:30" },
        tuesday: { open: "11:30", close: "21:30" },
        wednesday: { open: "11:30", close: "21:30" },
        thursday: { open: "11:30", close: "22:00" },
        friday: { open: "11:30", close: "22:30" },
        saturday: { open: "10:00", close: "22:30" },
        sunday: { open: "10:00", close: "21:00" },
      },
    },
    {
      name: "Palo Alto",
      code: "PA",
      address: "789 University Ave",
      city: "Palo Alto",
      state: "CA",
      zipCode: "94301",
      phone: "(650) 555-0003",
      email: "paloalto@restaurant.com",
      timezone: "America/Los_Angeles",
      isPrimary: false,
      operatingHours: {
        monday: { open: "11:00", close: "21:00" },
        tuesday: { open: "11:00", close: "21:00" },
        wednesday: { open: "11:00", close: "21:00" },
        thursday: { open: "11:00", close: "22:00" },
        friday: { open: "11:00", close: "22:00" },
        saturday: { open: "10:00", close: "22:00" },
        sunday: { open: "10:00", close: "20:00" },
      },
    },
  ];

  for (const loc of locations) {
    await prisma.location.create({ data: loc });
  }

  // ============= NOTIFICATION TEMPLATES =============
  console.log("Creating notification templates...");

  try { await prisma.notificationTemplate.deleteMany(); } catch {}
  try { await prisma.notification.deleteMany(); } catch {}

  const templates = [
    {
      name: "Order Confirmation",
      type: "ORDER_CONFIRMATION" as const,
      channel: "EMAIL" as const,
      subject: "Your Order #{{orderNumber}} is Confirmed",
      content: "Hi {{customerName}},\n\nThank you for your order! Your order #{{orderNumber}} has been confirmed and is being prepared.\n\nEstimated time: {{estimatedTime}}\n\nBest regards,\nThe Restaurant Team",
    },
    {
      name: "Order Ready SMS",
      type: "ORDER_READY" as const,
      channel: "SMS" as const,
      subject: null,
      content: "Your order #{{orderNumber}} is ready for pickup! Show this message at the counter.",
    },
    {
      name: "Reservation Confirmation",
      type: "RESERVATION_CONFIRMATION" as const,
      channel: "EMAIL" as const,
      subject: "Reservation Confirmed for {{date}}",
      content: "Hi {{customerName}},\n\nYour reservation has been confirmed!\n\nDate: {{date}}\nTime: {{time}}\nParty Size: {{partySize}}\nTable: {{tableNumber}}\n\nWe look forward to seeing you!\n\nBest regards,\nThe Restaurant Team",
    },
    {
      name: "Reservation Reminder",
      type: "RESERVATION_REMINDER" as const,
      channel: "SMS" as const,
      subject: null,
      content: "Reminder: Your reservation at RestaurantAI is tomorrow at {{time}} for {{partySize}} guests. See you soon!",
    },
    {
      name: "Loyalty Points Update",
      type: "LOYALTY_UPDATE" as const,
      channel: "EMAIL" as const,
      subject: "You've Earned Points!",
      content: "Hi {{customerName}},\n\nGreat news! You've earned {{points}} points from your recent visit.\n\nCurrent Balance: {{totalPoints}} points\nTier: {{tier}}\n\nKeep collecting points for exclusive rewards!\n\nBest regards,\nThe Restaurant Team",
    },
    {
      name: "Feedback Request",
      type: "FEEDBACK_REQUEST" as const,
      channel: "EMAIL" as const,
      subject: "How was your experience?",
      content: "Hi {{customerName}},\n\nThank you for dining with us! We'd love to hear about your experience.\n\nPlease take a moment to share your feedback: {{feedbackLink}}\n\nYour opinion matters to us!\n\nBest regards,\nThe Restaurant Team",
    },
  ];

  for (const template of templates) {
    await prisma.notificationTemplate.create({ data: template });
  }

  // Create some sample notifications
  const notifications = [
    {
      type: "ORDER_CONFIRMATION" as const,
      channel: "EMAIL" as const,
      recipient: "customer@example.com",
      subject: "Your Order #ORD-001 is Confirmed",
      message: "Thank you for your order! It will be ready in 25 minutes.",
      status: "DELIVERED" as const,
      sentAt: new Date(Date.now() - 3600000),
      deliveredAt: new Date(Date.now() - 3590000),
    },
    {
      type: "RESERVATION_REMINDER" as const,
      channel: "SMS" as const,
      recipient: "+14155550123",
      subject: null,
      message: "Reminder: Your reservation is tomorrow at 7:00 PM for 4 guests.",
      status: "DELIVERED" as const,
      sentAt: new Date(Date.now() - 7200000),
      deliveredAt: new Date(Date.now() - 7190000),
    },
    {
      type: "ORDER_READY" as const,
      channel: "SMS" as const,
      recipient: "+14155550456",
      subject: null,
      message: "Your order #ORD-002 is ready for pickup!",
      status: "SENT" as const,
      sentAt: new Date(Date.now() - 1800000),
    },
    {
      type: "LOYALTY_UPDATE" as const,
      channel: "EMAIL" as const,
      recipient: "vip@example.com",
      subject: "You've Earned 150 Points!",
      message: "Congratulations! You've earned 150 points. Your balance is now 1,500 points.",
      status: "DELIVERED" as const,
      sentAt: new Date(Date.now() - 86400000),
      deliveredAt: new Date(Date.now() - 86390000),
    },
  ];

  for (const notif of notifications) {
    await prisma.notification.create({ data: notif });
  }

  // ============= RECIPES =============
  console.log("Creating recipes...");

  try { await prisma.recipe.deleteMany(); } catch {}

  const recipeMenuItems = await prisma.menuItem.findMany({ take: 10 });

  const recipeData = [
    {
      prepTime: 15,
      cookTime: 20,
      servings: 1,
      difficulty: "MEDIUM" as const,
      instructions: [
        { step: 1, text: "Season the salmon fillet with salt, pepper, and fresh dill." },
        { step: 2, text: "Heat olive oil in a pan over medium-high heat." },
        { step: 3, text: "Place salmon skin-side down and cook for 4-5 minutes." },
        { step: 4, text: "Flip and cook for another 3-4 minutes until desired doneness." },
        { step: 5, text: "Prepare lemon dill sauce by combining butter, lemon juice, and fresh dill." },
        { step: 6, text: "Plate the salmon and drizzle with sauce. Garnish with lemon wedge." },
      ],
      notes: "Use fresh Atlantic salmon for best results. Let rest for 2 minutes before serving.",
      allergenNotes: "Contains fish. May be cooked in butter (dairy).",
    },
    {
      prepTime: 10,
      cookTime: 15,
      servings: 1,
      difficulty: "EASY" as const,
      instructions: [
        { step: 1, text: "Tear romaine lettuce into bite-sized pieces and place in a large bowl." },
        { step: 2, text: "Prepare Caesar dressing by combining mayo, lemon juice, garlic, anchovy paste, and parmesan." },
        { step: 3, text: "Toss lettuce with dressing until well coated." },
        { step: 4, text: "Top with croutons and shaved parmesan cheese." },
        { step: 5, text: "Season with black pepper and serve immediately." },
      ],
      notes: "Make croutons fresh for best texture. Add grilled chicken for protein.",
      allergenNotes: "Contains dairy, eggs, fish (anchovy), and wheat.",
    },
    {
      prepTime: 5,
      cookTime: 12,
      servings: 1,
      difficulty: "HARD" as const,
      instructions: [
        { step: 1, text: "Bring steak to room temperature 30 minutes before cooking." },
        { step: 2, text: "Season generously with salt and pepper on both sides." },
        { step: 3, text: "Heat cast iron skillet until smoking hot." },
        { step: 4, text: "Add oil and sear steak for 3-4 minutes per side for medium-rare." },
        { step: 5, text: "Add butter, garlic, and thyme. Baste steak for 1 minute." },
        { step: 6, text: "Rest for 5 minutes before slicing. Serve with compound butter." },
      ],
      notes: "USDA Prime recommended. Internal temp: 130°F for medium-rare. Let rest minimum 5 minutes.",
      allergenNotes: "May contain dairy if served with butter.",
    },
    {
      prepTime: 20,
      cookTime: 25,
      servings: 4,
      difficulty: "MEDIUM" as const,
      instructions: [
        { step: 1, text: "Cook pasta according to package directions. Reserve 1 cup pasta water." },
        { step: 2, text: "Brown ground beef with onions and garlic." },
        { step: 3, text: "Add crushed tomatoes, tomato paste, and Italian seasonings." },
        { step: 4, text: "Simmer sauce for 15-20 minutes until thickened." },
        { step: 5, text: "Toss pasta with sauce, adding pasta water as needed." },
        { step: 6, text: "Top with fresh parmesan and basil." },
      ],
      notes: "Use San Marzano tomatoes for authentic flavor. Can substitute with plant-based meat.",
      allergenNotes: "Contains wheat and dairy.",
    },
    {
      prepTime: 15,
      cookTime: 12,
      servings: 1,
      difficulty: "EASY" as const,
      instructions: [
        { step: 1, text: "Prepare chocolate batter by melting butter and chocolate together." },
        { step: 2, text: "Whisk in sugar, eggs, and flour until smooth." },
        { step: 3, text: "Pour into greased ramekins." },
        { step: 4, text: "Bake at 425°F for 12 minutes until edges are set but center is soft." },
        { step: 5, text: "Let cool 1 minute, then invert onto plate." },
        { step: 6, text: "Serve immediately with vanilla ice cream and fresh berries." },
      ],
      notes: "Timing is critical - center should be molten. Can be prepped ahead and refrigerated.",
      allergenNotes: "Contains dairy, eggs, and wheat.",
    },
  ];

  for (let i = 0; i < Math.min(recipeData.length, recipeMenuItems.length); i++) {
    await prisma.recipe.create({
      data: {
        menuItemId: recipeMenuItems[i].id,
        ...recipeData[i],
      },
    });
  }

  // ============= PERFORMANCE RECORDS =============
  console.log("Creating performance records...");

  try { await prisma.performanceRecord.deleteMany(); } catch {}

  const perfStaff = await prisma.staff.findMany({ take: 10 });
  const metrics = ["customer_satisfaction", "speed_of_service", "upselling", "teamwork", "order_accuracy"];

  for (const staff of perfStaff) {
    for (let week = 0; week < 4; week++) {
      const date = new Date();
      date.setDate(date.getDate() - (week * 7));

      // Create 2-3 metrics per week
      const numMetrics = 2 + Math.floor(Math.random() * 2);
      const selectedMetrics = metrics.sort(() => 0.5 - Math.random()).slice(0, numMetrics);

      for (const metric of selectedMetrics) {
        const value = metric === "attendance" || metric === "order_accuracy"
          ? 85 + Math.random() * 15 // 85-100%
          : 3 + Math.random() * 2; // 3-5 score

        await prisma.performanceRecord.create({
          data: {
            staffId: staff.id,
            date,
            metric,
            value,
            notes: Math.random() > 0.7 ? "Great improvement this week" : null,
          },
        });
      }
    }
  }

  // ============= TIME CLOCK ENTRIES =============
  console.log("Creating time clock entries...");

  try { await prisma.timeClock.deleteMany(); } catch {}

  for (const staff of perfStaff) {
    for (let day = 0; day < 7; day++) {
      if (Math.random() > 0.3) { // 70% chance of working
        const date = new Date();
        date.setDate(date.getDate() - day);

        const clockIn = new Date(date);
        clockIn.setHours(Math.random() > 0.5 ? 9 : 16, Math.floor(Math.random() * 15), 0, 0);

        const clockOut = new Date(clockIn);
        clockOut.setHours(clockOut.getHours() + 6 + Math.floor(Math.random() * 3));

        const totalHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);

        await prisma.timeClock.create({
          data: {
            staffId: staff.id,
            clockIn,
            clockOut,
            totalHours,
          },
        });
      }
    }
  }

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
