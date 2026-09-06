"use client";

import { fetchCollection } from "@/lib/fetchCollection";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "@/components/ui/use-toast";
import { Plus, ChevronLeft, ChevronRight, Calendar, Clock, Trash2 } from "lucide-react";

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  user: { email: string };
}

interface Schedule {
  id: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  position: string;
  notes: string | null;
  staff: Staff;
}

const POSITIONS = ["Server", "Bartender", "Host", "Line Cook", "Prep Cook", "Dishwasher", "Manager", "Busser"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SchedulingPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(getWeekStart(new Date()));

  const [form, setForm] = useState({
    staffId: "",
    date: "",
    startTime: "09:00",
    endTime: "17:00",
    position: "",
    notes: "",
  });

  function getWeekStart(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getWeekDays(weekStart: Date) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }

  useEffect(() => {
    fetchData();
  }, [currentWeek]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const weekEnd = new Date(currentWeek);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const [schedulesRes, staffRes] = await Promise.all([
        fetch(`/api/schedules?startDate=${currentWeek.toISOString()}&endDate=${weekEnd.toISOString()}`),
        fetchCollection<Staff>("/api/staff"),
      ]);

      const [schedulesData, staffData] = await Promise.all([
        schedulesRes.json(),
        staffRes,
      ]);

      setSchedules(Array.isArray(schedulesData) ? schedulesData : []);
      setStaff(staffData);
    } catch {
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.staffId || !form.date || !form.startTime || !form.endTime) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    try {
      const startTime = new Date(`${form.date}T${form.startTime}:00`);
      const endTime = new Date(`${form.date}T${form.endTime}:00`);

      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: form.staffId,
          date: form.date,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          position: form.position || staff.find(s => s.id === form.staffId)?.position || "Staff",
          notes: form.notes || null,
        }),
      });

      if (res.ok) {
        toast({ title: "Success", description: "Shift scheduled" });
        setIsDialogOpen(false);
        setForm({ staffId: "", date: "", startTime: "09:00", endTime: "17:00", position: "", notes: "" });
        fetchData();
      } else {
        throw new Error();
      }
    } catch {
      toast({ title: "Error", description: "Failed to create schedule", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this shift?")) return;
    try {
      await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      toast({ title: "Success", description: "Shift deleted" });
      fetchData();
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const weekDays = getWeekDays(currentWeek);

  const getShiftsForDay = (date: Date) => {
    return schedules.filter((s) => {
      const shiftDate = new Date(s.date);
      return shiftDate.toDateString() === date.toDateString();
    });
  };

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };

  const prevWeek = () => {
    const prev = new Date(currentWeek);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeek(prev);
  };

  const nextWeek = () => {
    const next = new Date(currentWeek);
    next.setDate(next.getDate() + 7);
    setCurrentWeek(next);
  };

  const getPositionColor = (position: string) => {
    const colors: Record<string, string> = {
      "Server": "bg-blue-100 text-blue-800",
      "Bartender": "bg-purple-100 text-purple-800",
      "Host": "bg-green-100 text-green-800",
      "Line Cook": "bg-orange-100 text-orange-800",
      "Prep Cook": "bg-yellow-100 text-yellow-800",
      "Dishwasher": "bg-gray-100 text-gray-800",
      "Manager": "bg-red-100 text-red-800",
      "Busser": "bg-teal-100 text-teal-800",
    };
    return colors[position] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Staff Scheduling" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Weekly Schedule</h2>
            <p className="text-muted-foreground">Manage staff shifts and scheduling</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Add Shift</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule New Shift</DialogTitle>
                <DialogDescription>Add a staff member to the schedule</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Staff Member *</Label>
                  <Select value={form.staffId} onValueChange={(v) => setForm({ ...form, staffId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                    <SelectContent>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.firstName} {s.lastName} - {s.position}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Start Time *</Label>
                    <Input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>End Time *</Label>
                    <Input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Position</Label>
                  <Select value={form.position} onValueChange={(v) => setForm({ ...form, position: v })}>
                    <SelectTrigger><SelectValue placeholder="Same as default" /></SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Notes</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Optional notes"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit}>Schedule</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Week Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4 mr-2" /> Previous Week
          </Button>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {weekDays[0].toLocaleDateString("en-US", { month: "long", day: "numeric" })} -
            {weekDays[6].toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </h3>
          <Button variant="outline" onClick={nextWeek}>
            Next Week <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>

        {/* Schedule Grid */}
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day, i) => {
            const shifts = getShiftsForDay(day);
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <Card key={i} className={isToday ? "border-primary" : ""}>
                <CardHeader className="py-2 px-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{DAYS[day.getDay()]}</p>
                    <p className={`text-lg font-bold ${isToday ? "text-primary" : ""}`}>
                      {day.getDate()}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="p-2 min-h-[200px]">
                  <div className="space-y-1">
                    {shifts.map((shift) => (
                      <div
                        key={shift.id}
                        className={`p-2 rounded text-xs ${getPositionColor(shift.position)} group relative`}
                      >
                        <div className="font-medium truncate">
                          {shift.staff.firstName} {shift.staff.lastName[0]}.
                        </div>
                        <div className="flex items-center gap-1 text-[10px] opacity-80">
                          <Clock className="h-3 w-3" />
                          {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                        </div>
                        <Badge variant="outline" className="text-[9px] mt-1 px-1 py-0">
                          {shift.position}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                          onClick={() => handleDelete(shift.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    {shifts.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">No shifts</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Week Summary</CardTitle>
            <CardDescription>Scheduled hours by position</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              {POSITIONS.slice(0, 8).map((position) => {
                const positionShifts = schedules.filter((s) => s.position === position);
                const totalHours = positionShifts.reduce((sum, s) => {
                  const start = new Date(s.startTime);
                  const end = new Date(s.endTime);
                  return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                }, 0);
                return (
                  <div key={position} className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm font-medium">{position}</p>
                    <p className="text-2xl font-bold">{totalHours.toFixed(1)}h</p>
                    <p className="text-xs text-muted-foreground">{positionShifts.length} shifts</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
