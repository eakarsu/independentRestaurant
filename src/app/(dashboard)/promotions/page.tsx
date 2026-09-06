"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { Plus, Percent, Tag, Clock, Gift, Trash2, Edit, Copy } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Promotion {
  id: string;
  name: string;
  description: string | null;
  code: string | null;
  type: string;
  value: number;
  minOrderAmount: number | null;
  maxDiscount: number | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  usageLimit: number | null;
  usageCount: number;
  applicableTo: string[];
  dayOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [detailPromotion, setDetailPromotion] = useState<Promotion | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    code: "",
    type: "PERCENTAGE",
    value: 10,
    minOrderAmount: "",
    maxDiscount: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    usageLimit: "",
    dayOfWeek: [] as number[],
    startTime: "",
    endTime: "",
  });

  useEffect(() => {
    fetchPromotions();
  }, []);

  const fetchPromotions = async () => {
    try {
      const res = await fetch("/api/promotions");
      const data = await res.json();
      setPromotions(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Error", description: "Failed to load promotions", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      code: "",
      type: "PERCENTAGE",
      value: 10,
      minOrderAmount: "",
      maxDiscount: "",
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      usageLimit: "",
      dayOfWeek: [],
      startTime: "",
      endTime: "",
    });
    setEditingPromotion(null);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.value) {
      toast({ title: "Error", description: "Name and value are required", variant: "destructive" });
      return;
    }

    try {
      const url = editingPromotion
        ? `/api/promotions/${editingPromotion.id}`
        : "/api/promotions";
      const method = editingPromotion ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          code: form.code || null,
          minOrderAmount: form.minOrderAmount ? parseFloat(form.minOrderAmount) : null,
          maxDiscount: form.maxDiscount ? parseFloat(form.maxDiscount) : null,
          usageLimit: form.usageLimit ? parseInt(form.usageLimit) : null,
        }),
      });

      if (res.ok) {
        toast({ title: "Success", description: `Promotion ${editingPromotion ? "updated" : "created"}` });
        setIsDialogOpen(false);
        resetForm();
        fetchPromotions();
      } else {
        throw new Error();
      }
    } catch {
      toast({ title: "Error", description: "Failed to save promotion", variant: "destructive" });
    }
  };

  const handleToggleActive = async (promo: Promotion) => {
    try {
      await fetch(`/api/promotions/${promo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !promo.isActive }),
      });
      fetchPromotions();
    } catch {
      toast({ title: "Error", description: "Failed to update promotion", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this promotion?")) return;
    try {
      await fetch(`/api/promotions/${id}`, { method: "DELETE" });
      toast({ title: "Success", description: "Promotion deleted" });
      fetchPromotions();
    } catch {
      toast({ title: "Error", description: "Failed to delete promotion", variant: "destructive" });
    }
  };

  const openEdit = (promo: Promotion) => {
    setEditingPromotion(promo);
    setForm({
      name: promo.name,
      description: promo.description || "",
      code: promo.code || "",
      type: promo.type,
      value: promo.value,
      minOrderAmount: promo.minOrderAmount?.toString() || "",
      maxDiscount: promo.maxDiscount?.toString() || "",
      startDate: new Date(promo.startDate).toISOString().split("T")[0],
      endDate: new Date(promo.endDate).toISOString().split("T")[0],
      usageLimit: promo.usageLimit?.toString() || "",
      dayOfWeek: promo.dayOfWeek,
      startTime: promo.startTime || "",
      endTime: promo.endTime || "",
    });
    setIsDialogOpen(true);
  };

  const openDetail = (promo: Promotion) => {
    setDetailPromotion(promo);
    setIsDetailOpen(true);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "PERCENTAGE": return <Percent className="h-4 w-4" />;
      case "FIXED_AMOUNT": return <Tag className="h-4 w-4" />;
      case "HAPPY_HOUR": return <Clock className="h-4 w-4" />;
      case "BUY_ONE_GET_ONE": return <Gift className="h-4 w-4" />;
      default: return <Tag className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "PERCENTAGE": return "Percentage Off";
      case "FIXED_AMOUNT": return "Fixed Amount";
      case "HAPPY_HOUR": return "Happy Hour";
      case "BUY_ONE_GET_ONE": return "BOGO";
      case "FREE_ITEM": return "Free Item";
      default: return type;
    }
  };

  const isExpired = (endDate: string) => new Date(endDate) < new Date();
  const isUpcoming = (startDate: string) => new Date(startDate) > new Date();

  const activePromotions = promotions.filter(p => p.isActive && !isExpired(p.endDate));
  const inactivePromotions = promotions.filter(p => !p.isActive || isExpired(p.endDate));

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied", description: "Promo code copied to clipboard" });
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Promotions & Discounts" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Promotions</h2>
            <p className="text-muted-foreground">Manage discounts and special offers</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New Promotion</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingPromotion ? "Edit Promotion" : "Create Promotion"}</DialogTitle>
                <DialogDescription>Set up a new discount or special offer</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Promotion Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Summer Sale" />
                </div>

                <div className="grid gap-2">
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Get 20% off all orders" />
                </div>

                <div className="grid gap-2">
                  <Label>Promo Code (optional)</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SUMMER20" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERCENTAGE">Percentage Off</SelectItem>
                        <SelectItem value="FIXED_AMOUNT">Fixed Amount</SelectItem>
                        <SelectItem value="HAPPY_HOUR">Happy Hour</SelectItem>
                        <SelectItem value="BUY_ONE_GET_ONE">Buy One Get One</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Value *</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={form.value}
                        onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {form.type === "FIXED_AMOUNT" ? "$" : "%"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Min Order Amount</Label>
                    <Input type="number" value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} placeholder="$0.00" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Max Discount</Label>
                    <Input type="number" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} placeholder="No limit" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>End Date</Label>
                    <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                  </div>
                </div>

                {form.type === "HAPPY_HOUR" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Start Time</Label>
                      <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                    </div>
                    <div className="grid gap-2">
                      <Label>End Time</Label>
                      <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                    </div>
                  </div>
                )}

                <div className="grid gap-2">
                  <Label>Usage Limit</Label>
                  <Input type="number" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} placeholder="Unlimited" />
                </div>

                <div className="grid gap-2">
                  <Label>Valid Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day, i) => (
                      <Button
                        key={day}
                        type="button"
                        variant={form.dayOfWeek.includes(i) ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setForm({
                            ...form,
                            dayOfWeek: form.dayOfWeek.includes(i)
                              ? form.dayOfWeek.filter(d => d !== i)
                              : [...form.dayOfWeek, i],
                          });
                        }}
                      >
                        {day}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Leave empty for all days</p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
                <Button onClick={handleSubmit}>{editingPromotion ? "Update" : "Create"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All ({promotions.length})</TabsTrigger>
            <TabsTrigger value="active">Active ({activePromotions.length})</TabsTrigger>
            <TabsTrigger value="inactive">Inactive ({inactivePromotions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activePromotions.map((promo) => (
                <Card key={promo.id} className="cursor-pointer hover:shadow-md" onClick={() => openDetail(promo)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(promo.type)}
                        <CardTitle className="text-lg">{promo.name}</CardTitle>
                      </div>
                      <Switch
                        checked={promo.isActive}
                        onClick={(e) => { e.stopPropagation(); handleToggleActive(promo); }}
                      />
                    </div>
                    <CardDescription>{promo.description}</CardDescription>
                  </CardHeader>
                  <CardContent onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold">
                          {promo.type === "FIXED_AMOUNT" ? formatCurrency(promo.value) : `${promo.value}%`}
                        </span>
                        <Badge variant="secondary">{getTypeLabel(promo.type)}</Badge>
                      </div>
                      {promo.code && (
                        <div className="flex items-center gap-2">
                          <code className="bg-muted px-2 py-1 rounded text-sm font-mono">{promo.code}</code>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyCode(promo.code!)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {new Date(promo.startDate).toLocaleDateString()} - {new Date(promo.endDate).toLocaleDateString()}
                      </div>
                      {promo.usageLimit && (
                        <div className="text-xs text-muted-foreground">
                          Used: {promo.usageCount} / {promo.usageLimit}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" onClick={() => openEdit(promo)}>
                        <Edit className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(promo.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {activePromotions.length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No active promotions
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="all">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promotions.map((promo) => (
                      <TableRow key={promo.id} className="cursor-pointer" onClick={() => openDetail(promo)}>
                        <TableCell className="font-medium">{promo.name}</TableCell>
                        <TableCell>{getTypeLabel(promo.type)}</TableCell>
                        <TableCell>
                          {promo.type === "FIXED_AMOUNT" ? formatCurrency(promo.value) : `${promo.value}%`}
                        </TableCell>
                        <TableCell>{promo.code || "-"}</TableCell>
                        <TableCell>
                          {isExpired(promo.endDate) ? (
                            <Badge variant="destructive">Expired</Badge>
                          ) : (
                            <Badge variant="secondary">{promo.isActive ? "Active" : "Inactive"}</Badge>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(promo)}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(promo.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {promotions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No promotions
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inactive">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inactivePromotions.map((promo) => (
                      <TableRow key={promo.id} className="cursor-pointer" onClick={() => openDetail(promo)}>
                        <TableCell className="font-medium">{promo.name}</TableCell>
                        <TableCell>{getTypeLabel(promo.type)}</TableCell>
                        <TableCell>
                          {promo.type === "FIXED_AMOUNT" ? formatCurrency(promo.value) : `${promo.value}%`}
                        </TableCell>
                        <TableCell>{promo.code || "-"}</TableCell>
                        <TableCell>
                          {isExpired(promo.endDate) ? (
                            <Badge variant="destructive">Expired</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(promo)}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(promo.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {inactivePromotions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No inactive promotions
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Promotion Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-md">
            {detailPromotion && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {getTypeIcon(detailPromotion.type)}
                    {detailPromotion.name}
                  </DialogTitle>
                  <DialogDescription>{detailPromotion.description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <p className="text-3xl font-bold">
                      {detailPromotion.type === "FIXED_AMOUNT" ? formatCurrency(detailPromotion.value) : `${detailPromotion.value}%`}
                    </p>
                    <p className="text-sm text-muted-foreground">{getTypeLabel(detailPromotion.type)}</p>
                  </div>

                  {detailPromotion.code && (
                    <div className="flex items-center justify-center gap-2">
                      <code className="bg-muted px-4 py-2 rounded text-lg font-mono">{detailPromotion.code}</code>
                      <Button variant="outline" size="icon" onClick={() => copyCode(detailPromotion.code!)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-muted-foreground">Valid From</p>
                      <p className="font-medium">{new Date(detailPromotion.startDate).toLocaleDateString()}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-muted-foreground">Valid Until</p>
                      <p className="font-medium">{new Date(detailPromotion.endDate).toLocaleDateString()}</p>
                    </div>
                    {detailPromotion.minOrderAmount && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-muted-foreground">Min Order</p>
                        <p className="font-medium">{formatCurrency(detailPromotion.minOrderAmount)}</p>
                      </div>
                    )}
                    {detailPromotion.usageLimit && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-muted-foreground">Usage</p>
                        <p className="font-medium">{detailPromotion.usageCount} / {detailPromotion.usageLimit}</p>
                      </div>
                    )}
                  </div>

                  {detailPromotion.dayOfWeek.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Valid Days</p>
                      <div className="flex gap-1">
                        {DAYS.map((day, i) => (
                          <Badge key={day} variant={detailPromotion.dayOfWeek.includes(i) ? "default" : "outline"}>
                            {day}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {detailPromotion.startTime && detailPromotion.endTime && (
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-muted-foreground text-sm">Valid Hours</p>
                      <p className="font-medium">{detailPromotion.startTime} - {detailPromotion.endTime}</p>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => { setIsDetailOpen(false); openEdit(detailPromotion); }}>
                    <Edit className="mr-2 h-4 w-4" /> Edit
                  </Button>
                  <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
