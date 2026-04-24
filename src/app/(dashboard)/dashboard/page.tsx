"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CalendarDays,
  DollarSign,
  Users,
  UtensilsCrossed,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

interface Order {
  id: string;
  table: string;
  items: number;
  total: number;
  status: string;
}

interface Reservation {
  name: string;
  time: string;
  party: number;
  table: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [isReservationDetailOpen, setIsReservationDetailOpen] = useState(false);
  const [detailReservation, setDetailReservation] = useState<Reservation | null>(null);

  const openOrderDetail = (order: Order) => {
    setDetailOrder(order);
    setIsOrderDetailOpen(true);
  };

  const openReservationDetail = (reservation: Reservation) => {
    setDetailReservation(reservation);
    setIsReservationDetailOpen(true);
  };

  const stats = [
    {
      title: "Today's Revenue",
      value: "$4,325.00",
      change: "+12.5%",
      icon: DollarSign,
      trend: "up",
      href: "/reports",
    },
    {
      title: "Active Orders",
      value: "24",
      change: "+3 from last hour",
      icon: UtensilsCrossed,
      trend: "up",
      href: "/orders",
    },
    {
      title: "Reservations Today",
      value: "18",
      change: "5 upcoming",
      icon: CalendarDays,
      trend: "neutral",
      href: "/reservations",
    },
    {
      title: "Customers Served",
      value: "127",
      change: "+8.2%",
      icon: Users,
      trend: "up",
      href: "/customers",
    },
  ];

  const recentOrders = [
    { id: "ORD-001", table: "Table 5", items: 4, total: 78.50, status: "preparing" },
    { id: "ORD-002", table: "Table 12", items: 2, total: 34.00, status: "ready" },
    { id: "ORD-003", table: "Takeout", items: 6, total: 92.25, status: "pending" },
    { id: "ORD-004", table: "Table 3", items: 3, total: 56.00, status: "served" },
  ];

  const upcomingReservations = [
    { name: "John Smith", time: "6:00 PM", party: 4, table: "Table 8" },
    { name: "Sarah Johnson", time: "6:30 PM", party: 2, table: "Table 3" },
    { name: "Mike Wilson", time: "7:00 PM", party: 6, table: "Table 10" },
    { name: "Emily Brown", time: "7:30 PM", party: 4, table: "Table 5" },
  ];

  const alerts = [
    { type: "warning", message: "Chicken breast stock is low (5 lbs remaining)" },
    { type: "info", message: "New 5-star review received on Google" },
    { type: "warning", message: "Staff member Jake called in sick for evening shift" },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "preparing":
        return <Badge variant="warning" className="bg-yellow-500">Preparing</Badge>;
      case "ready":
        return <Badge variant="success">Ready</Badge>;
      case "served":
        return <Badge variant="default">Served</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Stats Grid - clickable cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <Card
              key={index}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(stat.href)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {stat.trend === "up" && <TrendingUp className="h-3 w-3 text-green-500" />}
                  {stat.change}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Orders */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Orders</CardTitle>
                  <CardDescription>Latest orders in the system</CardDescription>
                </div>
                <Link href="/orders">
                  <Button variant="outline" size="sm">View All</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -mx-2"
                    onClick={() => openOrderDetail(order)}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{order.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.table} &bull; {order.items} items
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">${order.total.toFixed(2)}</span>
                      {getStatusBadge(order.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Reservations */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Upcoming Reservations</CardTitle>
                  <CardDescription>Next reservations for today</CardDescription>
                </div>
                <Link href="/reservations">
                  <Button variant="outline" size="sm">View All</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {upcomingReservations.map((reservation, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -mx-2"
                    onClick={() => openReservationDetail(reservation)}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{reservation.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Party of {reservation.party} &bull; {reservation.table}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {reservation.time}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alerts Section */}
        <Card>
          <CardHeader>
            <CardTitle>Alerts & Notifications</CardTitle>
            <CardDescription>Important updates requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map((alert, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-3 rounded-lg p-3 ${
                    alert.type === "warning" ? "bg-yellow-50" : "bg-blue-50"
                  }`}
                >
                  {alert.type === "warning" ? (
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  ) : (
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                  )}
                  <span className="text-sm">{alert.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions - with navigation */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => router.push("/orders")}>New Order</Button>
              <Button variant="outline" onClick={() => router.push("/reservations")}>Add Reservation</Button>
              <Button variant="outline" onClick={() => router.push("/menu")}>86 an Item</Button>
              <Button variant="outline" onClick={() => router.push("/kitchen")}>View Kitchen Display</Button>
              <Button variant="outline" onClick={() => router.push("/reports")}>Run End-of-Day Report</Button>
            </div>
          </CardContent>
        </Card>

        {/* Order Detail Dialog */}
        <Dialog open={isOrderDetailOpen} onOpenChange={setIsOrderDetailOpen}>
          <DialogContent className="max-w-sm">
            {detailOrder && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {detailOrder.id}
                    {getStatusBadge(detailOrder.status)}
                  </DialogTitle>
                  <DialogDescription>
                    {detailOrder.table}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-2xl font-bold">${detailOrder.total.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-2xl font-bold">{detailOrder.items}</p>
                      <p className="text-xs text-muted-foreground">Items</p>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    onClick={() => {
                      setIsOrderDetailOpen(false);
                      router.push("/orders");
                    }}
                    className="w-full"
                  >
                    View Full Order Details
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Reservation Detail Dialog */}
        <Dialog open={isReservationDetailOpen} onOpenChange={setIsReservationDetailOpen}>
          <DialogContent className="max-w-sm">
            {detailReservation && (
              <>
                <DialogHeader>
                  <DialogTitle>{detailReservation.name}</DialogTitle>
                  <DialogDescription>Upcoming Reservation</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <p className="text-lg font-bold">{detailReservation.time}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">Time</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <p className="text-lg font-bold">{detailReservation.party}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">Guests</p>
                    </div>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="font-medium">{detailReservation.table}</p>
                    <p className="text-xs text-muted-foreground">Table Assignment</p>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    onClick={() => {
                      setIsReservationDetailOpen(false);
                      router.push("/reservations");
                    }}
                    className="w-full"
                  >
                    View Full Reservation
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
