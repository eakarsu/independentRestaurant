"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/components/ui/use-toast";
import { Pagination } from "@/components/ui/pagination";
import { SortHeader } from "@/components/ui/sort-header";
import { SkeletonTable } from "@/components/ui/skeleton-table";
import { ConfirmationDialog, useConfirmation } from "@/components/ui/confirmation-dialog";
import { ErrorBoundary } from "@/components/error-boundary";
import { exportToPDF } from "@/lib/pdf-export";
import {
  Plus, Edit, Search, Star, Gift, Award, Trash2,
  FileDown, CheckSquare, X,
} from "lucide-react";

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
  createdAt: string;
  loyaltyPoints: { points: number; tier: string } | null;
  _count: { orders: number; reservations: number };
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

function CustomersPageContent() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Sort state
  const [sortBy, setSortBy] = useState("lastName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  // Confirmation dialog
  const { state: confirmState, confirm, close: closeConfirm } = useConfirmation();

  // Form validation
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "", address: "", birthday: "", notes: "", vipStatus: false,
    dietaryPrefs: [] as string[], allergens: [] as string[],
  });

  const openCustomerDetail = (customer: Customer) => {
    setDetailCustomer(customer);
    setIsDetailSheetOpen(true);
  };

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        sortBy,
        sortDirection,
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/customers?${params}`);
      const result = await res.json();

      if (result.data) {
        setCustomers(result.data);
        setTotalItems(result.pagination.totalItems);
        setTotalPages(result.pagination.totalPages);
      } else {
        // Fallback for non-paginated response
        const data = Array.isArray(result) ? result : [];
        setCustomers(data);
        setTotalItems(data.length);
        setTotalPages(1);
      }
    } catch {
      toast({ title: "Error", description: "Failed to load customers", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, sortBy, sortDirection, search]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchCustomers();
  };

  // Form validation
  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formData.firstName.trim()) {
      errors.firstName = "First name is required";
    } else if (formData.firstName.trim().length < 2) {
      errors.firstName = "First name must be at least 2 characters";
    }

    if (!formData.lastName.trim()) {
      errors.lastName = "Last name is required";
    } else if (formData.lastName.trim().length < 2) {
      errors.lastName = "Last name must be at least 2 characters";
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Please enter a valid email address";
    }

    if (formData.phone && !/^[\d\s\-()+ ]{7,20}$/.test(formData.phone)) {
      errors.phone = "Please enter a valid phone number";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast({ title: "Validation Error", description: "Please fix the form errors", variant: "destructive" });
      return;
    }

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
    } catch {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
  };

  const handleDelete = async (customerId: string, customerName: string) => {
    confirm({
      title: "Delete Customer",
      description: `Are you sure you want to delete ${customerName}? This action cannot be undone.`,
      variant: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/customers/${customerId}`, { method: "DELETE" });
          if (res.ok) {
            toast({ title: "Success", description: "Customer deleted" });
            fetchCustomers();
          } else {
            toast({ title: "Error", description: "Failed to delete customer", variant: "destructive" });
          }
        } catch {
          toast({ title: "Error", description: "Failed to delete customer", variant: "destructive" });
        }
        closeConfirm();
      },
    });
  };

  const resetForm = () => {
    setFormData({ firstName: "", lastName: "", email: "", phone: "", address: "", birthday: "", notes: "", vipStatus: false, dietaryPrefs: [], allergens: [] });
    setFormErrors({});
  };

  const openEdit = (c: Customer) => {
    setEditingCustomer(c);
    setFormData({
      firstName: c.firstName, lastName: c.lastName, email: c.email || "", phone: c.phone || "",
      address: "", birthday: "", notes: c.notes || "", vipStatus: c.vipStatus,
      dietaryPrefs: c.dietaryPrefs, allergens: c.allergens,
    });
    setFormErrors({});
    setIsDialogOpen(true);
  };

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
    if (selectedIds.size === customers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(customers.map((c) => c.id)));
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
      title: "Bulk Delete Customers",
      description: `Are you sure you want to delete ${selectedIds.size} customers? This action cannot be undone.`,
      variant: "danger",
      confirmLabel: `Delete ${selectedIds.size} customers`,
      onConfirm: async () => {
        try {
          const res = await fetch("/api/bulk", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: "customer", ids: Array.from(selectedIds) }),
          });
          if (res.ok) {
            const data = await res.json();
            toast({ title: "Success", description: `${data.deleted} customers deleted` });
            setSelectedIds(new Set());
            setBulkMode(false);
            fetchCustomers();
          }
        } catch {
          toast({ title: "Error", description: "Failed to bulk delete", variant: "destructive" });
        }
        closeConfirm();
      },
    });
  };

  // Bulk update VIP status
  const handleBulkUpdateVIP = async (vipStatus: boolean) => {
    confirm({
      title: vipStatus ? "Set as VIP" : "Remove VIP Status",
      description: `Update VIP status for ${selectedIds.size} customers?`,
      variant: "warning",
      confirmLabel: "Update",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/bulk", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: "customer", ids: Array.from(selectedIds), data: { vipStatus } }),
          });
          if (res.ok) {
            const data = await res.json();
            toast({ title: "Success", description: `${data.updated} customers updated` });
            setSelectedIds(new Set());
            setBulkMode(false);
            fetchCustomers();
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
      title: "Customer Report",
      subtitle: `${totalItems} customers | Generated from RestaurantAI`,
      filename: "customers-report.pdf",
      columns: [
        { header: "Name", field: "name", format: (v: unknown) => (v as string) || "" },
        { header: "Email", field: "email", format: (v: unknown) => (v as string) || "-" },
        { header: "Phone", field: "phone", format: (v: unknown) => (v as string) || "-" },
        { header: "VIP", field: "vipStatus", format: (v: unknown) => v ? "Yes" : "No" },
        { header: "Loyalty Tier", field: "tier" },
        { header: "Points", field: "points", format: (v: unknown) => (v as number)?.toString() || "0" },
        { header: "Orders", field: "orders", format: (v: unknown) => (v as number)?.toString() || "0" },
      ],
      data: customers.map((c) => ({
        name: `${c.firstName} ${c.lastName}`,
        email: c.email,
        phone: c.phone,
        vipStatus: c.vipStatus,
        tier: c.loyaltyPoints?.tier || "BRONZE",
        points: c.loyaltyPoints?.points || 0,
        orders: c._count.orders,
      })),
    });
    toast({ title: "Export Complete", description: "PDF has been downloaded" });
  };

  const getTierColor = (tier: string) => {
    const colors: Record<string, string> = { BRONZE: "text-amber-600", SILVER: "text-gray-400", GOLD: "text-yellow-500", PLATINUM: "text-purple-500" };
    return colors[tier] || "text-gray-500";
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Customer Management" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Customers</h2>
            <p className="text-muted-foreground">{totalItems} customers</p>
          </div>
          <div className="flex gap-2 items-center">
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
              <Button type="submit" variant="outline"><Search className="h-4 w-4" /></Button>
            </form>
            <Button variant="outline" size="sm" onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}>
              <CheckSquare className="mr-2 h-4 w-4" /> {bulkMode ? "Cancel" : "Select"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileDown className="mr-2 h-4 w-4" /> PDF
            </Button>
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
                    <div className="grid gap-2">
                      <Label>First Name *</Label>
                      <Input
                        value={formData.firstName}
                        onChange={(e) => { setFormData({ ...formData, firstName: e.target.value }); setFormErrors((prev) => ({ ...prev, firstName: undefined })); }}
                        className={formErrors.firstName ? "border-destructive" : ""}
                      />
                      {formErrors.firstName && <p className="text-xs text-destructive">{formErrors.firstName}</p>}
                    </div>
                    <div className="grid gap-2">
                      <Label>Last Name *</Label>
                      <Input
                        value={formData.lastName}
                        onChange={(e) => { setFormData({ ...formData, lastName: e.target.value }); setFormErrors((prev) => ({ ...prev, lastName: undefined })); }}
                        className={formErrors.lastName ? "border-destructive" : ""}
                      />
                      {formErrors.lastName && <p className="text-xs text-destructive">{formErrors.lastName}</p>}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setFormErrors((prev) => ({ ...prev, email: undefined })); }}
                      className={formErrors.email ? "border-destructive" : ""}
                    />
                    {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
                  </div>
                  <div className="grid gap-2">
                    <Label>Phone</Label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => { setFormData({ ...formData, phone: e.target.value }); setFormErrors((prev) => ({ ...prev, phone: undefined })); }}
                      className={formErrors.phone ? "border-destructive" : ""}
                    />
                    {formErrors.phone && <p className="text-xs text-destructive">{formErrors.phone}</p>}
                  </div>
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

        {/* Bulk Action Bar */}
        {bulkMode && selectedIds.size > 0 && (
          <Card className="border-primary">
            <CardContent className="p-3 flex items-center justify-between">
              <span className="text-sm font-medium">{selectedIds.size} customers selected</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleBulkUpdateVIP(true)}>
                  <Star className="mr-1 h-3 w-3" /> Set VIP
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkUpdateVIP(false)}>
                  <X className="mr-1 h-3 w-3" /> Remove VIP
                </Button>
                <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                  <Trash2 className="mr-1 h-3 w-3" /> Delete Selected
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <SkeletonTable rows={8} columns={6} />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {bulkMode && (
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedIds.size === customers.length && customers.length > 0}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                      )}
                      <TableHead>
                        <SortHeader label="Customer" field="lastName" currentSort={sortBy} currentDirection={sortDirection} onSort={handleSort} />
                      </TableHead>
                      <TableHead>
                        <SortHeader label="Contact" field="email" currentSort={sortBy} currentDirection={sortDirection} onSort={handleSort} />
                      </TableHead>
                      <TableHead>Loyalty</TableHead>
                      <TableHead>Visits</TableHead>
                      <TableHead>
                        <SortHeader label="Status" field="vipStatus" currentSort={sortBy} currentDirection={sortDirection} onSort={handleSort} />
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((c) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => !bulkMode && openCustomerDetail(c)}
                      >
                        {bulkMode && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(c.id)}
                              onCheckedChange={() => toggleSelect(c.id)}
                            />
                          </TableCell>
                        )}
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
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id, `${c.firstName} ${c.lastName}`)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {customers.length === 0 && (
                      <TableRow><TableCell colSpan={bulkMode ? 8 : 7} className="text-center py-8 text-muted-foreground">No customers found</TableCell></TableRow>
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

                  {detailCustomer.loyaltyPoints && (
                    <div className="p-3 bg-muted/50 rounded-lg flex items-center gap-3">
                      <Award className={`h-8 w-8 ${getTierColor(detailCustomer.loyaltyPoints.tier)}`} />
                      <div>
                        <p className="font-bold">{detailCustomer.loyaltyPoints.tier}</p>
                        <p className="text-sm text-muted-foreground">{detailCustomer.loyaltyPoints.points} points</p>
                      </div>
                    </div>
                  )}

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

                  {detailCustomer.notes && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm">{detailCustomer.notes}</p>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setIsDetailSheetOpen(false);
                      handleDelete(detailCustomer.id, `${detailCustomer.firstName} ${detailCustomer.lastName}`);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                  <Button
                    onClick={() => {
                      openEdit(detailCustomer);
                      setIsDetailSheetOpen(false);
                    }}
                    className="flex-1"
                  >
                    <Edit className="mr-2 h-4 w-4" /> Edit Customer
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

export default function CustomersPage() {
  return (
    <ErrorBoundary>
      <CustomersPageContent />
    </ErrorBoundary>
  );
}
