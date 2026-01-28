"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/components/ui/use-toast";
import { Plus, Edit, Search, Star, Gift, Award } from "lucide-react";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  vipStatus: boolean;
  dietaryPrefs: string[];
  allergens: string[];
  notes: string | null;
  loyaltyPoints: { points: number; tier: string } | null;
  _count: { orders: number; reservations: number };
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  const openCustomerDetail = (customer: Customer) => {
    setDetailCustomer(customer);
    setIsDetailSheetOpen(true);
  };

  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "", address: "", birthday: "", notes: "", vipStatus: false,
    dietaryPrefs: [] as string[], allergens: [] as string[],
  });

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async (searchTerm = "") => {
    setLoading(true);
    try {
      const url = searchTerm ? `/api/customers?search=${encodeURIComponent(searchTerm)}` : "/api/customers";
      const res = await fetch(url);
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load customers", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCustomers(search);
  };

  const handleSave = async () => {
    try {
      const url = editingCustomer ? `/api/customers/${editingCustomer.id}` : "/api/customers";
      const res = await fetch(url, {
        method: editingCustomer ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast({ title: "Success", description: `Customer ${editingCustomer ? "updated" : "created"}` });
        setIsDialogOpen(false);
        setEditingCustomer(null);
        resetForm();
        fetchCustomers();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({ firstName: "", lastName: "", email: "", phone: "", address: "", birthday: "", notes: "", vipStatus: false, dietaryPrefs: [], allergens: [] });
  };

  const openEdit = (c: Customer) => {
    setEditingCustomer(c);
    setFormData({
      firstName: c.firstName, lastName: c.lastName, email: c.email || "", phone: c.phone || "",
      address: "", birthday: "", notes: c.notes || "", vipStatus: c.vipStatus,
      dietaryPrefs: c.dietaryPrefs, allergens: c.allergens,
    });
    setIsDialogOpen(true);
  };

  const getTierColor = (tier: string) => {
    const colors: Record<string, string> = { BRONZE: "text-amber-600", SILVER: "text-gray-400", GOLD: "text-yellow-500", PLATINUM: "text-purple-500" };
    return colors[tier] || "text-gray-500";
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Customer Management" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Customers</h2>
            <p className="text-muted-foreground">{customers.length} customers</p>
          </div>
          <div className="flex gap-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
              <Button type="submit" variant="outline"><Search className="h-4 w-4" /></Button>
            </form>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingCustomer(null); resetForm(); }}>
                  <Plus className="mr-2 h-4 w-4" /> Add Customer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingCustomer ? "Edit" : "Add"} Customer</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2"><Label>First Name</Label><Input value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} /></div>
                    <div className="grid gap-2"><Label>Last Name</Label><Input value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} /></div>
                  </div>
                  <div className="grid gap-2"><Label>Email</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
                  <div className="grid gap-2"><Label>Phone</Label><Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} /></div>
                  <div className="grid gap-2"><Label>Birthday</Label><Input type="date" value={formData.birthday} onChange={(e) => setFormData({ ...formData, birthday: e.target.value })} /></div>
                  <div className="grid gap-2"><Label>Notes</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
                  <div className="flex items-center gap-2">
                    <Switch checked={formData.vipStatus} onCheckedChange={(c) => setFormData({ ...formData, vipStatus: c })} />
                    <Label>VIP Status</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSave}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Loyalty</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openCustomerDetail(c)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{c.firstName[0]}{c.lastName[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            {c.firstName} {c.lastName}
                            {c.vipStatus && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                          </p>
                          {c.allergens.length > 0 && (
                            <p className="text-xs text-red-500">Allergies: {c.allergens.join(", ")}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{c.email}</p>
                      <p className="text-sm text-muted-foreground">{c.phone}</p>
                    </TableCell>
                    <TableCell>
                      {c.loyaltyPoints && (
                        <div className="flex items-center gap-2">
                          <Award className={`h-4 w-4 ${getTierColor(c.loyaltyPoints.tier)}`} />
                          <span>{c.loyaltyPoints.points} pts</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <p>{c._count.orders} orders</p>
                      <p className="text-sm text-muted-foreground">{c._count.reservations} reservations</p>
                    </TableCell>
                    <TableCell>
                      {c.vipStatus ? <Badge className="bg-yellow-500">VIP</Badge> : <Badge variant="outline">Regular</Badge>}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Edit className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {customers.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No customers found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Customer Detail Dialog */}
        <Dialog open={isDetailSheetOpen} onOpenChange={setIsDetailSheetOpen}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            {detailCustomer && (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="text-lg">{detailCustomer.firstName[0]}{detailCustomer.lastName[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <DialogTitle className="flex items-center gap-2">
                        {detailCustomer.firstName} {detailCustomer.lastName}
                        {detailCustomer.vipStatus && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                      </DialogTitle>
                      <DialogDescription>
                        {detailCustomer.vipStatus ? "VIP Customer" : "Regular Customer"}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Contact & Loyalty */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium text-sm truncate">{detailCustomer.email || "-"}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="font-medium text-sm">{detailCustomer.phone || "-"}</p>
                    </div>
                  </div>

                  {/* Loyalty Program */}
                  {detailCustomer.loyaltyPoints && (
                    <div className="p-3 bg-muted/50 rounded-lg flex items-center gap-3">
                      <Award className={`h-8 w-8 ${getTierColor(detailCustomer.loyaltyPoints.tier)}`} />
                      <div>
                        <p className="font-bold">{detailCustomer.loyaltyPoints.tier}</p>
                        <p className="text-sm text-muted-foreground">{detailCustomer.loyaltyPoints.points} points</p>
                      </div>
                    </div>
                  )}

                  {/* Visit History */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-2xl font-bold">{detailCustomer._count.orders}</p>
                      <p className="text-xs text-muted-foreground">Orders</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-2xl font-bold">{detailCustomer._count.reservations}</p>
                      <p className="text-xs text-muted-foreground">Reservations</p>
                    </div>
                  </div>

                  {/* Dietary Information */}
                  {(detailCustomer.allergens.length > 0 || detailCustomer.dietaryPrefs.length > 0) && (
                    <div className="space-y-2">
                      {detailCustomer.allergens.length > 0 && (
                        <div>
                          <p className="text-xs text-red-500 font-medium mb-1">Allergies</p>
                          <div className="flex flex-wrap gap-1">
                            {detailCustomer.allergens.map((allergen, i) => (
                              <Badge key={i} variant="destructive" className="text-xs">{allergen}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {detailCustomer.dietaryPrefs.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">Preferences</p>
                          <div className="flex flex-wrap gap-1">
                            {detailCustomer.dietaryPrefs.map((pref, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{pref}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {detailCustomer.notes && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm">{detailCustomer.notes}</p>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    onClick={() => {
                      openEdit(detailCustomer);
                      setIsDetailSheetOpen(false);
                    }}
                    className="w-full"
                  >
                    <Edit className="mr-2 h-4 w-4" /> Edit Customer
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
