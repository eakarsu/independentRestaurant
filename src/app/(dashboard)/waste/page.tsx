"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { Trash2, Plus, TrendingDown, DollarSign, Package, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost: number;
}

interface WasteRecord {
  id: string;
  ingredientId: string;
  quantity: number;
  reason: string;
  cost: number;
  recordedBy: string | null;
  createdAt: string;
  ingredient: Ingredient;
}

const WASTE_REASONS = [
  "Expired",
  "Spoiled",
  "Overproduction",
  "Customer Return",
  "Preparation Error",
  "Contamination",
  "Equipment Failure",
  "Other",
];

export default function WastePage() {
  const [records, setRecords] = useState<WasteRecord[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [form, setForm] = useState({
    ingredientId: "",
    quantity: "",
    reason: "",
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [wasteRes, ingredientsRes] = await Promise.all([
        fetch("/api/waste"),
        fetch("/api/ingredients"),
      ]);
      const [wasteData, ingredientsData] = await Promise.all([
        wasteRes.json(),
        ingredientsRes.json(),
      ]);
      setRecords(Array.isArray(wasteData) ? wasteData : []);
      setIngredients(Array.isArray(ingredientsData) ? ingredientsData : []);
    } catch {
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.ingredientId || !form.quantity || !form.reason) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const ingredient = ingredients.find(i => i.id === form.ingredientId);
    if (!ingredient) return;

    try {
      const res = await fetch("/api/waste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredientId: form.ingredientId,
          quantity: parseFloat(form.quantity),
          reason: form.reason,
          cost: ingredient.cost * parseFloat(form.quantity),
        }),
      });

      if (res.ok) {
        toast({ title: "Success", description: "Waste recorded" });
        setIsDialogOpen(false);
        setForm({ ingredientId: "", quantity: "", reason: "", notes: "" });
        fetchData();
      }
    } catch {
      toast({ title: "Error", description: "Failed to record waste", variant: "destructive" });
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const todayRecords = records.filter(r => r.createdAt.split("T")[0] === today);
  const totalCostToday = todayRecords.reduce((sum, r) => sum + r.cost, 0);
  const totalCostAll = records.reduce((sum, r) => sum + r.cost, 0);
  const topWasteReason = WASTE_REASONS.reduce((top, reason) => {
    const count = records.filter(r => r.reason === reason).length;
    return count > top.count ? { reason, count } : top;
  }, { reason: "", count: 0 });

  const wasteByReason = WASTE_REASONS.map(reason => ({
    reason,
    count: records.filter(r => r.reason === reason).length,
    cost: records.filter(r => r.reason === reason).reduce((sum, r) => sum + r.cost, 0),
  })).filter(r => r.count > 0).sort((a, b) => b.cost - a.cost);

  return (
    <div className="flex flex-col h-full">
      <Header title="Waste Tracking" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Food Waste Tracking</h2>
            <p className="text-muted-foreground">Monitor and reduce food waste</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Record Waste</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Food Waste</DialogTitle>
                <DialogDescription>Log wasted ingredients for tracking</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Ingredient *</Label>
                  <Select value={form.ingredientId} onValueChange={(v) => setForm({ ...form, ingredientId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select ingredient" /></SelectTrigger>
                    <SelectContent>
                      {ingredients.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name} ({formatCurrency(i.cost)}/{i.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Quantity *</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      placeholder="0"
                      className="flex-1"
                    />
                    <span className="text-sm text-muted-foreground self-center">
                      {ingredients.find(i => i.id === form.ingredientId)?.unit || "units"}
                    </span>
                  </div>
                  {form.ingredientId && form.quantity && (
                    <p className="text-sm text-destructive">
                      Cost: {formatCurrency(
                        (ingredients.find(i => i.id === form.ingredientId)?.cost || 0) * parseFloat(form.quantity || "0")
                      )}
                    </p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label>Reason *</Label>
                  <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                    <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                    <SelectContent>
                      {WASTE_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit}>Record</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Waste Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{formatCurrency(totalCostToday)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Waste Cost</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalCostAll)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Records Today</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{todayRecords.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Waste Reason</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{topWasteReason.reason || "N/A"}</div>
            </CardContent>
          </Card>
        </div>

        {/* Waste by Reason */}
        <Card>
          <CardHeader>
            <CardTitle>Waste by Reason</CardTitle>
            <CardDescription>Breakdown of waste costs by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              {wasteByReason.map((item) => (
                <div key={item.reason} className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium">{item.reason}</p>
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(item.cost)}</p>
                  <p className="text-xs text-muted-foreground">{item.count} records</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Records */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Waste Records</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Ingredient</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.slice(0, 20).map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{new Date(record.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{record.ingredient.name}</TableCell>
                    <TableCell>{record.quantity} {record.ingredient.unit}</TableCell>
                    <TableCell><Badge variant="outline">{record.reason}</Badge></TableCell>
                    <TableCell className="text-destructive font-medium">{formatCurrency(record.cost)}</TableCell>
                  </TableRow>
                ))}
                {records.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No waste records
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
