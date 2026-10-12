"use client";

import { readRecordArray } from "@/lib/record-response";
import { RecordLoadNotice } from "@/components/RecordLoadNotice";
import { useRecordRequest } from "@/components/use-record-request";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { Plus, Edit, Trash2, AlertTriangle, Package, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Vendor {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  parLevel: number;
  reorderPoint: number;
  cost: number;
  vendorId: string | null;
  vendor: Vendor | null;
}

export default function InventoryPage() {
  const mutation = useRecordRequest();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isIngredientDialogOpen, setIsIngredientDialogOpen] = useState(false);
  const [isVendorDialogOpen, setIsVendorDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  // Detail sheet states
  const [isIngredientDetailOpen, setIsIngredientDetailOpen] = useState(false);
  const [detailIngredient, setDetailIngredient] = useState<Ingredient | null>(null);
  const [isVendorDetailOpen, setIsVendorDetailOpen] = useState(false);
  const [detailVendor, setDetailVendor] = useState<Vendor | null>(null);

  const openIngredientDetail = (ingredient: Ingredient) => {
    setDetailIngredient(ingredient);
    setIsIngredientDetailOpen(true);
  };

  const openVendorDetail = (vendor: Vendor) => {
    setDetailVendor(vendor);
    setIsVendorDetailOpen(true);
  };

  const [ingredientForm, setIngredientForm] = useState({
    name: "", unit: "lbs", currentStock: 0, parLevel: 0, reorderPoint: 0, cost: 0, vendorId: "",
  });

  const [vendorForm, setVendorForm] = useState({
    name: "", contactName: "", email: "", phone: "", address: "", paymentTerms: "", notes: "",
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    setLoadError('');

    try {
      const [ingredientsRes, vendorsRes] = await Promise.all([
        fetch("/api/inventory/ingredients"),
        fetch("/api/inventory/vendors"),
      ]);
      const [ingredientsData, vendorsData] = await Promise.all([
        readRecordArray<Ingredient>(ingredientsRes),
        readRecordArray<Vendor>(vendorsRes),
      ]);
      setIngredients(ingredientsData);
      setVendors(vendorsData);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load records. Retry loading.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveIngredient = async () => {
    const controller = mutation.start(); if (!controller) return;
    try {
      const url = editingIngredient
        ? `/api/inventory/ingredients/${editingIngredient.id}`
        : "/api/inventory/ingredients";
      const response = await fetch(url, {
        method: editingIngredient ? "PUT" : "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ingredientForm, vendorId: ingredientForm.vendorId || null }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save ingredient");
      }
      if (controller.signal.aborted) return;
      toast({ title: "Success", description: `Ingredient ${editingIngredient ? "updated" : "created"}` });
      setIsIngredientDialogOpen(false);
      setEditingIngredient(null);
      setIngredientForm({ name: "", unit: "lbs", currentStock: 0, parLevel: 0, reorderPoint: 0, cost: 0, vendorId: "" });
      fetchData();
    } catch (error) {
      if (!controller.signal.aborted) toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to save ingredient", variant: "destructive" });
    } finally {
      mutation.finish(controller); if (controller.signal.aborted) void fetchData();
    }
  };

  const handleDeleteIngredient = async (id: string) => {
    const controller = mutation.start(); if (!controller) return;
    try {
      const response = await fetch(`/api/inventory/ingredients/${id}`, { method: "DELETE", signal: controller.signal });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete ingredient");
      }
      if (controller.signal.aborted) return;
      setIsIngredientDetailOpen(false);
      toast({ title: "Success", description: "Ingredient deleted" });
      fetchData();
    } catch (error) {
      if (!controller.signal.aborted) toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to delete", variant: "destructive" });
    } finally {
      mutation.finish(controller); if (controller.signal.aborted) void fetchData();
    }
  };

  const handleSaveVendor = async () => {
    const controller = mutation.start(); if (!controller) return;
    try {
      const url = editingVendor ? `/api/inventory/vendors/${editingVendor.id}` : "/api/inventory/vendors";
      const response = await fetch(url, {
        method: editingVendor ? "PUT" : "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vendorForm),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save vendor");
      }
      if (controller.signal.aborted) return;
      toast({ title: "Success", description: `Vendor ${editingVendor ? "updated" : "created"}` });
      setIsVendorDialogOpen(false);
      setEditingVendor(null);
      setVendorForm({ name: "", contactName: "", email: "", phone: "", address: "", paymentTerms: "", notes: "" });
      fetchData();
    } catch (error) {
      if (!controller.signal.aborted) toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to save vendor", variant: "destructive" });
    } finally {
      mutation.finish(controller); if (controller.signal.aborted) void fetchData();
    }
  };

  const deleteVendor = async (vendor: Vendor) => {
    if (!window.confirm(`Delete vendor ${vendor.name}? Existing ingredient references may prevent deletion.`)) return;
    const controller = mutation.start(); if (!controller) return;
    try {
      const response = await fetch(`/api/inventory/vendors/${vendor.id}`, { method: "DELETE", signal: controller.signal });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Failed to delete vendor"); }
      if (controller.signal.aborted) return;
      setIsVendorDetailOpen(false);
      toast({ title: "Vendor deleted" });
      await fetchData();
    } catch (error) { if (!controller.signal.aborted) toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to delete vendor", variant: "destructive" }); }
    finally { mutation.finish(controller); if (controller.signal.aborted) void fetchData(); }
  };

  const openEditIngredient = (ing: Ingredient) => {
    setEditingIngredient(ing);
    setIngredientForm({
      name: ing.name, unit: ing.unit, currentStock: ing.currentStock, parLevel: ing.parLevel,
      reorderPoint: ing.reorderPoint, cost: ing.cost, vendorId: ing.vendorId || "",
    });
    setIsIngredientDialogOpen(true);
  };

  const lowStockItems = ingredients.filter((i) => i.currentStock <= i.reorderPoint);

  return (
    <div className="flex flex-col h-full">
      <Header title="Inventory" />
      <RecordLoadNotice error={loadError} busy={loading} onRetry={() => void fetchData()} />
      {mutation.notice && <p role="status">{mutation.notice}</p>}
      {mutation.busy && <Button type="button" variant="outline" onClick={mutation.cancel}>Cancel record request</Button>}
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {lowStockItems.length > 0 && (
          <Card className="border-yellow-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-yellow-600 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> Low Stock Alert
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {lowStockItems.map((item) => (
                  <Badge key={item.id} variant="warning" className="bg-yellow-100 text-yellow-800">
                    {item.name}: {item.currentStock} {item.unit}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="ingredients">
          <div className="flex justify-between items-center mb-4">
            <TabsList>
              <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
              <TabsTrigger value="vendors">Vendors</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="ingredients">
            <div className="flex justify-end mb-4">
              <Dialog open={isIngredientDialogOpen} onOpenChange={open => { if (!open) mutation.cancel(); setIsIngredientDialogOpen(open); }}>
                <DialogTrigger asChild>
                  <Button onClick={() => { setEditingIngredient(null); setIngredientForm({ name: "", unit: "lbs", currentStock: 0, parLevel: 0, reorderPoint: 0, cost: 0, vendorId: "" }); }}>
                    <Plus className="mr-2 h-4 w-4" /> Add Ingredient
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingIngredient ? "Edit" : "Add"} Ingredient</DialogTitle>
                  </DialogHeader>
                  <fieldset disabled={mutation.busy} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label>Name</Label>
                      <Input value={ingredientForm.name} onChange={(e) => setIngredientForm({ ...ingredientForm, name: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Unit</Label>
                        <Select value={ingredientForm.unit} onValueChange={(v) => setIngredientForm({ ...ingredientForm, unit: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                            <SelectItem value="kg">Kilograms (kg)</SelectItem>
                            <SelectItem value="oz">Ounces (oz)</SelectItem>
                            <SelectItem value="units">Units</SelectItem>
                            <SelectItem value="liters">Liters</SelectItem>
                            <SelectItem value="gallons">Gallons</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Cost per Unit</Label>
                        <Input type="number" step="0.01" value={ingredientForm.cost} onChange={(e) => setIngredientForm({ ...ingredientForm, cost: parseFloat(e.target.value) || 0 })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="grid gap-2">
                        <Label>Current Stock</Label>
                        <Input type="number" value={ingredientForm.currentStock} onChange={(e) => setIngredientForm({ ...ingredientForm, currentStock: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div className="grid gap-2">
                        <Label>Par Level</Label>
                        <Input type="number" value={ingredientForm.parLevel} onChange={(e) => setIngredientForm({ ...ingredientForm, parLevel: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div className="grid gap-2">
                        <Label>Reorder Point</Label>
                        <Input type="number" value={ingredientForm.reorderPoint} onChange={(e) => setIngredientForm({ ...ingredientForm, reorderPoint: parseFloat(e.target.value) || 0 })} />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Vendor</Label>
                      <Select value={ingredientForm.vendorId || "_none"} onValueChange={(v) => setIngredientForm({ ...ingredientForm, vendorId: v === "_none" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">None</SelectItem>
                          {vendors.map((v) => (<SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </fieldset>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { mutation.cancel(); setIsIngredientDialogOpen(false); }}>Cancel</Button>
                    <Button disabled={mutation.busy} onClick={handleSaveIngredient}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ingredient</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Par Level</TableHead>
                      <TableHead>Reorder Point</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ingredients.map((ing) => (
                      <TableRow
                        key={ing.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openIngredientDetail(ing)}
                      >
                        <TableCell className="font-medium">{ing.name}</TableCell>
                        <TableCell>{ing.currentStock} {ing.unit}</TableCell>
                        <TableCell>{ing.parLevel} {ing.unit}</TableCell>
                        <TableCell>{ing.reorderPoint} {ing.unit}</TableCell>
                        <TableCell>{formatCurrency(ing.cost)}/{ing.unit}</TableCell>
                        <TableCell>{ing.vendor?.name || "-"}</TableCell>
                        <TableCell>
                          {ing.currentStock <= ing.reorderPoint ? (
                            <Badge variant="destructive"><TrendingDown className="h-3 w-3 mr-1" />Low</Badge>
                          ) : ing.currentStock <= ing.parLevel ? (
                            <Badge variant="warning" className="bg-yellow-500">Below Par</Badge>
                          ) : (
                            <Badge variant="success">OK</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => openEditIngredient(ing)}><Edit className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteIngredient(ing.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {ingredients.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No ingredients found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vendors">
            <div className="flex justify-end mb-4">
              <Dialog open={isVendorDialogOpen} onOpenChange={open => { if (!open) mutation.cancel(); setIsVendorDialogOpen(open); }}>
                <DialogTrigger asChild>
                  <Button onClick={() => { setEditingVendor(null); setVendorForm({ name: "", contactName: "", email: "", phone: "", address: "", paymentTerms: "", notes: "" }); }}>
                    <Plus className="mr-2 h-4 w-4" /> Add Vendor
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editingVendor ? "Edit" : "Add"} Vendor</DialogTitle></DialogHeader>
                  <fieldset disabled={mutation.busy} className="grid gap-4 py-4">
                    <div className="grid gap-2"><Label>Company Name</Label><Input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} /></div>
                    <div className="grid gap-2"><Label>Contact Name</Label><Input value={vendorForm.contactName} onChange={(e) => setVendorForm({ ...vendorForm, contactName: e.target.value })} /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2"><Label>Email</Label><Input value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} /></div>
                      <div className="grid gap-2"><Label>Phone</Label><Input value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} /></div>
                    </div>
                    <div className="grid gap-2"><Label>Payment Terms</Label><Input value={vendorForm.paymentTerms} onChange={(e) => setVendorForm({ ...vendorForm, paymentTerms: e.target.value })} placeholder="Net 30" /></div>
                    <div className="grid gap-2"><Label>Address</Label><Input value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} /></div>
                    <div className="grid gap-2"><Label>Notes</Label><Textarea value={vendorForm.notes} onChange={(e) => setVendorForm({ ...vendorForm, notes: e.target.value })} /></div>
                  </fieldset>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { mutation.cancel(); setIsVendorDialogOpen(false); }}>Cancel</Button>
                    <Button disabled={mutation.busy} onClick={handleSaveVendor}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {vendors.map((vendor) => (
                <Card
                  key={vendor.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => openVendorDetail(vendor)}
                >
                  <CardHeader>
                    <CardTitle>{vendor.name}</CardTitle>
                    <CardDescription>{vendor.contactName}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{vendor.email}</p>
                    <p className="text-sm">{vendor.phone}</p>
                    <div className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setEditingVendor(vendor); setVendorForm({ name: vendor.name, contactName: vendor.contactName || "", email: vendor.email || "", phone: vendor.phone || "", address: vendor.address || "", paymentTerms: vendor.paymentTerms || "", notes: vendor.notes || "" }); setIsVendorDialogOpen(true); }}>Edit</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Ingredient Detail Dialog */}
        <Dialog open={isIngredientDetailOpen} onOpenChange={open => { if (!open) mutation.cancel(); setIsIngredientDetailOpen(open); }}>
          <DialogContent className="max-w-md">
            {detailIngredient && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    {detailIngredient.name}
                  </DialogTitle>
                  <div className="flex items-center gap-2">
                    {detailIngredient.currentStock <= detailIngredient.reorderPoint ? (
                      <Badge variant="destructive"><TrendingDown className="h-3 w-3 mr-1" />Low Stock</Badge>
                    ) : detailIngredient.currentStock <= detailIngredient.parLevel ? (
                      <Badge variant="warning" className="bg-yellow-500">Below Par</Badge>
                    ) : (
                      <Badge variant="success">Stock OK</Badge>
                    )}
                  </div>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Stock Levels */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Stock Levels</h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="text-lg font-bold">{detailIngredient.currentStock}</p>
                        <p className="text-xs text-muted-foreground">{detailIngredient.unit} Current</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="text-lg font-bold">{detailIngredient.parLevel}</p>
                        <p className="text-xs text-muted-foreground">{detailIngredient.unit} Par Level</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="text-lg font-bold">{detailIngredient.reorderPoint}</p>
                        <p className="text-xs text-muted-foreground">{detailIngredient.unit} Reorder</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Cost */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xl font-bold">{formatCurrency(detailIngredient.cost)}</p>
                      <p className="text-xs text-muted-foreground">per {detailIngredient.unit}</p>
                    </div>
                    {detailIngredient.vendor && (
                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="font-medium truncate">{detailIngredient.vendor.name}</p>
                        <p className="text-xs text-muted-foreground">Vendor</p>
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    disabled={mutation.busy}
                    onClick={() => { openEditIngredient(detailIngredient); setIsIngredientDetailOpen(false); }}
                    className="w-full"
                  >
                    <Edit className="mr-2 h-4 w-4" /> Edit Ingredient
                  </Button>
                  <Button type="button" disabled={mutation.busy} variant="destructive" onClick={() => { if (window.confirm(`Delete ingredient ${detailIngredient.name}?`)) void handleDeleteIngredient(detailIngredient.id); }}>Delete</Button>
                <Button type="button" variant="outline" onClick={() => { mutation.cancel(); setIsIngredientDetailOpen(false); }}>Cancel</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Vendor Detail Dialog */}
        <Dialog open={isVendorDetailOpen} onOpenChange={open => { if (!open) mutation.cancel(); setIsVendorDetailOpen(open); }}>
          <DialogContent className="max-w-md">
            {detailVendor && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {detailVendor.name}
                    {detailVendor.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {detailVendor.contactName || "Vendor details"}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Contact Information */}
                  <div className="grid grid-cols-2 gap-3">
                    {detailVendor.email && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="font-medium text-sm truncate">{detailVendor.email}</p>
                      </div>
                    )}
                    {detailVendor.phone && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="font-medium text-sm">{detailVendor.phone}</p>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Supplied Items */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Supplied Items</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {ingredients.filter(ing => ing.vendorId === detailVendor.id).map((ing) => (
                        <div key={ing.id} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                          <span className="text-sm">{ing.name}</span>
                          <span className="text-sm text-muted-foreground">{formatCurrency(ing.cost)}/{ing.unit}</span>
                        </div>
                      ))}
                      {ingredients.filter(ing => ing.vendorId === detailVendor.id).length === 0 && (
                        <p className="text-sm text-muted-foreground">No items from this vendor</p>
                      )}
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    disabled={mutation.busy}
                    onClick={() => {
                      setEditingVendor(detailVendor);
                      setVendorForm({
                        name: detailVendor.name,
                        contactName: detailVendor.contactName || "",
                        email: detailVendor.email || "",
                        phone: detailVendor.phone || "",
                        address: detailVendor.address || "",
                        paymentTerms: detailVendor.paymentTerms || "",
                        notes: detailVendor.notes || ""
                      });
                      setIsVendorDialogOpen(true);
                      setIsVendorDetailOpen(false);
                    }}
                    className="w-full"
                  >
                    <Edit className="mr-2 h-4 w-4" /> Edit Vendor
                  </Button>
                  <Button type="button" disabled={mutation.busy} variant="destructive" onClick={() => void deleteVendor(detailVendor)}>Delete</Button>
                <Button type="button" variant="outline" onClick={() => { mutation.cancel(); setIsVendorDetailOpen(false); }}>Cancel</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
