"use client";

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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/components/ui/use-toast";
import { Plus, Edit, Clock, Calendar } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  position: string;
  hourlyRate: number;
  status: string;
  user: { email: string; role: string };
}

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  // Detail sheet state
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailStaff, setDetailStaff] = useState<Staff | null>(null);

  const openStaffDetail = (s: Staff) => {
    setDetailStaff(s);
    setIsDetailOpen(true);
  };

  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "", position: "Server", hourlyRate: 15, role: "STAFF", password: "password123",
  });

  useEffect(() => { fetchStaff(); }, []);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/staff");
      const data = await res.json();
      setStaff(Array.isArray(data) ? data : []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load staff", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
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
    } catch (error) {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
  };

  const handleClockIn = async (staffId: string) => {
    try {
      await fetch(`/api/staff/${staffId}/timeclock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clockIn" }),
      });
      toast({ title: "Success", description: "Clocked in successfully" });
    } catch (error) {
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
    } catch (error) {
      toast({ title: "Error", description: "Failed to clock out", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({ firstName: "", lastName: "", email: "", phone: "", position: "Server", hourlyRate: 15, role: "STAFF", password: "password123" });
  };

  const openEdit = (s: Staff) => {
    setEditingStaff(s);
    setFormData({
      firstName: s.firstName, lastName: s.lastName, email: s.user.email, phone: s.phone || "",
      position: s.position, hourlyRate: s.hourlyRate, role: s.user.role, password: "",
    });
    setIsDialogOpen(true);
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

  return (
    <div className="flex flex-col h-full">
      <Header title="Staff Management" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Staff Directory</h2>
            <p className="text-muted-foreground">{staff.length} team members</p>
          </div>
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
                  <div className="grid gap-2"><Label>First Name</Label><Input value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} /></div>
                  <div className="grid gap-2"><Label>Last Name</Label><Input value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} /></div>
                </div>
                <div className="grid gap-2"><Label>Email</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
                <div className="grid gap-2"><Label>Phone</Label><Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} /></div>
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

        <Tabs defaultValue="directory">
          <TabsList>
            <TabsTrigger value="directory">Directory</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="timeclock">Time Clock</TabsTrigger>
          </TabsList>

          <TabsContent value="directory">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {staff.map((s) => (
                <Card
                  key={s.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => openStaffDetail(s)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback>{s.firstName[0]}{s.lastName[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-lg">{s.firstName} {s.lastName}</CardTitle>
                        <CardDescription>{s.position}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <p>{s.user.email}</p>
                      <p>{s.phone}</p>
                      <p className="font-medium">{formatCurrency(s.hourlyRate)}/hr</p>
                      <div className="flex items-center justify-between mt-4" onClick={(e) => e.stopPropagation()}>
                        {getStatusBadge(s.status)}
                        <Button size="sm" variant="outline" onClick={() => openEdit(s)}><Edit className="h-3 w-3 mr-1" /> Edit</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
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
                  {/* Contact & Rate */}
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

                  {/* Employment Details */}
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

                  {/* Time Clock Actions */}
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

                <DialogFooter>
                  <Button
                    onClick={() => { openEdit(detailStaff); setIsDetailOpen(false); }}
                    className="w-full"
                  >
                    <Edit className="mr-2 h-4 w-4" /> Edit Staff Member
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
