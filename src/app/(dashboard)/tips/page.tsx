"use client";

import { fetchCollection } from "@/lib/fetchCollection";

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
import { DollarSign, Plus, TrendingUp, Users, PiggyBank, Calendar } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
}

interface TipRecord {
  id: string;
  staffId: string;
  date: string;
  amount: number;
  source: string;
  staff: Staff;
}

export default function TipsPage() {
  const [tips, setTips] = useState<TipRecord[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);

  const [form, setForm] = useState({
    staffId: "",
    amount: "",
    source: "card",
    date: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [tipsRes, staffRes] = await Promise.all([
        fetch("/api/tips"),
        fetchCollection<Staff>("/api/staff"),
      ]);
      const [tipsData, staffData] = await Promise.all([
        tipsRes.json(),
        staffRes,
      ]);
      setTips(Array.isArray(tipsData) ? tipsData : []);
      setStaff(staffData);
    } catch {
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.staffId || !form.amount) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }

    try {
      const res = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: form.staffId,
          amount: parseFloat(form.amount),
          source: form.source,
          date: form.date,
        }),
      });

      if (res.ok) {
        toast({ title: "Success", description: "Tip recorded" });
        setIsDialogOpen(false);
        setForm({ staffId: "", amount: "", source: "card", date: new Date().toISOString().split("T")[0] });
        fetchData();
      }
    } catch {
      toast({ title: "Error", description: "Failed to record tip", variant: "destructive" });
    }
  };

  const todayTips = tips.filter(t => t.date.split("T")[0] === selectedDate);
  const totalToday = todayTips.reduce((sum, t) => sum + t.amount, 0);
  const totalAll = tips.reduce((sum, t) => sum + t.amount, 0);
  const avgPerStaff = totalToday / Math.max(new Set(todayTips.map(t => t.staffId)).size, 1);

  const tipsByStaff = staff.map(s => ({
    ...s,
    todayTips: todayTips.filter(t => t.staffId === s.id).reduce((sum, t) => sum + t.amount, 0),
    totalTips: tips.filter(t => t.staffId === s.id).reduce((sum, t) => sum + t.amount, 0),
  })).filter(s => s.todayTips > 0 || s.totalTips > 0).sort((a, b) => b.todayTips - a.todayTips);

  return (
    <div className="flex flex-col h-full">
      <Header title="Tip Distribution" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Tip Distribution</h2>
            <p className="text-muted-foreground">Track and distribute tips to staff</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Record Tip</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Tip</DialogTitle>
                <DialogDescription>Add a tip for a staff member</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Staff Member</Label>
                  <Select value={form.staffId} onValueChange={(v) => setForm({ ...form, staffId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                    <SelectContent>
                      {staff.filter(s => ["Server", "Bartender", "Host", "Busser"].includes(s.position)).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.firstName} {s.lastName} - {s.position}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Amount ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Source</Label>
                  <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="pooled">Pooled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
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
              <CardTitle className="text-sm font-medium">Today's Tips</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalToday)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Per Staff</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(avgPerStaff)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Staff Tipped</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{new Set(todayTips.map(t => t.staffId)).size}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">All Time Total</CardTitle>
              <PiggyBank className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalAll)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-4">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-48"
          />
        </div>

        {/* Tips by Staff */}
        <Card>
          <CardHeader>
            <CardTitle>Tips by Staff</CardTitle>
            <CardDescription>For {new Date(selectedDate).toLocaleDateString()}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Today's Tips</TableHead>
                  <TableHead>Total Tips</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tipsByStaff.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.firstName} {s.lastName}</TableCell>
                    <TableCell><Badge variant="outline">{s.position}</Badge></TableCell>
                    <TableCell className="font-bold text-green-600">{formatCurrency(s.todayTips)}</TableCell>
                    <TableCell>{formatCurrency(s.totalTips)}</TableCell>
                  </TableRow>
                ))}
                {tipsByStaff.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No tips recorded
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
