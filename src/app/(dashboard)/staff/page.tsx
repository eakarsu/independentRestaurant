"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  Plus, Edit, Clock, Calendar, Trash2,
  FileDown, CheckSquare, X, Search,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  position: string;
  hourlyRate: number;
  status: string;
  hireDate: string;
  user: { email: string; role: string };
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

function StaffPageContent() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailStaff, setDetailStaff] = useState<Staff | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Sort state
  const [sortBy, setSortBy] = useState("firstName");
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

  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "", position: "Server", hourlyRate: 15, role: "STAFF", password: "password123",
  });

  const openStaffDetail = (s: Staff) => {
    setDetailStaff(s);
    setIsDetailOpen(true);
  };

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        sortBy,
        sortDirection,
      });

      const res = await fetch(`/api/staff?${params}`);
      const result = await res.json();

      if (result.data) {
        setStaff(result.data);
        setTotalItems(result.pagination.totalItems);
        setTotalPages(result.pagination.totalPages);
      } else {
        const data = Array.isArray(result) ? result : [];
        setStaff(data);
        setTotalItems(data.length);
        setTotalPages(1);
      }
    } catch {
      toast({ title: "Error", description: "Failed to load staff", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, sortBy, sortDirection]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

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

    if (!formData.email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
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
      const url = editingStaff ? `/api/staff/${editingStaff.id}` : "/api/staff";
      const res = await fetch(url, {
        method: editingStaff ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast({ title: "Success", description: `Staff member ${editingStaff ? "updated" : "created"}` });
        setIsDialogOpen(false);
        setEditingStaff(null);
        resetForm();
        fetchStaff();
      }
    } catch {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
  };

  const handleDelete = async (staffId: string, staffName: string) => {
    confirm({
      title: "Delete Staff Member",
      description: `Are you sure you want to delete ${staffName}? This action cannot be undone.`,
      variant: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/staff/${staffId}`, { method: "DELETE" });
          if (res.ok) {
            toast({ title: "Success", description: "Staff member deleted" });
            fetchStaff();
          } else {
            toast({ title: "Error", description: "Failed to delete staff member", variant: "destructive" });
          }
        } catch {
          toast({ title: "Error", description: "Failed to delete staff member", variant: "destructive" });
        }
        closeConfirm();
      },
    });
  };

  const handleClockIn = async (staffId: string) => {
    try {
      await fetch(`/api/staff/${staffId}/timeclock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clockIn" }),
      });
      toast({ title: "Success", description: "Clocked in successfully" });
    } catch {
      toast({ title: "Error", description: "Failed to clock in", variant: "destructive" });
    }
  };

  const handleClockOut = async (staffId: string) => {
    try {
      await fetch(`/api/staff/${staffId}/timeclock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clockOut" }),
      });
      toast({ title: "Success", description: "Clocked out successfully" });
    } catch {
      toast({ title: "Error", description: "Failed to clock out", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({ firstName: "", lastName: "", email: "", phone: "", position: "Server", hourlyRate: 15, role: "STAFF", password: "password123" });
    setFormErrors({});
  };

  const openEdit = (s: Staff) => {
    setEditingStaff(s);
    setFormData({
      firstName: s.firstName, lastName: s.lastName, email: s.user.email, phone: s.phone || "",
      position: s.position, hourlyRate: s.hourlyRate, role: s.user.role, password: "",
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
    if (selectedIds.size === staff.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(staff.map((s) => s.id)));
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
      title: "Bulk Delete Staff",
      description: `Are you sure you want to delete ${selectedIds.size} staff members? This action cannot be undone.`,
      variant: "danger",
      confirmLabel: `Delete ${selectedIds.size} staff`,
      onConfirm: async () => {
        try {
          const res = await fetch("/api/bulk", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: "staff", ids: Array.from(selectedIds) }),
          });
          if (res.ok) {
            const data = await res.json();
            toast({ title: "Success", description: `${data.deleted} staff members deleted` });
            setSelectedIds(new Set());
            setBulkMode(false);
            fetchStaff();
          }
        } catch {
          toast({ title: "Error", description: "Failed to bulk delete", variant: "destructive" });
        }
        closeConfirm();
      },
    });
  };

  // Bulk update status
  const handleBulkUpdateStatus = (status: string) => {
    confirm({
      title: `Set Status to ${status}`,
      description: `Update status for ${selectedIds.size} staff members?`,
      variant: "warning",
      confirmLabel: "Update",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/bulk", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: "staff", ids: Array.from(selectedIds), data: { status } }),
          });
          if (res.ok) {
            const data = await res.json();
            toast({ title: "Success", description: `${data.updated} staff members updated` });
            setSelectedIds(new Set());
            setBulkMode(false);
            fetchStaff();
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
      title: "Staff Report",
      subtitle: `${totalItems} staff members | Generated from RestaurantAI`,
      filename: "staff-report.pdf",
      columns: [
        { header: "Name", field: "name" },
        { header: "Position", field: "position" },
        { header: "Email", field: "email" },
        { header: "Phone", field: "phone", format: (v: unknown) => (v as string) || "-" },
        { header: "Hourly Rate", field: "hourlyRate", format: (v: unknown) => `$${(v as number).toFixed(2)}` },
        { header: "Status", field: "status" },
        { header: "Role", field: "role" },
      ],
      data: staff.map((s) => ({
        name: `${s.firstName} ${s.lastName}`,
        position: s.position,
        email: s.user.email,
        phone: s.phone,
        hourlyRate: s.hourlyRate,
        status: s.status,
        role: s.user.role,
      })),
    });
    toast({ title: "Export Complete", description: "PDF has been downloaded" });
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "success" | "secondary" | "destructive"; label: string }> = {
      ACTIVE: { variant: "success", label: "Active" },
      INACTIVE: { variant: "secondary", label: "Inactive" },
      ON_LEAVE: { variant: "default", label: "On Leave" },
      TERMINATED: { variant: "destructive", label: "Terminated" },
    };
    const c = config[status] || { variant: "secondary" as const, label: status };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const filteredStaff = search
    ? staff.filter((s) =>
        `${s.firstName} ${s.lastName} ${s.user.email} ${s.position}`.toLowerCase().includes(search.toLowerCase())
      )
    : staff;

  return (
    <div className="flex flex-col h-full">
      <Header title="Staff Management" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Staff Directory</h2>
            <p className="text-muted-foreground">{totalItems} team members</p>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex gap-2">
              <Input placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
            </div>
            <Button variant="outline" size="sm" onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}>
              <CheckSquare className="mr-2 h-4 w-4" /> {bulkMode ? "Cancel" : "Select"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileDown className="mr-2 h-4 w-4" /> PDF
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingStaff(null); resetForm(); }}>
                  <Plus className="mr-2 h-4 w-4" /> Add Staff Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingStaff ? "Edit" : "Add"} Staff Member</DialogTitle></DialogHeader>
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
                    <Label>Email *</Label>
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Position</Label>
                      <Select value={formData.position} onValueChange={(v) => setFormData({ ...formData, position: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Server">Server</SelectItem>
                          <SelectItem value="Host">Host</SelectItem>
                          <SelectItem value="Bartender">Bartender</SelectItem>
                          <SelectItem value="Chef">Chef</SelectItem>
                          <SelectItem value="Line Cook">Line Cook</SelectItem>
                          <SelectItem value="Dishwasher">Dishwasher</SelectItem>
                          <SelectItem value="Manager">Manager</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2"><Label>Hourly Rate</Label><Input type="number" step="0.5" value={formData.hourlyRate} onChange={(e) => setFormData({ ...formData, hourlyRate: parseFloat(e.target.value) || 0 })} /></div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Role</Label>
                    <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STAFF">Staff</SelectItem>
                        <SelectItem value="HOST">Host</SelectItem>
                        <SelectItem value="CHEF">Chef</SelectItem>
                        <SelectItem value="MANAGER">Manager</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!editingStaff && (
                    <div className="grid gap-2"><Label>Initial Password</Label><Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} /></div>
                  )}
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
              <span className="text-sm font-medium">{selectedIds.size} staff members selected</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleBulkUpdateStatus("ACTIVE")}>
                  Set Active
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkUpdateStatus("INACTIVE")}>
                  Set Inactive
                </Button>
                <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                  <Trash2 className="mr-1 h-3 w-3" /> Delete Selected
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="directory">
          <TabsList>
            <TabsTrigger value="directory">Directory</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="timeclock">Time Clock</TabsTrigger>
          </TabsList>

          <TabsContent value="directory">
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
                                checked={selectedIds.size === filteredStaff.length && filteredStaff.length > 0}
                                onCheckedChange={toggleSelectAll}
                              />
                            </TableHead>
                          )}
                          <TableHead>
                            <SortHeader label="Name" field="firstName" currentSort={sortBy} currentDirection={sortDirection} onSort={handleSort} />
                          </TableHead>
                          <TableHead>
                            <SortHeader label="Position" field="position" currentSort={sortBy} currentDirection={sortDirection} onSort={handleSort} />
                          </TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>
                            <SortHeader label="Rate" field="hourlyRate" currentSort={sortBy} currentDirection={sortDirection} onSort={handleSort} />
                          </TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStaff.map((s) => (
                          <TableRow
                            key={s.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => !bulkMode && openStaffDetail(s)}
                          >
                            {bulkMode && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedIds.has(s.id)}
                                  onCheckedChange={() => toggleSelect(s.id)}
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar>
                                  <AvatarFallback>{s.firstName[0]}{s.lastName[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium">{s.firstName} {s.lastName}</p>
                                  <p className="text-xs text-muted-foreground capitalize">{s.user.role.toLowerCase()}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{s.position}</TableCell>
                            <TableCell className="text-sm">{s.user.email}</TableCell>
                            <TableCell className="text-sm">{s.phone || "-"}</TableCell>
                            <TableCell className="font-medium">{formatCurrency(s.hourlyRate)}/hr</TableCell>
                            <TableCell>{getStatusBadge(s.status)}</TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id, `${s.firstName} ${s.lastName}`)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredStaff.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={bulkMode ? 9 : 8} className="text-center py-8 text-muted-foreground">
                              No staff members found
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

          <TabsContent value="schedule">
            <Card>
              <CardHeader>
                <CardTitle>Weekly Schedule</CardTitle>
                <CardDescription>Manage staff schedules</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Schedule management coming soon</p>
                  <p className="text-sm">Use the AI Staff Scheduler for optimal scheduling suggestions</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeclock">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.filter((s) => s.status === "ACTIVE").map((s) => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openStaffDetail(s)}
                      >
                        <TableCell className="font-medium">{s.firstName} {s.lastName}</TableCell>
                        <TableCell>{s.position}</TableCell>
                        <TableCell><Badge variant="outline">Available</Badge></TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" className="mr-2" onClick={() => handleClockIn(s.id)}>
                            <Clock className="h-3 w-3 mr-1" /> Clock In
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleClockOut(s.id)}>Clock Out</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Staff Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-md">
            {detailStaff && (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14">
                      <AvatarFallback className="text-lg">{detailStaff.firstName[0]}{detailStaff.lastName[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <DialogTitle>{detailStaff.firstName} {detailStaff.lastName}</DialogTitle>
                      <DialogDescription className="flex items-center gap-2">
                        {detailStaff.position} {getStatusBadge(detailStaff.status)}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium text-sm truncate">{detailStaff.user.email}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="font-medium text-sm">{detailStaff.phone || "-"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xl font-bold">{formatCurrency(detailStaff.hourlyRate)}</p>
                      <p className="text-xs text-muted-foreground">per hour</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xl font-bold capitalize">{detailStaff.user.role.toLowerCase()}</p>
                      <p className="text-xs text-muted-foreground">Role</p>
                    </div>
                  </div>

                  {detailStaff.status === "ACTIVE" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => { handleClockIn(detailStaff.id); setIsDetailOpen(false); }}
                        className="flex-1"
                      >
                        <Clock className="mr-2 h-4 w-4" /> Clock In
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { handleClockOut(detailStaff.id); setIsDetailOpen(false); }}
                        className="flex-1"
                      >
                        Clock Out
                      </Button>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setIsDetailOpen(false);
                      handleDelete(detailStaff.id, `${detailStaff.firstName} ${detailStaff.lastName}`);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                  <Button
                    onClick={() => { openEdit(detailStaff); setIsDetailOpen(false); }}
                    className="flex-1"
                  >
                    <Edit className="mr-2 h-4 w-4" /> Edit Staff Member
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

export default function StaffPage() {
  return (
    <ErrorBoundary>
      <StaffPageContent />
    </ErrorBoundary>
  );
}
