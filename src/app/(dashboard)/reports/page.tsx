"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { DollarSign, ShoppingCart, TrendingUp, Users, Download, Calendar } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ReportData {
  period: { start: string; end: string };
  summary: {
    totalOrders: number;
    totalRevenue: number;
    totalTax: number;
    totalTips: number;
    totalDiscount: number;
    avgOrderValue: number;
  };
  topItems: { name: string; quantity: number; revenue: number }[];
  hourlyBreakdown: Record<number, { orders: number; revenue: number }>;
  orderTypes: Record<string, number>;
  paymentMethods: Record<string, number>;
}

export default function ReportsPage() {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("today");

  useEffect(() => { fetchReport(); }, [dateRange]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const today = new Date();
      let startDate = new Date();
      let endDate = new Date();

      switch (dateRange) {
        case "today":
          startDate = today;
          endDate = today;
          break;
        case "yesterday":
          startDate = new Date(today.setDate(today.getDate() - 1));
          endDate = startDate;
          break;
        case "week":
          startDate = new Date(today.setDate(today.getDate() - 7));
          endDate = new Date();
          break;
        case "month":
          startDate = new Date(today.setMonth(today.getMonth() - 1));
          endDate = new Date();
          break;
      }

      const res = await fetch(`/api/reports?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`);
      const data = await res.json();
      setReportData(data);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load report", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const stats = reportData ? [
    { title: "Total Revenue", value: formatCurrency(reportData.summary.totalRevenue), icon: DollarSign, change: "+12.5%" },
    { title: "Total Orders", value: reportData.summary.totalOrders.toString(), icon: ShoppingCart, change: "+8" },
    { title: "Avg Order Value", value: formatCurrency(reportData.summary.avgOrderValue), icon: TrendingUp, change: "+$2.50" },
    { title: "Total Tips", value: formatCurrency(reportData.summary.totalTips), icon: Users, change: "+15%" },
  ] : [];

  return (
    <div className="flex flex-col h-full">
      <Header title="Reports" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Sales Reports</h2>
            <p className="text-muted-foreground">Analyze your restaurant performance</p>
          </div>
          <div className="flex gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Export</Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading report...</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat, i) => (
                <Card key={i}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                    <stat.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <p className="text-xs text-muted-foreground text-green-600">{stat.change}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="items">Top Items</TabsTrigger>
                <TabsTrigger value="hourly">Hourly Breakdown</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Order Types</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {reportData?.orderTypes && Object.entries(reportData.orderTypes).map(([type, count]) => (
                        <div key={type} className="flex justify-between py-2 border-b last:border-0">
                          <span>{type.replace("_", " ")}</span>
                          <span className="font-bold">{count}</span>
                        </div>
                      ))}
                      {(!reportData?.orderTypes || Object.keys(reportData.orderTypes).length === 0) && (
                        <p className="text-muted-foreground text-center py-4">No data</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Payment Methods</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {reportData?.paymentMethods && Object.entries(reportData.paymentMethods).map(([method, count]) => (
                        <div key={method} className="flex justify-between py-2 border-b last:border-0">
                          <span className="capitalize">{method}</span>
                          <span className="font-bold">{count}</span>
                        </div>
                      ))}
                      {(!reportData?.paymentMethods || Object.keys(reportData.paymentMethods).length === 0) && (
                        <p className="text-muted-foreground text-center py-4">No data</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div><p className="text-sm text-muted-foreground">Subtotal</p><p className="text-xl font-bold">{formatCurrency((reportData?.summary.totalRevenue || 0) - (reportData?.summary.totalTax || 0))}</p></div>
                      <div><p className="text-sm text-muted-foreground">Tax Collected</p><p className="text-xl font-bold">{formatCurrency(reportData?.summary.totalTax || 0)}</p></div>
                      <div><p className="text-sm text-muted-foreground">Discounts Given</p><p className="text-xl font-bold">{formatCurrency(reportData?.summary.totalDiscount || 0)}</p></div>
                      <div><p className="text-sm text-muted-foreground">Tips</p><p className="text-xl font-bold">{formatCurrency(reportData?.summary.totalTips || 0)}</p></div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="items">
                <Card>
                  <CardHeader>
                    <CardTitle>Top Selling Items</CardTitle>
                    <CardDescription>Best performers by revenue</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Quantity Sold</TableHead>
                          <TableHead>Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData?.topItems.map((item, i) => (
                          <TableRow key={i}>
                            <TableCell>#{i + 1}</TableCell>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>{formatCurrency(item.revenue)}</TableCell>
                          </TableRow>
                        ))}
                        {(!reportData?.topItems || reportData.topItems.length === 0) && (
                          <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No sales data</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="hourly">
                <Card>
                  <CardHeader>
                    <CardTitle>Hourly Sales</CardTitle>
                    <CardDescription>Orders and revenue by hour</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Hour</TableHead>
                          <TableHead>Orders</TableHead>
                          <TableHead>Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData?.hourlyBreakdown && Object.entries(reportData.hourlyBreakdown)
                          .filter(([_, data]) => data.orders > 0)
                          .map(([hour, data]) => (
                            <TableRow key={hour}>
                              <TableCell>{parseInt(hour) === 0 ? "12 AM" : parseInt(hour) < 12 ? `${hour} AM` : parseInt(hour) === 12 ? "12 PM" : `${parseInt(hour) - 12} PM`}</TableCell>
                              <TableCell>{data.orders}</TableCell>
                              <TableCell>{formatCurrency(data.revenue)}</TableCell>
                            </TableRow>
                          ))}
                        {(!reportData?.hourlyBreakdown || Object.values(reportData.hourlyBreakdown).every((d) => d.orders === 0)) && (
                          <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No hourly data</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
