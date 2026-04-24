"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/use-toast";
import { Pagination } from "@/components/ui/pagination";
import { SortHeader } from "@/components/ui/sort-header";
import { SkeletonTable } from "@/components/ui/skeleton-table";
import { ConfirmationDialog, useConfirmation } from "@/components/ui/confirmation-dialog";
import { ErrorBoundary } from "@/components/error-boundary";
import { exportToPDF } from "@/lib/pdf-export";
import {
  Plus, Edit, Trash2, AlertCircle, Star, Clock, ImageIcon,
  FileDown, CheckSquare, Search,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  cost: number | null;
  categoryId: string;
  category: { id: string; name: string };
  allergens: string[];
  isAvailable: boolean;
  is86d: boolean;
  isSpecial: boolean;
  calories: number | null;
  prepTime: number | null;
  imageUrl: string | null;
}

interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  items: MenuItem[];
}

interface FormErrors {
  name?: string;
  price?: string;
  categoryId?: string;
}

interface CategoryFormErrors {
  name?: string;
}

const ALLERGENS = [
  "Dairy", "Eggs", "Fish", "Shellfish", "Tree Nuts",
  "Peanuts", "Wheat", "Soy", "Sesame", "Gluten"
];

function MenuPageContent() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // Detail dialog states
  const [isItemDetailOpen, setIsItemDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [isCategoryDetailOpen, setIsCategoryDetailOpen] = useState(false);
  const [detailCategory, setDetailCategory] = useState<MenuCategory | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Sort state
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Search
  const [search, setSearch] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  // Confirmation dialog
  const { state: confirmState, confirm, close: closeConfirm } = useConfirmation();

  // Form validation
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [categoryFormErrors, setCategoryFormErrors] = useState<CategoryFormErrors>({});

  const openItemDetail = (item: MenuItem) => {
    setDetailItem(item);
    setIsItemDetailOpen(true);
  };

  const openCategoryDetail = (category: MenuCategory) => {
    setDetailCategory(category);
    setIsCategoryDetailOpen(true);
  };

  const [categoryFormData, setCategoryFormData] = useState({
    name: "", description: "", sortOrder: 0, isActive: true,
  });

  const [itemFormData, setItemFormData] = useState({
    name: "", description: "", price: 0, cost: 0, categoryId: "",
    allergens: [] as string[], isAvailable: true, is86d: false,
    isSpecial: false, calories: 0, prepTime: 0, imageUrl: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        sortBy,
        sortDirection,
      });
      if (selectedCategory !== "all") params.set("categoryId", selectedCategory);

      const [categoriesRes, itemsRes] = await Promise.all([
        fetch("/api/menu/categories"),
        fetch(`/api/menu/items?${params}`),
      ]);

      const [categoriesData, itemsResult] = await Promise.all([
        categoriesRes.json(),
        itemsRes.json(),
      ]);

      setCategories(Array.isArray(categoriesData) ? categoriesData : []);

      if (itemsResult.data) {
        setItems(itemsResult.data);
        setTotalItems(itemsResult.pagination.totalItems);
        setTotalPages(itemsResult.pagination.totalPages);
      } else {
        const data = Array.isArray(itemsResult) ? itemsResult : [];
        setItems(data);
        setTotalItems(data.length);
        setTotalPages(1);
      }
    } catch {
      toast({ title: "Error", description: "Failed to load menu data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, sortBy, sortDirection, selectedCategory]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Sort handler
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  // Bulk selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Bulk delete
  const handleBulkDelete = () => {
    confirm({
      title: "Bulk Delete Menu Items",
      description: `Are you sure you want to delete ${selectedIds.size} menu items? This action cannot be undone.`,
      variant: "danger",
      confirmLabel: `Delete ${selectedIds.size} items`,
      onConfirm: async () => {
        try {
          const res = await fetch("/api/bulk", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: "menuItem", ids: Array.from(selectedIds) }),
          });
          if (res.ok) {
            const data = await res.json();
            toast({ title: "Success", description: `${data.deleted} items deleted` });
            setSelectedIds(new Set());
            setBulkMode(false);
            fetchData();
          }
        } catch {
          toast({ title: "Error", description: "Failed to bulk delete", variant: "destructive" });
        }
        closeConfirm();
      },
    });
  };

  // Bulk 86
  const handleBulk86 = (is86d: boolean) => {
    confirm({
      title: is86d ? "86 Selected Items" : "Restore Selected Items",
      description: `${is86d ? "86" : "Restore"} ${selectedIds.size} menu items?`,
      variant: "warning",
      confirmLabel: is86d ? "86 Items" : "Restore Items",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/bulk", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: "menuItem", ids: Array.from(selectedIds), data: { is86d } }),
          });
          if (res.ok) {
            const data = await res.json();
            toast({ title: "Success", description: `${data.updated} items updated` });
            setSelectedIds(new Set());
            setBulkMode(false);
            fetchData();
          }
        } catch {
          toast({ title: "Error", description: "Failed to bulk update", variant: "destructive" });
        }
        closeConfirm();
      },
    });
  };

  // PDF Export
  const handleExportPDF = () => {
    exportToPDF({
      title: "Menu Items Report",
      subtitle: `${totalItems} items | Generated from RestaurantAI`,
      filename: "menu-report.pdf",
      orientation: "landscape",
      columns: [
        { header: "Item", field: "name" },
        { header: "Category", field: "category" },
        { header: "Price", field: "price", format: (v: unknown) => `$${(v as number).toFixed(2)}` },
        { header: "Cost", field: "cost", format: (v: unknown) => v ? `$${(v as number).toFixed(2)}` : "-" },
        { header: "Margin", field: "margin" },
        { header: "Status", field: "status" },
        { header: "Allergens", field: "allergens" },
      ],
      data: items.map((item) => ({
        name: item.name,
        category: item.category.name,
        price: item.price,
        cost: item.cost,
        margin: item.cost ? `${((item.price - item.cost) / item.price * 100).toFixed(1)}%` : "-",
        status: item.is86d ? "86'd" : item.isAvailable ? "Available" : "Unavailable",
        allergens: item.allergens.join(", ") || "None",
      })),
    });
    toast({ title: "Export Complete", description: "PDF has been downloaded" });
  };

  // Validate item form
  const validateItemForm = (): boolean => {
    const errors: FormErrors = {};
    if (!itemFormData.name.trim()) {
      errors.name = "Item name is required";
    } else if (itemFormData.name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters";
    }
    if (itemFormData.price <= 0) {
      errors.price = "Price must be greater than 0";
    }
    if (!itemFormData.categoryId) {
      errors.categoryId = "Category is required";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Validate category form
  const validateCategoryForm = (): boolean => {
    const errors: CategoryFormErrors = {};
    if (!categoryFormData.name.trim()) {
      errors.name = "Category name is required";
    } else if (categoryFormData.name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters";
    }
    setCategoryFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateCategory = async () => {
    if (!validateCategoryForm()) return;
    try {
      const response = await fetch("/api/menu/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryFormData),
      });
      if (response.ok) {
        toast({ title: "Success", description: "Category created successfully" });
        setIsCategoryDialogOpen(false);
        resetCategoryForm();
        fetchData();
      } else {
        throw new Error("Failed to create category");
      }
    } catch {
      toast({ title: "Error", description: "Failed to create category", variant: "destructive" });
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !validateCategoryForm()) return;
    try {
      const response = await fetch(`/api/menu/categories/${editingCategory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryFormData),
      });
      if (response.ok) {
        toast({ title: "Success", description: "Category updated successfully" });
        setIsCategoryDialogOpen(false);
        setEditingCategory(null);
        resetCategoryForm();
        fetchData();
      } else {
        throw new Error("Failed to update category");
      }
    } catch {
      toast({ title: "Error", description: "Failed to update category", variant: "destructive" });
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    confirm({
      title: "Delete Category",
      description: `Are you sure you want to delete "${name}"? All items in this category may be affected.`,
      variant: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/menu/categories/${id}`, { method: "DELETE" });
          if (response.ok) {
            toast({ title: "Success", description: "Category deleted" });
            fetchData();
          } else {
            throw new Error("Failed to delete category");
          }
        } catch {
          toast({ title: "Error", description: "Failed to delete category", variant: "destructive" });
        }
        closeConfirm();
      },
    });
  };

  const handleCreateItem = async () => {
    if (!validateItemForm()) return;
    try {
      const response = await fetch("/api/menu/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...itemFormData,
          price: parseFloat(itemFormData.price.toString()),
          cost: itemFormData.cost ? parseFloat(itemFormData.cost.toString()) : null,
          calories: itemFormData.calories || null,
          prepTime: itemFormData.prepTime || null,
          imageUrl: itemFormData.imageUrl || null,
        }),
      });
      if (response.ok) {
        toast({ title: "Success", description: "Menu item created successfully" });
        setIsItemDialogOpen(false);
        resetItemForm();
        fetchData();
      } else {
        throw new Error("Failed to create menu item");
      }
    } catch {
      toast({ title: "Error", description: "Failed to create menu item", variant: "destructive" });
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItem || !validateItemForm()) return;
    try {
      const response = await fetch(`/api/menu/items/${editingItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...itemFormData,
          price: parseFloat(itemFormData.price.toString()),
          cost: itemFormData.cost ? parseFloat(itemFormData.cost.toString()) : null,
          calories: itemFormData.calories || null,
          prepTime: itemFormData.prepTime || null,
          imageUrl: itemFormData.imageUrl || null,
        }),
      });
      if (response.ok) {
        toast({ title: "Success", description: "Menu item updated successfully" });
        setIsItemDialogOpen(false);
        setEditingItem(null);
        resetItemForm();
        fetchData();
      } else {
        throw new Error("Failed to update menu item");
      }
    } catch {
      toast({ title: "Error", description: "Failed to update menu item", variant: "destructive" });
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    confirm({
      title: "Delete Menu Item",
      description: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      variant: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/menu/items/${id}`, { method: "DELETE" });
          if (response.ok) {
            toast({ title: "Success", description: "Menu item deleted" });
            fetchData();
          } else {
            throw new Error("Failed to delete menu item");
          }
        } catch {
          toast({ title: "Error", description: "Failed to delete menu item", variant: "destructive" });
        }
        closeConfirm();
      },
    });
  };

  const handle86Item = async (item: MenuItem) => {
    try {
      const response = await fetch(`/api/menu/items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is86d: !item.is86d }),
      });
      if (response.ok) {
        toast({
          title: "Success",
          description: item.is86d ? `${item.name} is back on the menu` : `${item.name} has been 86'd`
        });
        fetchData();
      } else {
        throw new Error("Failed to update item");
      }
    } catch {
      toast({ title: "Error", description: "Failed to update item", variant: "destructive" });
    }
  };

  const resetCategoryForm = () => {
    setCategoryFormData({ name: "", description: "", sortOrder: 0, isActive: true });
    setCategoryFormErrors({});
  };

  const resetItemForm = () => {
    setItemFormData({
      name: "", description: "", price: 0, cost: 0,
      categoryId: categories[0]?.id || "", allergens: [],
      isAvailable: true, is86d: false, isSpecial: false,
      calories: 0, prepTime: 0, imageUrl: "",
    });
    setFormErrors({});
  };

  const openEditCategoryDialog = (category: MenuCategory) => {
    setEditingCategory(category);
    setCategoryFormData({
      name: category.name, description: category.description || "",
      sortOrder: category.sortOrder, isActive: category.isActive,
    });
    setCategoryFormErrors({});
    setIsCategoryDialogOpen(true);
  };

  const openEditItemDialog = (item: MenuItem) => {
    setEditingItem(item);
    setItemFormData({
      name: item.name, description: item.description || "",
      price: item.price, cost: item.cost || 0, categoryId: item.categoryId,
      allergens: item.allergens, isAvailable: item.isAvailable,
      is86d: item.is86d, isSpecial: item.isSpecial,
      calories: item.calories || 0, prepTime: item.prepTime || 0,
      imageUrl: item.imageUrl || "",
    });
    setFormErrors({});
    setIsItemDialogOpen(true);
  };

  const toggleAllergen = (allergen: string) => {
    setItemFormData((prev) => ({
      ...prev,
      allergens: prev.allergens.includes(allergen)
        ? prev.allergens.filter((a) => a !== allergen)
        : [...prev.allergens, allergen],
    }));
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    setCurrentPage(1);
  };

  const item86dCount = items.filter((i) => i.is86d).length;

  const filteredItems = search
    ? items.filter((item) =>
        `${item.name} ${item.description || ""} ${item.category.name}`.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  return (
    <div className="flex flex-col h-full">
      <Header title="Menu Management" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Menu</h2>
            <p className="text-muted-foreground">
              {totalItems} items across {categories.length} categories
              {item86dCount > 0 && (
                <span className="text-destructive ml-2">({item86dCount} items 86'd)</span>
              )}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Input placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
            <Button variant="outline" size="sm" onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}>
              <CheckSquare className="mr-2 h-4 w-4" /> {bulkMode ? "Cancel" : "Select"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileDown className="mr-2 h-4 w-4" /> PDF
            </Button>
            <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={() => { setEditingCategory(null); resetCategoryForm(); }}>
                  <Plus className="mr-2 h-4 w-4" /> Add Category
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Name *</Label>
                    <Input
                      value={categoryFormData.name}
                      onChange={(e) => { setCategoryFormData({ ...categoryFormData, name: e.target.value }); setCategoryFormErrors((p) => ({ ...p, name: undefined })); }}
                      placeholder="Appetizers"
                      className={categoryFormErrors.name ? "border-destructive" : ""}
                    />
                    {categoryFormErrors.name && <p className="text-xs text-destructive">{categoryFormErrors.name}</p>}
                  </div>
                  <div className="grid gap-2">
                    <Label>Description</Label>
                    <Textarea value={categoryFormData.description} onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })} placeholder="Starters and small plates..." />
                  </div>
                  <div className="grid gap-2">
                    <Label>Sort Order</Label>
                    <Input type="number" value={categoryFormData.sortOrder} onChange={(e) => setCategoryFormData({ ...categoryFormData, sortOrder: parseInt(e.target.value) })} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={categoryFormData.isActive} onCheckedChange={(checked) => setCategoryFormData({ ...categoryFormData, isActive: checked })} />
                    <Label>Active</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Cancel</Button>
                  <Button onClick={editingCategory ? handleUpdateCategory : handleCreateCategory}>
                    {editingCategory ? "Update" : "Create"} Category
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingItem(null); resetItemForm(); }}>
                  <Plus className="mr-2 h-4 w-4" /> Add Item
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingItem ? "Edit Menu Item" : "Add Menu Item"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div className="grid gap-2">
                    <Label>Name *</Label>
                    <Input
                      value={itemFormData.name}
                      onChange={(e) => { setItemFormData({ ...itemFormData, name: e.target.value }); setFormErrors((p) => ({ ...p, name: undefined })); }}
                      placeholder="Grilled Salmon"
                      className={formErrors.name ? "border-destructive" : ""}
                    />
                    {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
                  </div>
                  <div className="grid gap-2">
                    <Label>Description</Label>
                    <Textarea value={itemFormData.description} onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })} placeholder="Fresh Atlantic salmon with lemon butter..." />
                  </div>
                  <div className="grid gap-2">
                    <Label>Category *</Label>
                    <Select
                      value={itemFormData.categoryId}
                      onValueChange={(value) => { setItemFormData({ ...itemFormData, categoryId: value }); setFormErrors((p) => ({ ...p, categoryId: undefined })); }}
                    >
                      <SelectTrigger className={formErrors.categoryId ? "border-destructive" : ""}>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formErrors.categoryId && <p className="text-xs text-destructive">{formErrors.categoryId}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Price ($) *</Label>
                      <Input
                        type="number" step="0.01"
                        value={itemFormData.price}
                        onChange={(e) => { setItemFormData({ ...itemFormData, price: parseFloat(e.target.value) || 0 }); setFormErrors((p) => ({ ...p, price: undefined })); }}
                        className={formErrors.price ? "border-destructive" : ""}
                      />
                      {formErrors.price && <p className="text-xs text-destructive">{formErrors.price}</p>}
                    </div>
                    <div className="grid gap-2">
                      <Label>Cost ($)</Label>
                      <Input type="number" step="0.01" value={itemFormData.cost} onChange={(e) => setItemFormData({ ...itemFormData, cost: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Calories</Label>
                      <Input type="number" value={itemFormData.calories} onChange={(e) => setItemFormData({ ...itemFormData, calories: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Prep Time (min)</Label>
                      <Input type="number" value={itemFormData.prepTime} onChange={(e) => setItemFormData({ ...itemFormData, prepTime: parseInt(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Image URL</Label>
                    <Input value={itemFormData.imageUrl} onChange={(e) => setItemFormData({ ...itemFormData, imageUrl: e.target.value })} placeholder="https://example.com/image.jpg" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Allergens</Label>
                    <div className="flex flex-wrap gap-2">
                      {ALLERGENS.map((allergen) => (
                        <Badge
                          key={allergen}
                          variant={itemFormData.allergens.includes(allergen) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleAllergen(allergen)}
                        >
                          {allergen}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch checked={itemFormData.isAvailable} onCheckedChange={(checked) => setItemFormData({ ...itemFormData, isAvailable: checked })} />
                      <Label>Available</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={itemFormData.isSpecial} onCheckedChange={(checked) => setItemFormData({ ...itemFormData, isSpecial: checked })} />
                      <Label>Special</Label>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsItemDialogOpen(false)}>Cancel</Button>
                  <Button onClick={editingItem ? handleUpdateItem : handleCreateItem}>
                    {editingItem ? "Update" : "Create"} Item
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {bulkMode && selectedIds.size > 0 && (
          <Card className="border-primary">
            <CardContent className="p-3 flex items-center justify-between">
              <span className="text-sm font-medium">{selectedIds.size} items selected</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleBulk86(true)}>
                  <AlertCircle className="mr-1 h-3 w-3" /> 86 Items
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulk86(false)}>
                  Restore Items
                </Button>
                <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                  <Trash2 className="mr-1 h-3 w-3" /> Delete Selected
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="items" className="space-y-4">
          <TabsList>
            <TabsTrigger value="items">Menu Items</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="86d">86'd Items ({item86dCount})</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Button variant={selectedCategory === "all" ? "default" : "outline"} size="sm" onClick={() => handleCategoryChange("all")}>
                All Items
              </Button>
              {categories.map((cat) => (
                <Button key={cat.id} variant={selectedCategory === cat.id ? "default" : "outline"} size="sm" onClick={() => handleCategoryChange(cat.id)}>
                  {cat.name}
                </Button>
              ))}
            </div>

            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <SkeletonTable rows={8} columns={7} />
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {bulkMode && (
                            <TableHead className="w-10">
                              <Checkbox
                                checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                                onCheckedChange={toggleSelectAll}
                              />
                            </TableHead>
                          )}
                          <TableHead>
                            <SortHeader label="Item" field="name" currentSort={sortBy} currentDirection={sortDirection} onSort={handleSort} />
                          </TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>
                            <SortHeader label="Price" field="price" currentSort={sortBy} currentDirection={sortDirection} onSort={handleSort} />
                          </TableHead>
                          <TableHead>Cost</TableHead>
                          <TableHead>Margin</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.map((item) => {
                          const margin = item.cost ? ((item.price - item.cost) / item.price * 100).toFixed(1) : "N/A";
                          return (
                            <TableRow
                              key={item.id}
                              className={`cursor-pointer hover:bg-muted/50 ${item.is86d ? "opacity-50" : ""}`}
                              onClick={() => !bulkMode && openItemDetail(item)}
                            >
                              {bulkMode && (
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedIds.has(item.id)}
                                    onCheckedChange={() => toggleSelect(item.id)}
                                  />
                                </TableCell>
                              )}
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  {item.imageUrl ? (
                                    <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0">
                                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                    </div>
                                  ) : (
                                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-medium flex items-center gap-2">
                                      {item.name}
                                      {item.isSpecial && <Star className="h-3 w-3 text-yellow-500" />}
                                    </p>
                                    <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                                    {item.allergens.length > 0 && (
                                      <div className="flex gap-1 mt-1">
                                        {item.allergens.map((a) => (
                                          <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>{item.category.name}</TableCell>
                              <TableCell>{formatCurrency(item.price)}</TableCell>
                              <TableCell>{item.cost ? formatCurrency(item.cost) : "-"}</TableCell>
                              <TableCell>{typeof margin === 'string' && margin !== 'N/A' ? `${margin}%` : margin}</TableCell>
                              <TableCell>
                                {item.is86d ? (
                                  <Badge variant="destructive">86'd</Badge>
                                ) : item.isAvailable ? (
                                  <Badge variant="success">Available</Badge>
                                ) : (
                                  <Badge variant="secondary">Unavailable</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant={item.is86d ? "default" : "destructive"} onClick={() => handle86Item(item)}>
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    {item.is86d ? "Restore" : "86"}
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => openEditItemDialog(item)}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleDeleteItem(item.id, item.name)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {filteredItems.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={bulkMode ? 9 : 8} className="text-center py-8 text-muted-foreground">
                              No menu items found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={totalItems}
                      pageSize={pageSize}
                      onPageChange={setCurrentPage}
                      onPageSizeChange={handlePageSizeChange}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <Card key={category.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openCategoryDetail(category)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{category.name}</CardTitle>
                      {category.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                    <CardDescription>{category.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      {category.items?.length || 0} items
                    </p>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={() => openEditCategoryDialog(category)}>
                        <Edit className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDeleteCategory(category.id, category.name)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {categories.length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No categories found. Create your first category to get started.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="86d">
            <Card>
              <CardHeader>
                <CardTitle>86'd Items</CardTitle>
                <CardDescription>Items currently unavailable or out of stock</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {items.filter((i) => i.is86d).map((item) => (
                    <div key={item.id} className="flex items-center justify-between border-b pb-3">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{item.category.name}</p>
                      </div>
                      <Button onClick={() => handle86Item(item)}>
                        Restore to Menu
                      </Button>
                    </div>
                  ))}
                  {items.filter((i) => i.is86d).length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No items are currently 86'd
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Menu Item Detail Dialog */}
        <Dialog open={isItemDetailOpen} onOpenChange={setIsItemDetailOpen}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            {detailItem && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {detailItem.name}
                    {detailItem.isSpecial && <Star className="h-4 w-4 text-yellow-500" />}
                  </DialogTitle>
                  <DialogDescription className="flex items-center gap-2">
                    {detailItem.is86d ? (
                      <Badge variant="destructive">86'd</Badge>
                    ) : detailItem.isAvailable ? (
                      <Badge variant="success">Available</Badge>
                    ) : (
                      <Badge variant="secondary">Unavailable</Badge>
                    )}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {detailItem.description && (
                    <p className="text-sm text-muted-foreground">{detailItem.description}</p>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-lg font-bold">{formatCurrency(detailItem.price)}</p>
                      <p className="text-xs text-muted-foreground">Price</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-lg font-bold">{detailItem.cost ? formatCurrency(detailItem.cost) : "-"}</p>
                      <p className="text-xs text-muted-foreground">Cost</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-lg font-bold">
                        {detailItem.cost ? `${((detailItem.price - detailItem.cost) / detailItem.price * 100).toFixed(1)}%` : "-"}
                      </p>
                      <p className="text-xs text-muted-foreground">Margin</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Category</p>
                      <p className="font-medium">{detailItem.category.name}</p>
                    </div>
                    {detailItem.calories && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Calories</p>
                        <p className="font-medium">{detailItem.calories} cal</p>
                      </div>
                    )}
                    {detailItem.prepTime && (
                      <div className="p-3 bg-muted/50 rounded-lg flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span>{detailItem.prepTime} min</span>
                      </div>
                    )}
                  </div>

                  {detailItem.allergens.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Allergens</p>
                      <div className="flex flex-wrap gap-1">
                        {detailItem.allergens.map((allergen) => (
                          <Badge key={allergen} variant="outline" className="text-xs">{allergen}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setIsItemDetailOpen(false);
                      handleDeleteItem(detailItem.id, detailItem.name);
                    }}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Delete
                  </Button>
                  <Button
                    variant={detailItem.is86d ? "default" : "destructive"}
                    size="sm"
                    onClick={() => { handle86Item(detailItem); setIsItemDetailOpen(false); }}
                  >
                    <AlertCircle className="mr-1 h-3 w-3" />
                    {detailItem.is86d ? "Restore" : "86 Item"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { openEditItemDialog(detailItem); setIsItemDetailOpen(false); }}
                  >
                    <Edit className="mr-1 h-3 w-3" /> Edit
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Category Detail Dialog */}
        <Dialog open={isCategoryDetailOpen} onOpenChange={setIsCategoryDetailOpen}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            {detailCategory && (
              <>
                <DialogHeader>
                  <DialogTitle>{detailCategory.name}</DialogTitle>
                  <DialogDescription className="flex items-center gap-2">
                    {detailCategory.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {detailCategory.description && (
                    <p className="text-sm text-muted-foreground">{detailCategory.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-2xl font-bold">{detailCategory.items?.length || 0}</p>
                      <p className="text-xs text-muted-foreground">Items</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-2xl font-bold">{detailCategory.sortOrder}</p>
                      <p className="text-xs text-muted-foreground">Sort Order</p>
                    </div>
                  </div>

                  {detailCategory.items && detailCategory.items.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Items in Category</p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {detailCategory.items.map((item) => (
                          <div key={item.id} className="flex justify-between items-center p-2 bg-muted/50 rounded text-sm">
                            <span className={item.is86d ? "line-through text-muted-foreground" : ""}>{item.name}</span>
                            <span className="font-medium">{formatCurrency(item.price)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { setIsCategoryDetailOpen(false); handleDeleteCategory(detailCategory.id, detailCategory.name); }}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Delete
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { openEditCategoryDialog(detailCategory); setIsCategoryDetailOpen(false); }}
                    className="flex-1"
                  >
                    <Edit className="mr-1 h-3 w-3" /> Edit Category
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Confirmation Dialog */}
        <ConfirmationDialog
          open={confirmState.open}
          onOpenChange={(open) => !open && closeConfirm()}
          title={confirmState.title}
          description={confirmState.description}
          variant={confirmState.variant}
          confirmLabel={confirmState.confirmLabel}
          onConfirm={confirmState.onConfirm}
        />
      </div>
    </div>
  );
}

export default function MenuPage() {
  return (
    <ErrorBoundary>
      <MenuPageContent />
    </ErrorBoundary>
  );
}
