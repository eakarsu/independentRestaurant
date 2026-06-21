"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { Truck, MapPin, Clock, Phone, CheckCircle, Package, Navigation } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface DeliveryOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  delivery: {
    id: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    driverName: string | null;
    driverPhone: string | null;
    estimatedTime: string | null;
    deliveredAt: string | null;
    platform: string | null;
    instructions: string | null;
  } | null;
  items: { id: string; quantity: number; menuItem: { name: string } }[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "secondary",
  CONFIRMED: "default",
  PREPARING: "warning",
  READY: "success",
  OUT_FOR_DELIVERY: "info",
  DELIVERED: "success",
};

export default function DeliveriesPage() {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    fetchOrders();
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchOrders = async () => {
    try {
      // /api/orders returns a paginated object ({ data, pagination }), not a bare array.
      const res = await fetch("/api/orders?type=DELIVERY&pageSize=200");
      const json = await res.json();
      setOrders(Array.isArray(json) ? json : (json?.data ?? []));
    } catch {
      toast({ title: "Error", description: "Failed to load deliveries", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, status: string) => {
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      toast({ title: "Success", description: "Status updated" });
      fetchOrders();
    } catch {
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    }
  };

  const handleMarkDelivered = async (orderId: string) => {
    try {
      await fetch(`/api/orders/${orderId}/delivery`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveredAt: new Date().toISOString() }),
      });
      await handleUpdateStatus(orderId, "COMPLETED");
    } catch {
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    }
  };

  const openDetail = (order: DeliveryOrder) => {
    setSelectedOrder(order);
    setIsDetailOpen(true);
  };

  const activeDeliveries = orders.filter(o => !["COMPLETED", "CANCELLED"].includes(o.status));
  const completedDeliveries = orders.filter(o => ["COMPLETED", "CANCELLED"].includes(o.status));

  const stats = {
    active: activeDeliveries.length,
    outForDelivery: orders.filter(o => o.status === "READY").length,
    delivered: completedDeliveries.filter(o => o.status === "COMPLETED").length,
    avgTime: "32 min",
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Delivery Tracking" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Delivery Orders</h2>
            <p className="text-muted-foreground">Track and manage delivery orders in real-time</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Deliveries</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ready for Pickup</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.outForDelivery}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivered Today</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.delivered}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Delivery Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgTime}</div>
            </CardContent>
          </Card>
        </div>

        {/* Active Deliveries */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Active Deliveries</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeDeliveries.map((order) => (
              <Card key={order.id} className="cursor-pointer hover:shadow-md" onClick={() => openDetail(order)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{order.orderNumber}</CardTitle>
                    <Badge variant={STATUS_COLORS[order.status] as "default" | "secondary" | "destructive" | "outline"}>
                      {order.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <CardDescription>
                    {order.delivery?.platform || "Direct"} | {formatTime(order.createdAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {order.delivery && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <p>{order.delivery.address}</p>
                        <p className="text-muted-foreground">
                          {order.delivery.city}, {order.delivery.state} {order.delivery.zipCode}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <span>{order.items.length} items</span>
                    <span className="font-bold">{formatCurrency(order.total)}</span>
                  </div>

                  {order.delivery?.driverName && (
                    <div className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded">
                      <Truck className="h-4 w-4" />
                      <span>{order.delivery.driverName}</span>
                      {order.delivery.driverPhone && (
                        <a href={`tel:${order.delivery.driverPhone}`} className="ml-auto">
                          <Phone className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {order.status === "PREPARING" && (
                      <Button size="sm" onClick={() => handleUpdateStatus(order.id, "READY")}>
                        Mark Ready
                      </Button>
                    )}
                    {order.status === "READY" && (
                      <Button size="sm" onClick={() => handleMarkDelivered(order.id)}>
                        <CheckCircle className="mr-1 h-3 w-3" /> Delivered
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {activeDeliveries.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center text-muted-foreground">
                  No active deliveries
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-md">
            {selectedOrder && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    {selectedOrder.orderNumber}
                  </DialogTitle>
                  <DialogDescription>Delivery Details</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge>{selectedOrder.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total</span>
                      <span className="font-bold">{formatCurrency(selectedOrder.total)}</span>
                    </div>
                  </div>

                  {selectedOrder.delivery && (
                    <>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          <MapPin className="h-4 w-4" /> Delivery Address
                        </h4>
                        <div className="p-3 bg-muted/50 rounded-lg text-sm">
                          <p>{selectedOrder.delivery.address}</p>
                          <p>{selectedOrder.delivery.city}, {selectedOrder.delivery.state} {selectedOrder.delivery.zipCode}</p>
                          {selectedOrder.delivery.instructions && (
                            <p className="mt-2 text-muted-foreground">
                              Note: {selectedOrder.delivery.instructions}
                            </p>
                          )}
                        </div>
                      </div>

                      {selectedOrder.delivery.estimatedTime && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4" />
                          <span>ETA: {formatTime(selectedOrder.delivery.estimatedTime)}</span>
                        </div>
                      )}
                    </>
                  )}

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Items</h4>
                    <div className="space-y-1">
                      {selectedOrder.items.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                          <span>{item.quantity}x {item.menuItem.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
