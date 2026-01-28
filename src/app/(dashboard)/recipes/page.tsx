"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChefHat, Clock, Users, Plus, Search, Play, Utensils } from "lucide-react";

interface Recipe {
  id: string;
  menuItemId: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  difficulty: string;
  instructions: { step: number; text: string; image?: string }[];
  notes?: string;
  videoUrl?: string;
  allergenNotes?: string;
  menuItem: {
    id: string;
    name: string;
    description?: string;
    price: number;
    category: { name: string };
    ingredients: { ingredient: { name: string; unit: string }; quantity: number }[];
  };
}

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  category: { name: string };
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const [newRecipe, setNewRecipe] = useState({
    menuItemId: "",
    prepTime: 15,
    cookTime: 20,
    servings: 1,
    difficulty: "MEDIUM",
    instructions: [{ step: 1, text: "" }],
    notes: "",
    videoUrl: "",
    allergenNotes: "",
  });

  const fetchData = async () => {
    try {
      const [recipesRes, menuRes] = await Promise.all([
        fetch("/api/recipes"),
        fetch("/api/menu/items"),
      ]);
      const [recipesData, menuData] = await Promise.all([recipesRes.json(), menuRes.json()]);
      setRecipes(Array.isArray(recipesData) ? recipesData : []);
      setMenuItems(Array.isArray(menuData) ? menuData : []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateRecipe = async () => {
    try {
      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRecipe),
      });
      if (response.ok) {
        setShowCreateDialog(false);
        setNewRecipe({
          menuItemId: "",
          prepTime: 15,
          cookTime: 20,
          servings: 1,
          difficulty: "MEDIUM",
          instructions: [{ step: 1, text: "" }],
          notes: "",
          videoUrl: "",
          allergenNotes: "",
        });
        fetchData();
      }
    } catch (error) {
      console.error("Error creating recipe:", error);
    }
  };

  const addInstructionStep = () => {
    setNewRecipe({
      ...newRecipe,
      instructions: [
        ...newRecipe.instructions,
        { step: newRecipe.instructions.length + 1, text: "" },
      ],
    });
  };

  const updateInstructionStep = (index: number, text: string) => {
    const updated = [...newRecipe.instructions];
    updated[index] = { ...updated[index], text };
    setNewRecipe({ ...newRecipe, instructions: updated });
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "EASY":
        return "bg-green-500";
      case "MEDIUM":
        return "bg-yellow-500";
      case "HARD":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const filteredRecipes = recipes.filter((recipe) =>
    recipe.menuItem.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get menu items that don't have recipes yet
  const availableMenuItems = menuItems.filter(
    (item) => !recipes.some((recipe) => recipe.menuItemId === item.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <ChefHat className="h-8 w-8 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Recipes & Prep Instructions</h1>
          <p className="text-muted-foreground">Detailed cooking instructions for menu items</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Recipe
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Recipes</CardTitle>
            <ChefHat className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recipes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Easy</CardTitle>
            <Badge className="bg-green-500">Easy</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {recipes.filter((r) => r.difficulty === "EASY").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Medium</CardTitle>
            <Badge className="bg-yellow-500">Medium</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {recipes.filter((r) => r.difficulty === "MEDIUM").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hard</CardTitle>
            <Badge className="bg-red-500">Hard</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {recipes.filter((r) => r.difficulty === "HARD").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search recipes..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Recipe Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredRecipes.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ChefHat className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No recipes found</h3>
              <p className="text-muted-foreground">Add recipes for your menu items</p>
              <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                Add First Recipe
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredRecipes.map((recipe) => (
            <Card
              key={recipe.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedRecipe(recipe)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{recipe.menuItem.name}</CardTitle>
                    <CardDescription>{recipe.menuItem.category.name}</CardDescription>
                  </div>
                  <Badge className={getDifficultyColor(recipe.difficulty)}>
                    {recipe.difficulty}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>Prep: {recipe.prepTime}m</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Utensils className="h-4 w-4" />
                    <span>Cook: {recipe.cookTime}m</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>{recipe.servings}</span>
                  </div>
                </div>
                <p className="text-sm line-clamp-2">
                  {recipe.instructions[0]?.text || "No instructions"}
                </p>
                {recipe.videoUrl && (
                  <div className="flex items-center gap-1 mt-2 text-sm text-blue-500">
                    <Play className="h-4 w-4" />
                    Video available
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create Recipe Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Recipe</DialogTitle>
            <DialogDescription>Add cooking instructions for a menu item</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Menu Item</Label>
              <Select
                value={newRecipe.menuItemId}
                onValueChange={(value) => setNewRecipe({ ...newRecipe, menuItemId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a menu item" />
                </SelectTrigger>
                <SelectContent>
                  {availableMenuItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.category.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Prep Time (min)</Label>
                <Input
                  type="number"
                  value={newRecipe.prepTime}
                  onChange={(e) =>
                    setNewRecipe({ ...newRecipe, prepTime: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Cook Time (min)</Label>
                <Input
                  type="number"
                  value={newRecipe.cookTime}
                  onChange={(e) =>
                    setNewRecipe({ ...newRecipe, cookTime: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Servings</Label>
                <Input
                  type="number"
                  value={newRecipe.servings}
                  onChange={(e) =>
                    setNewRecipe({ ...newRecipe, servings: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select
                  value={newRecipe.difficulty}
                  onValueChange={(value) => setNewRecipe({ ...newRecipe, difficulty: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EASY">Easy</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HARD">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Instructions</Label>
              {newRecipe.instructions.map((instruction, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <span className="mt-2 text-sm font-medium w-8">{instruction.step}.</span>
                  <Textarea
                    placeholder={`Step ${instruction.step}...`}
                    value={instruction.text}
                    onChange={(e) => updateInstructionStep(index, e.target.value)}
                    rows={2}
                  />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addInstructionStep}>
                <Plus className="h-4 w-4 mr-2" />
                Add Step
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Video URL (optional)</Label>
              <Input
                placeholder="https://youtube.com/..."
                value={newRecipe.videoUrl}
                onChange={(e) => setNewRecipe({ ...newRecipe, videoUrl: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Allergen Notes (optional)</Label>
              <Textarea
                placeholder="Contains nuts, dairy, etc."
                value={newRecipe.allergenNotes}
                onChange={(e) => setNewRecipe({ ...newRecipe, allergenNotes: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Chef Notes (optional)</Label>
              <Textarea
                placeholder="Tips and tricks..."
                value={newRecipe.notes}
                onChange={(e) => setNewRecipe({ ...newRecipe, notes: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateRecipe}
                disabled={
                  !newRecipe.menuItemId || !newRecipe.instructions.some((i) => i.text.trim())
                }
              >
                Create Recipe
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recipe Detail Dialog */}
      <Dialog open={!!selectedRecipe} onOpenChange={() => setSelectedRecipe(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedRecipe && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="text-2xl">
                      {selectedRecipe.menuItem.name}
                    </DialogTitle>
                    <DialogDescription>
                      {selectedRecipe.menuItem.category.name} •{" "}
                      ${selectedRecipe.menuItem.price.toFixed(2)}
                    </DialogDescription>
                  </div>
                  <Badge className={getDifficultyColor(selectedRecipe.difficulty)}>
                    {selectedRecipe.difficulty}
                  </Badge>
                </div>
              </DialogHeader>
              <div className="space-y-6">
                {/* Time & Servings */}
                <div className="flex gap-6 py-4 border-y">
                  <div className="text-center">
                    <Clock className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                    <div className="text-sm font-medium">{selectedRecipe.prepTime} min</div>
                    <div className="text-xs text-muted-foreground">Prep Time</div>
                  </div>
                  <div className="text-center">
                    <Utensils className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                    <div className="text-sm font-medium">{selectedRecipe.cookTime} min</div>
                    <div className="text-xs text-muted-foreground">Cook Time</div>
                  </div>
                  <div className="text-center">
                    <Clock className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                    <div className="text-sm font-medium">
                      {selectedRecipe.prepTime + selectedRecipe.cookTime} min
                    </div>
                    <div className="text-xs text-muted-foreground">Total Time</div>
                  </div>
                  <div className="text-center">
                    <Users className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                    <div className="text-sm font-medium">{selectedRecipe.servings}</div>
                    <div className="text-xs text-muted-foreground">Servings</div>
                  </div>
                </div>

                {/* Ingredients */}
                {selectedRecipe.menuItem.ingredients.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Ingredients</h3>
                    <ul className="list-disc list-inside space-y-1">
                      {selectedRecipe.menuItem.ingredients.map((ing, idx) => (
                        <li key={idx} className="text-sm">
                          {ing.quantity} {ing.ingredient.unit} {ing.ingredient.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Instructions */}
                <div>
                  <h3 className="font-semibold mb-2">Instructions</h3>
                  <ol className="space-y-3">
                    {selectedRecipe.instructions.map((instruction, idx) => (
                      <li key={idx} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                          {instruction.step}
                        </span>
                        <p className="text-sm">{instruction.text}</p>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Video */}
                {selectedRecipe.videoUrl && (
                  <div>
                    <h3 className="font-semibold mb-2">Video Tutorial</h3>
                    <a
                      href={selectedRecipe.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-500 hover:underline"
                    >
                      <Play className="h-4 w-4" />
                      Watch Video
                    </a>
                  </div>
                )}

                {/* Allergen Notes */}
                {selectedRecipe.allergenNotes && (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <h3 className="font-semibold mb-1 text-yellow-800 dark:text-yellow-200">
                      Allergen Information
                    </h3>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      {selectedRecipe.allergenNotes}
                    </p>
                  </div>
                )}

                {/* Chef Notes */}
                {selectedRecipe.notes && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h3 className="font-semibold mb-1 text-blue-800 dark:text-blue-200">
                      Chef Notes
                    </h3>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      {selectedRecipe.notes}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
