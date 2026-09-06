"use client";

import { fetchCollection } from "@/lib/fetchCollection";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  Users,
  DollarSign,
  Clock,
  Star,
  Plus,
  Award,
  Target,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface StaffSummary {
  id: string;
  name: string;
  position: string;
  totalOrders: number;
  totalSales: number;
  averageOrderValue: number;
  totalTips: number;
  totalHours: number;
  salesPerHour: number;
  metrics: Record<string, number>;
}

interface PerformanceRecord {
  id: string;
  staffId: string;
  metric: string;
  value: number;
  notes?: string;
  date: string;
  staff: {
    firstName: string;
    lastName: string;
    position: string;
  };
}

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
}

const performanceMetrics = [
  { value: "customer_satisfaction", label: "Customer Satisfaction", unit: "/5" },
  { value: "speed_of_service", label: "Speed of Service", unit: "/5" },
  { value: "upselling", label: "Upselling Score", unit: "/5" },
  { value: "teamwork", label: "Teamwork", unit: "/5" },
  { value: "attendance", label: "Attendance", unit: "%" },
  { value: "order_accuracy", label: "Order Accuracy", unit: "%" },
];

export default function PerformancePage() {
  const [summaries, setSummaries] = useState<StaffSummary[]>([]);
  const [records, setRecords] = useState<PerformanceRecord[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<StaffSummary | null>(null);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [timePeriod, setTimePeriod] = useState("30");

  const [newRecord, setNewRecord] = useState({
    staffId: "",
    metric: "",
    value: 5,
    notes: "",
    date: new Date().toISOString().split("T")[0],
  });

  const fetchData = async () => {
    try {
      const [summaryRes, recordsRes, staffRes] = await Promise.all([
        fetch(`/api/performance/summary?days=${timePeriod}`),
        fetch("/api/performance"),
        fetchCollection<Staff>("/api/staff"),
      ]);
      const [summaryData, recordsData, staffData] = await Promise.all([
        summaryRes.json(),
        recordsRes.json(),
        staffRes,
      ]);
      setSummaries(Array.isArray(summaryData) ? summaryData : []);
      setRecords(Array.isArray(recordsData) ? recordsData : []);
      setStaff(staffData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timePeriod]);

  const handleAddRecord = async () => {
    try {
      const response = await fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRecord),
      });
      if (response.ok) {
        setShowAddRecord(false);
        setNewRecord({
          staffId: "",
          metric: "",
          value: 5,
          notes: "",
          date: new Date().toISOString().split("T")[0],
        });
        fetchData();
      }
    } catch (error) {
      console.error("Error adding record:", error);
    }
  };

  const topPerformers = [...summaries]
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, 5);

  const totalSales = summaries.reduce((sum, s) => sum + s.totalSales, 0);
  const totalOrders = summaries.reduce((sum, s) => sum + s.totalOrders, 0);
  const totalHours = summaries.reduce((sum, s) => sum + s.totalHours, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <TrendingUp className="h-8 w-8 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Employee Performance</h1>
          <p className="text-muted-foreground">Track and analyze staff performance metrics</p>
        </div>
        <div className="flex gap-2">
          <Select value={timePeriod} onValueChange={setTimePeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowAddRecord(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Review
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalSales.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Last {timePeriod} days
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Across all staff</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHours.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">Hours worked</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaries.length}</div>
            <p className="text-xs text-muted-foreground">Team members</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="leaderboard">
        <TabsList>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="detailed">Detailed View</TabsTrigger>
          <TabsTrigger value="reviews">Performance Reviews</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard" className="space-y-4">
          {/* Top Performers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-yellow-500" />
                Top Performers
              </CardTitle>
              <CardDescription>Ranked by total sales</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topPerformers.map((performer, index) => (
                  <div
                    key={performer.id}
                    className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => setSelectedStaff(performer)}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                        index === 0
                          ? "bg-yellow-500 text-white"
                          : index === 1
                          ? "bg-gray-400 text-white"
                          : index === 2
                          ? "bg-amber-600 text-white"
                          : "bg-muted-foreground/20"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{performer.name}</p>
                      <p className="text-sm text-muted-foreground">{performer.position}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">${performer.totalSales.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">
                        {performer.totalOrders} orders
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-green-600">
                      <ArrowUpRight className="h-4 w-4" />
                      <span className="text-sm">
                        ${performer.salesPerHour.toFixed(0)}/hr
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detailed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Staff Performance</CardTitle>
              <CardDescription>Detailed breakdown by employee</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Avg Order</TableHead>
                    <TableHead className="text-right">Tips</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">$/Hour</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((summary) => (
                    <TableRow
                      key={summary.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedStaff(summary)}
                    >
                      <TableCell className="font-medium">{summary.name}</TableCell>
                      <TableCell>{summary.position}</TableCell>
                      <TableCell className="text-right">{summary.totalOrders}</TableCell>
                      <TableCell className="text-right">
                        ${summary.totalSales.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ${summary.averageOrderValue.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        ${summary.totalTips.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {summary.totalHours.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={summary.salesPerHour >= 100 ? "default" : "secondary"}
                        >
                          ${summary.salesPerHour.toFixed(0)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Performance Reviews</CardTitle>
              <CardDescription>Individual performance evaluations</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No performance reviews recorded yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.slice(0, 20).map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          {new Date(record.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-medium">
                          {record.staff.firstName} {record.staff.lastName}
                        </TableCell>
                        <TableCell>
                          {performanceMetrics.find((m) => m.value === record.metric)
                            ?.label || record.metric}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Star className="h-4 w-4 text-yellow-500" />
                            {record.value}
                            {performanceMetrics.find((m) => m.value === record.metric)?.unit}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {record.notes || "-"}
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

      {/* Add Performance Review Dialog */}
      <Dialog open={showAddRecord} onOpenChange={setShowAddRecord}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Performance Review</DialogTitle>
            <DialogDescription>Record a performance evaluation for a staff member</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select
                value={newRecord.staffId}
                onValueChange={(value) => setNewRecord({ ...newRecord, staffId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} - {s.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Metric</Label>
                <Select
                  value={newRecord.metric}
                  onValueChange={(value) => setNewRecord({ ...newRecord, metric: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select metric" />
                  </SelectTrigger>
                  <SelectContent>
                    {performanceMetrics.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={newRecord.date}
                  onChange={(e) => setNewRecord({ ...newRecord, date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Score (1-5 or 0-100 for percentages)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={newRecord.value}
                onChange={(e) =>
                  setNewRecord({ ...newRecord, value: parseFloat(e.target.value) || 0 })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Additional feedback..."
                value={newRecord.notes}
                onChange={(e) => setNewRecord({ ...newRecord, notes: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddRecord(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddRecord}
                disabled={!newRecord.staffId || !newRecord.metric}
              >
                Add Review
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Staff Detail Dialog */}
      <Dialog open={!!selectedStaff} onOpenChange={() => setSelectedStaff(null)}>
        <DialogContent className="max-w-lg">
          {selectedStaff && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedStaff.name}</DialogTitle>
                <DialogDescription>{selectedStaff.position}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Sales</p>
                    <p className="text-2xl font-bold">
                      ${selectedStaff.totalSales.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Orders</p>
                    <p className="text-2xl font-bold">{selectedStaff.totalOrders}</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Avg Order Value</p>
                    <p className="text-2xl font-bold">
                      ${selectedStaff.averageOrderValue.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Tips Earned</p>
                    <p className="text-2xl font-bold">
                      ${selectedStaff.totalTips.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Hours Worked</p>
                    <p className="text-2xl font-bold">
                      {selectedStaff.totalHours.toFixed(1)}
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Sales/Hour</p>
                    <p className="text-2xl font-bold">
                      ${selectedStaff.salesPerHour.toFixed(2)}
                    </p>
                  </div>
                </div>

                {Object.keys(selectedStaff.metrics).length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Performance Metrics</h4>
                    <div className="space-y-2">
                      {Object.entries(selectedStaff.metrics).map(([metric, value]) => {
                        const metricInfo = performanceMetrics.find(
                          (m) => m.value === metric
                        );
                        return (
                          <div
                            key={metric}
                            className="flex items-center justify-between"
                          >
                            <span className="text-sm">
                              {metricInfo?.label || metric}
                            </span>
                            <Badge variant="secondary">
                              {value.toFixed(1)}
                              {metricInfo?.unit}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
