"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
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
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/use-toast";
import {
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Users,
  Phone,
  Mail,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  UserCheck,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface TableData {
  id: string;
  number: number;
  capacity: number;
  section: string;
  status: string;
}

interface Reservation {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  partySize: number;
  date: string;
  time: string;
  status: string;
  specialOccasion: string | null;
  notes: string | null;
  table: TableData | null;
}

interface WaitlistEntry {
  id: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  estimatedWait: number;
  status: string;
  notes: string | null;
  createdAt: string;
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<TableData[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isReservationDialogOpen, setIsReservationDialogOpen] = useState(false);
  const [isTableDialogOpen, setIsTableDialogOpen] = useState(false);
  const [isWaitlistDialogOpen, setIsWaitlistDialogOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);

  // Detail sheet states
  const [isReservationDetailOpen, setIsReservationDetailOpen] = useState(false);
  const [detailReservation, setDetailReservation] = useState<Reservation | null>(null);
  const [isTableDetailOpen, setIsTableDetailOpen] = useState(false);
  const [detailTable, setDetailTable] = useState<TableData | null>(null);
  const [isWaitlistDetailOpen, setIsWaitlistDetailOpen] = useState(false);
  const [detailWaitlistEntry, setDetailWaitlistEntry] = useState<WaitlistEntry | null>(null);

  const openReservationDetail = (reservation: Reservation) => {
    setDetailReservation(reservation);
    setIsReservationDetailOpen(true);
  };

  const openTableDetail = (table: TableData) => {
    setDetailTable(table);
    setIsTableDetailOpen(true);
  };

  const openWaitlistDetail = (entry: WaitlistEntry) => {
    setDetailWaitlistEntry(entry);
    setIsWaitlistDetailOpen(true);
  };

  // Form states
  const [formData, setFormData] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    partySize: 2,
    date: new Date(),
    time: "18:00",
    tableId: "",
    specialOccasion: "none",
    notes: "",
  });

  const [tableFormData, setTableFormData] = useState({
    number: 1,
    capacity: 4,
    section: "Main",
  });

  const [waitlistFormData, setWaitlistFormData] = useState({
    customerName: "",
    customerPhone: "",
    partySize: 2,
    estimatedWait: 15,
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [reservationsRes, tablesRes, waitlistRes] = await Promise.all([
        fetch(`/api/reservations?date=${selectedDate.toISOString()}`),
        fetch("/api/tables"),
        fetch("/api/waitlist"),
      ]);

      const [reservationsData, tablesData, waitlistData] = await Promise.all([
        reservationsRes.json(),
        tablesRes.json(),
        waitlistRes.json(),
      ]);

      setReservations(Array.isArray(reservationsData) ? reservationsData : []);
      setTables(Array.isArray(tablesData) ? tablesData : []);
      setWaitlist(Array.isArray(waitlistData) ? waitlistData : []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReservation = async () => {
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          date: formData.date.toISOString(),
          time: new Date(`${format(formData.date, "yyyy-MM-dd")}T${formData.time}`).toISOString(),
          tableId: formData.tableId || null,
        }),
      });

      if (response.ok) {
        toast({ title: "Success", description: "Reservation created successfully" });
        setIsReservationDialogOpen(false);
        resetForm();
        fetchData();
      } else {
        throw new Error("Failed to create reservation");
      }
    } catch (error) {
      console.error("Error creating reservation:", error);
      toast({ title: "Error", description: "Failed to create reservation", variant: "destructive" });
    }
  };

  const handleUpdateReservation = async () => {
    if (!editingReservation) return;

    try {
      const response = await fetch(`/api/reservations/${editingReservation.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          date: formData.date.toISOString(),
          time: new Date(`${format(formData.date, "yyyy-MM-dd")}T${formData.time}`).toISOString(),
          tableId: formData.tableId || null,
        }),
      });

      if (response.ok) {
        toast({ title: "Success", description: "Reservation updated successfully" });
        setIsReservationDialogOpen(false);
        setEditingReservation(null);
        resetForm();
        fetchData();
      } else {
        throw new Error("Failed to update reservation");
      }
    } catch (error) {
      console.error("Error updating reservation:", error);
      toast({ title: "Error", description: "Failed to update reservation", variant: "destructive" });
    }
  };

  const handleDeleteReservation = async (id: string) => {
    try {
      const response = await fetch(`/api/reservations/${id}`, { method: "DELETE" });
      if (response.ok) {
        toast({ title: "Success", description: "Reservation deleted" });
        fetchData();
      } else {
        throw new Error("Failed to delete reservation");
      }
    } catch (error) {
      console.error("Error deleting reservation:", error);
      toast({ title: "Error", description: "Failed to delete reservation", variant: "destructive" });
    }
  };

  const handleUpdateReservationStatus = async (id: string, status: string) => {
    try {
      const response = await fetch(`/api/reservations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        toast({ title: "Success", description: `Reservation marked as ${status.toLowerCase()}` });
        fetchData();
      } else {
        throw new Error("Failed to update reservation status");
      }
    } catch (error) {
      console.error("Error updating reservation status:", error);
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const handleCreateTable = async () => {
    try {
      const response = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tableFormData),
      });

      if (response.ok) {
        toast({ title: "Success", description: "Table created successfully" });
        setIsTableDialogOpen(false);
        setTableFormData({ number: 1, capacity: 4, section: "Main" });
        fetchData();
      } else {
        throw new Error("Failed to create table");
      }
    } catch (error) {
      console.error("Error creating table:", error);
      toast({ title: "Error", description: "Failed to create table", variant: "destructive" });
    }
  };

  const handleUpdateTableStatus = async (id: string, status: string) => {
    try {
      const response = await fetch(`/api/tables/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        toast({ title: "Success", description: `Table status updated to ${status.toLowerCase()}` });
        fetchData();
      } else {
        throw new Error("Failed to update table status");
      }
    } catch (error) {
      console.error("Error updating table status:", error);
      toast({ title: "Error", description: "Failed to update table status", variant: "destructive" });
    }
  };

  const handleAddToWaitlist = async () => {
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(waitlistFormData),
      });

      if (response.ok) {
        toast({ title: "Success", description: "Added to waitlist" });
        setIsWaitlistDialogOpen(false);
        setWaitlistFormData({ customerName: "", customerPhone: "", partySize: 2, estimatedWait: 15, notes: "" });
        fetchData();
      } else {
        throw new Error("Failed to add to waitlist");
      }
    } catch (error) {
      console.error("Error adding to waitlist:", error);
      toast({ title: "Error", description: "Failed to add to waitlist", variant: "destructive" });
    }
  };

  const handleSeatWaitlistEntry = async (id: string) => {
    try {
      const response = await fetch(`/api/waitlist/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SEATED" }),
      });

      if (response.ok) {
        toast({ title: "Success", description: "Guest seated" });
        fetchData();
      } else {
        throw new Error("Failed to seat guest");
      }
    } catch (error) {
      console.error("Error seating guest:", error);
      toast({ title: "Error", description: "Failed to seat guest", variant: "destructive" });
    }
  };

  const handleRemoveFromWaitlist = async (id: string) => {
    try {
      const response = await fetch(`/api/waitlist/${id}`, { method: "DELETE" });
      if (response.ok) {
        toast({ title: "Success", description: "Removed from waitlist" });
        fetchData();
      } else {
        throw new Error("Failed to remove from waitlist");
      }
    } catch (error) {
      console.error("Error removing from waitlist:", error);
      toast({ title: "Error", description: "Failed to remove from waitlist", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      partySize: 2,
      date: new Date(),
      time: "18:00",
      tableId: "",
      specialOccasion: "none",
      notes: "",
    });
  };

  const openEditDialog = (reservation: Reservation) => {
    setEditingReservation(reservation);
    setFormData({
      customerName: reservation.customerName,
      customerPhone: reservation.customerPhone,
      customerEmail: reservation.customerEmail || "",
      partySize: reservation.partySize,
      date: new Date(reservation.date),
      time: format(new Date(reservation.time), "HH:mm"),
      tableId: reservation.table?.id || "",
      specialOccasion: reservation.specialOccasion || "none",
      notes: reservation.notes || "",
    });
    setIsReservationDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"; label: string }> = {
      PENDING: { variant: "secondary", label: "Pending" },
      CONFIRMED: { variant: "default", label: "Confirmed" },
      SEATED: { variant: "success", label: "Seated" },
      COMPLETED: { variant: "outline", label: "Completed" },
      CANCELLED: { variant: "destructive", label: "Cancelled" },
      NO_SHOW: { variant: "destructive", label: "No Show" },
    };
    const config = statusConfig[status] || { variant: "secondary" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTableStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"; label: string }> = {
      AVAILABLE: { variant: "success", label: "Available" },
      OCCUPIED: { variant: "destructive", label: "Occupied" },
      RESERVED: { variant: "warning", label: "Reserved" },
      CLEANING: { variant: "secondary", label: "Cleaning" },
      OUT_OF_SERVICE: { variant: "outline", label: "Out of Service" },
    };
    const config = statusConfig[status] || { variant: "secondary" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const timeSlots = [];
  for (let hour = 11; hour <= 22; hour++) {
    timeSlots.push(`${hour.toString().padStart(2, "0")}:00`);
    timeSlots.push(`${hour.toString().padStart(2, "0")}:30`);
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Reservations" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <Tabs defaultValue="reservations" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="reservations">Reservations</TabsTrigger>
              <TabsTrigger value="tables">Tables</TabsTrigger>
              <TabsTrigger value="waitlist">Waitlist</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(selectedDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <TabsContent value="reservations" className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {reservations.length} reservations for {format(selectedDate, "MMMM d, yyyy")}
              </div>
              <Dialog open={isReservationDialogOpen} onOpenChange={setIsReservationDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => { setEditingReservation(null); resetForm(); }}>
                    <Plus className="mr-2 h-4 w-4" /> New Reservation
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{editingReservation ? "Edit Reservation" : "New Reservation"}</DialogTitle>
                    <DialogDescription>
                      {editingReservation ? "Update the reservation details." : "Add a new reservation to the system."}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="customerName">Guest Name</Label>
                      <Input
                        id="customerName"
                        value={formData.customerName}
                        onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                        placeholder="John Smith"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="customerPhone">Phone</Label>
                        <Input
                          id="customerPhone"
                          value={formData.customerPhone}
                          onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                          placeholder="(555) 123-4567"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="partySize">Party Size</Label>
                        <Select
                          value={formData.partySize.toString()}
                          onValueChange={(value) => setFormData({ ...formData, partySize: parseInt(value) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map((size) => (
                              <SelectItem key={size} value={size.toString()}>
                                {size} {size === 1 ? "guest" : "guests"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="customerEmail">Email (optional)</Label>
                      <Input
                        id="customerEmail"
                        type="email"
                        value={formData.customerEmail}
                        onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                        placeholder="john@example.com"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {format(formData.date, "MMM d, yyyy")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={formData.date}
                              onSelect={(date) => date && setFormData({ ...formData, date })}
                              autoFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="time">Time</Label>
                        <Select
                          value={formData.time}
                          onValueChange={(value) => setFormData({ ...formData, time: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {timeSlots.map((slot) => (
                              <SelectItem key={slot} value={slot}>
                                {slot}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="tableId">Table (optional)</Label>
                      <Select
                        value={formData.tableId}
                        onValueChange={(value) => setFormData({ ...formData, tableId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Auto-assign" />
                        </SelectTrigger>
                        <SelectContent>
                          {tables
                            .filter((t) => t.capacity >= formData.partySize)
                            .map((table) => (
                              <SelectItem key={table.id} value={table.id}>
                                Table {table.number} ({table.capacity} seats) - {table.section}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="specialOccasion">Special Occasion</Label>
                      <Select
                        value={formData.specialOccasion}
                        onValueChange={(value) => setFormData({ ...formData, specialOccasion: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="birthday">Birthday</SelectItem>
                          <SelectItem value="anniversary">Anniversary</SelectItem>
                          <SelectItem value="date">Date Night</SelectItem>
                          <SelectItem value="business">Business Dinner</SelectItem>
                          <SelectItem value="celebration">Celebration</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Any special requests..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsReservationDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={editingReservation ? handleUpdateReservation : handleCreateReservation}>
                      {editingReservation ? "Update" : "Create"} Reservation
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guest</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : reservations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No reservations for this date
                        </TableCell>
                      </TableRow>
                    ) : (
                      reservations.map((reservation) => (
                        <TableRow
                          key={reservation.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => openReservationDetail(reservation)}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium">{reservation.customerName}</p>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {reservation.customerPhone}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              {reservation.partySize}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              {format(new Date(reservation.time), "h:mm a")}
                            </div>
                          </TableCell>
                          <TableCell>
                            {reservation.table ? `Table ${reservation.table.number}` : "Unassigned"}
                          </TableCell>
                          <TableCell>{getStatusBadge(reservation.status)}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {reservation.specialOccasion && (
                              <Badge variant="outline" className="mr-1">{reservation.specialOccasion}</Badge>
                            )}
                            {reservation.notes}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              {reservation.status === "PENDING" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleUpdateReservationStatus(reservation.id, "CONFIRMED")}
                                  title="Confirm"
                                >
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                </Button>
                              )}
                              {reservation.status === "CONFIRMED" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleUpdateReservationStatus(reservation.id, "SEATED")}
                                  title="Seat Guest"
                                >
                                  <UserCheck className="h-4 w-4 text-blue-600" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEditDialog(reservation)}
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUpdateReservationStatus(reservation.id, "CANCELLED")}
                                title="Cancel"
                              >
                                <XCircle className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tables" className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {tables.length} tables configured
              </div>
              <Dialog open={isTableDialogOpen} onOpenChange={setIsTableDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" /> Add Table
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Table</DialogTitle>
                    <DialogDescription>Add a new table to your floor plan.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="tableNumber">Table Number</Label>
                      <Input
                        id="tableNumber"
                        type="number"
                        value={tableFormData.number}
                        onChange={(e) => setTableFormData({ ...tableFormData, number: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="capacity">Capacity</Label>
                      <Select
                        value={tableFormData.capacity.toString()}
                        onValueChange={(value) => setTableFormData({ ...tableFormData, capacity: parseInt(value) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[2, 4, 6, 8, 10, 12].map((size) => (
                            <SelectItem key={size} value={size.toString()}>
                              {size} seats
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="section">Section</Label>
                      <Select
                        value={tableFormData.section}
                        onValueChange={(value) => setTableFormData({ ...tableFormData, section: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Main">Main Dining</SelectItem>
                          <SelectItem value="Patio">Patio</SelectItem>
                          <SelectItem value="Bar">Bar Area</SelectItem>
                          <SelectItem value="Private">Private Room</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsTableDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateTable}>Add Table</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tables.map((table) => (
                <Card
                  key={table.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => openTableDetail(table)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Table {table.number}</CardTitle>
                      {getTableStatusBadge(table.status)}
                    </div>
                    <CardDescription>{table.section}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{table.capacity} seats</span>
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={table.status}
                        onValueChange={(value) => handleUpdateTableStatus(table.id, value)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AVAILABLE">Available</SelectItem>
                          <SelectItem value="OCCUPIED">Occupied</SelectItem>
                          <SelectItem value="RESERVED">Reserved</SelectItem>
                          <SelectItem value="CLEANING">Cleaning</SelectItem>
                          <SelectItem value="OUT_OF_SERVICE">Out of Service</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {tables.length === 0 && !loading && (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No tables configured. Add your first table to get started.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="waitlist" className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {waitlist.length} parties waiting
              </div>
              <Dialog open={isWaitlistDialogOpen} onOpenChange={setIsWaitlistDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" /> Add to Waitlist
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add to Waitlist</DialogTitle>
                    <DialogDescription>Add a walk-in party to the waitlist.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="waitlistName">Guest Name</Label>
                      <Input
                        id="waitlistName"
                        value={waitlistFormData.customerName}
                        onChange={(e) => setWaitlistFormData({ ...waitlistFormData, customerName: e.target.value })}
                        placeholder="John Smith"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="waitlistPhone">Phone</Label>
                        <Input
                          id="waitlistPhone"
                          value={waitlistFormData.customerPhone}
                          onChange={(e) => setWaitlistFormData({ ...waitlistFormData, customerPhone: e.target.value })}
                          placeholder="(555) 123-4567"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="waitlistPartySize">Party Size</Label>
                        <Select
                          value={waitlistFormData.partySize.toString()}
                          onValueChange={(value) => setWaitlistFormData({ ...waitlistFormData, partySize: parseInt(value) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((size) => (
                              <SelectItem key={size} value={size.toString()}>
                                {size} {size === 1 ? "guest" : "guests"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="estimatedWait">Estimated Wait (minutes)</Label>
                      <Select
                        value={waitlistFormData.estimatedWait.toString()}
                        onValueChange={(value) => setWaitlistFormData({ ...waitlistFormData, estimatedWait: parseInt(value) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[5, 10, 15, 20, 30, 45, 60, 90].map((mins) => (
                            <SelectItem key={mins} value={mins.toString()}>
                              {mins} minutes
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="waitlistNotes">Notes</Label>
                      <Textarea
                        id="waitlistNotes"
                        value={waitlistFormData.notes}
                        onChange={(e) => setWaitlistFormData({ ...waitlistFormData, notes: e.target.value })}
                        placeholder="Any special requests..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsWaitlistDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddToWaitlist}>Add to Waitlist</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Position</TableHead>
                      <TableHead>Guest</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>Wait Time</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {waitlist.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No parties on the waitlist
                        </TableCell>
                      </TableRow>
                    ) : (
                      waitlist.map((entry, index) => (
                        <TableRow
                          key={entry.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => openWaitlistDetail(entry)}
                        >
                          <TableCell>
                            <Badge variant="outline">#{index + 1}</Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{entry.customerName}</p>
                              <p className="text-sm text-muted-foreground">{entry.customerPhone}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              {entry.partySize}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              ~{entry.estimatedWait} min
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {entry.notes}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSeatWaitlistEntry(entry.id)}
                                title="Seat Guest"
                              >
                                <UserCheck className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveFromWaitlist(entry.id)}
                                title="Remove"
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Reservation Detail Dialog */}
        <Dialog open={isReservationDetailOpen} onOpenChange={setIsReservationDetailOpen}>
          <DialogContent className="max-w-md">
            {detailReservation && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {detailReservation.customerName}
                    {getStatusBadge(detailReservation.status)}
                  </DialogTitle>
                  <DialogDescription className="flex items-center gap-2">
                    <Phone className="h-3 w-3" /> {detailReservation.customerPhone}
                    {detailReservation.customerEmail && (
                      <>
                        <span className="mx-1">|</span>
                        <Mail className="h-3 w-3" /> {detailReservation.customerEmail}
                      </>
                    )}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Reservation Details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <div className="flex items-center justify-center gap-1">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{format(new Date(detailReservation.date), "MMM d")}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Date</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{format(new Date(detailReservation.time), "h:mm a")}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Time</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xl font-bold">{detailReservation.partySize}</p>
                      <p className="text-xs text-muted-foreground">Guests</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-sm font-bold">
                        {detailReservation.table ? `Table ${detailReservation.table.number}` : "Unassigned"}
                      </p>
                      <p className="text-xs text-muted-foreground">Table</p>
                    </div>
                  </div>

                  {/* Special Occasion & Notes */}
                  {(detailReservation.specialOccasion || detailReservation.notes) && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        {detailReservation.specialOccasion && (
                          <Badge variant="outline" className="capitalize">{detailReservation.specialOccasion}</Badge>
                        )}
                        {detailReservation.notes && (
                          <p className="text-sm p-2 bg-muted/50 rounded-lg">{detailReservation.notes}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <DialogFooter className="flex-wrap gap-2">
                  {detailReservation.status === "PENDING" && (
                    <Button size="sm" onClick={() => { handleUpdateReservationStatus(detailReservation.id, "CONFIRMED"); setIsReservationDetailOpen(false); }}>
                      <CheckCircle className="mr-1 h-3 w-3" /> Confirm
                    </Button>
                  )}
                  {detailReservation.status === "CONFIRMED" && (
                    <Button size="sm" onClick={() => { handleUpdateReservationStatus(detailReservation.id, "SEATED"); setIsReservationDetailOpen(false); }}>
                      <UserCheck className="mr-1 h-3 w-3" /> Seat Guest
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => { openEditDialog(detailReservation); setIsReservationDetailOpen(false); }}>
                    <Edit className="mr-1 h-3 w-3" /> Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => { handleUpdateReservationStatus(detailReservation.id, "CANCELLED"); setIsReservationDetailOpen(false); }}>
                    <XCircle className="mr-1 h-3 w-3" /> Cancel
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Table Detail Dialog */}
        <Dialog open={isTableDetailOpen} onOpenChange={setIsTableDetailOpen}>
          <DialogContent className="max-w-sm">
            {detailTable && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    Table {detailTable.number}
                    {getTableStatusBadge(detailTable.status)}
                  </DialogTitle>
                  <DialogDescription>
                    {detailTable.section} Section
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Table Info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-2xl font-bold">{detailTable.capacity}</p>
                      <p className="text-xs text-muted-foreground">Seats</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-lg font-bold">{detailTable.section}</p>
                      <p className="text-xs text-muted-foreground">Section</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Change Status */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Change Status</h4>
                    <Select
                      value={detailTable.status}
                      onValueChange={(value) => { handleUpdateTableStatus(detailTable.id, value); setIsTableDetailOpen(false); }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AVAILABLE">Available</SelectItem>
                        <SelectItem value="OCCUPIED">Occupied</SelectItem>
                        <SelectItem value="RESERVED">Reserved</SelectItem>
                        <SelectItem value="CLEANING">Cleaning</SelectItem>
                        <SelectItem value="OUT_OF_SERVICE">Out of Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Waitlist Detail Dialog */}
        <Dialog open={isWaitlistDetailOpen} onOpenChange={setIsWaitlistDetailOpen}>
          <DialogContent className="max-w-sm">
            {detailWaitlistEntry && (
              <>
                <DialogHeader>
                  <DialogTitle>{detailWaitlistEntry.customerName}</DialogTitle>
                  <DialogDescription className="flex items-center gap-2">
                    <Phone className="h-3 w-3" /> {detailWaitlistEntry.customerPhone}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Waitlist Details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-2xl font-bold">{detailWaitlistEntry.partySize}</p>
                      <p className="text-xs text-muted-foreground">Guests</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-2xl font-bold">~{detailWaitlistEntry.estimatedWait}</p>
                      <p className="text-xs text-muted-foreground">Minutes</p>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground text-center">
                    Added: {new Date(detailWaitlistEntry.createdAt).toLocaleString()}
                  </div>

                  {/* Notes */}
                  {detailWaitlistEntry.notes && (
                    <div className="p-2 bg-muted/50 rounded-lg">
                      <p className="text-sm">{detailWaitlistEntry.notes}</p>
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2">
                  <Button onClick={() => { handleSeatWaitlistEntry(detailWaitlistEntry.id); setIsWaitlistDetailOpen(false); }} className="flex-1">
                    <UserCheck className="mr-2 h-4 w-4" /> Seat Guest
                  </Button>
                  <Button variant="destructive" onClick={() => { handleRemoveFromWaitlist(detailWaitlistEntry.id); setIsWaitlistDetailOpen(false); }}>
                    <Trash2 className="h-4 w-4" />
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
