"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { Clock, CheckCircle, ChefHat, Bell, RefreshCw } from "lucide-react";

interface OrderItem {
  id: string;
  menuItem: { name: string };
  quantity: number;
  notes: string | null;
  status: string;
}

interface Order {
  id: string;
  orderNumber: string;
  type: string;
  table: { number: number } | null;
  items: OrderItem[];
  createdAt: string;
  status: string;
}

export default function KitchenDisplayPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/orders?status=CONFIRMED&status=PREPARING");
      const data = await res.json();
      setOrders(Array.isArray(data) ? data.filter((o: Order) => ["CONFIRMED", "PREPARING"].includes(o.status)) : []);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartPrep = async (orderId: string) => {
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PREPARING" }),
      });
      toast({ title: "Order Started", description: "Marked as preparing" });
      fetchOrders();
    } catch (error) {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const handleMarkReady = async (orderId: string) => {
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "READY" }),
      });
      toast({ title: "Order Ready", description: "Marked as ready for service" });
      fetchOrders();
    } catch (error) {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const getTimeSince = (dateStr: string) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    return mins < 1 ? "Just now" : `${mins} min`;
  };

  const getTimeColor = (dateStr: string) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 5) return "text-green-600";
    if (mins < 10) return "text-yellow-600";
    return "text-red-600";
  };

  const newOrders = orders.filter((o) => o.status === "CONFIRMED");
  const inProgress = orders.filter((o) => o.status === "PREPARING");

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      <div className="bg-gray-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <ChefHat className="h-8 w-8 text-orange-500" />
          <h1 className="text-2xl font-bold">Kitchen Display</h1>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-white border-white">
            {orders.length} Active Orders
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchOrders} className="text-white border-white">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* New Orders */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-orange-500">
              <Bell className="h-5 w-5" /> New Orders ({newOrders.length})
            </h2>
            <div className="space-y-4">
              {newOrders.map((order) => (
                <Card key={order.id} className="bg-gray-800 border-orange-500 border-2">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-white">
                        {order.orderNumber}
                        <span className="ml-2 text-sm font-normal text-gray-400">
                          {order.table ? `Table ${order.table.number}` : order.type}
                        </span>
                      </CardTitle>
                      <span className={`font-bold ${getTimeColor(order.createdAt)}`}>
                        <Clock className="h-4 w-4 inline mr-1" />
                        {getTimeSince(order.createdAt)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 mb-4">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex justify-between text-gray-200">
                          <span>
                            <span className="font-bold text-orange-400">{item.quantity}x</span> {item.menuItem.name}
                          </span>
                          {item.notes && <span className="text-yellow-400 text-sm">📝 {item.notes}</span>}
                        </div>
                      ))}
                    </div>
                    <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={() => handleStartPrep(order.id)}>
                      <ChefHat className="mr-2 h-4 w-4" /> Start Preparing
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {newOrders.length === 0 && (
                <div className="text-center py-12 text-gray-500">No new orders</div>
              )}
            </div>
          </div>

          {/* In Progress */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-yellow-500">
              <ChefHat className="h-5 w-5" /> In Progress ({inProgress.length})
            </h2>
            <div className="space-y-4">
              {inProgress.map((order) => (
                <Card key={order.id} className="bg-gray-800 border-yellow-500 border-2">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-white">
                        {order.orderNumber}
                        <span className="ml-2 text-sm font-normal text-gray-400">
                          {order.table ? `Table ${order.table.number}` : order.type}
                        </span>
                      </CardTitle>
                      <span className={`font-bold ${getTimeColor(order.createdAt)}`}>
                        <Clock className="h-4 w-4 inline mr-1" />
                        {getTimeSince(order.createdAt)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 mb-4">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex justify-between text-gray-200">
                          <span>
                            <span className="font-bold text-yellow-400">{item.quantity}x</span> {item.menuItem.name}
                          </span>
                          {item.notes && <span className="text-yellow-400 text-sm">📝 {item.notes}</span>}
                        </div>
                      ))}
                    </div>
                    <Button className="w-full bg-green-500 hover:bg-green-600" onClick={() => handleMarkReady(order.id)}>
                      <CheckCircle className="mr-2 h-4 w-4" /> Mark Ready
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {inProgress.length === 0 && (
                <div className="text-center py-12 text-gray-500">No orders in progress</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
