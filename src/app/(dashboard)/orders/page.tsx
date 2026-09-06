"use client";

import { OrderFinance } from "@/components/operations/order-finance";
import { useMutationFetch } from "@/components/operations/use-mutation-fetch";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/use-toast";
import { Pagination } from "@/components/ui/pagination";
import { SortHeader } from "@/components/ui/sort-header";
import { SkeletonTable, SkeletonCard } from "@/components/ui/skeleton-table";
import { ConfirmationDialog, useConfirmation } from "@/components/ui/confirmation-dialog";
import { ErrorBoundary } from "@/components/error-boundary";
import { exportToPDF } from "@/lib/pdf-export";
import {
  Plus, Minus, ShoppingCart, Clock, ChefHat,
  CheckCircle, XCircle, Printer, CreditCard, Trash2,
  FileDown,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: { id: string; name: string };
  isAvailable: boolean;
  is86d: boolean;
}

interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

interface OrderItem {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes: string | null;
  status: string;
}

interface Order {
  pickupAt?: string | null;
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  tax: number;
  discount: number;
  tip: number;
  total: number;
  table: { id: string; number: number } | null;
  items: OrderItem[];
  createdAt: string;
}

interface TableData {
  id: string;
  number: number;
  status: string;
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  notes: string;
}

function OrdersPageContent() {
  const mutationFetch = useMutationFetch();
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [tables, setTables] = useState<TableData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewOrderDialogOpen, setIsNewOrderDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<string>("DINE_IN");
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [activeTab, setActiveTab] = useState("active");
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  // Pagination state (for completed orders)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Sort state
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulkMode = false;

  // Confirmation dialog
  const { state: confirmState, confirm, close: closeConfirm } = useConfirmation();

  const openOrderDetail = (order: Order) => {
    setDetailOrder(order);
    setIsDetailSheetOpen(true);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        sortBy,
        sortDirection,
      });

      const [ordersRes, categoriesRes, tablesRes] = await Promise.all([
        fetch(`/api/orders?${params}`),
        fetch("/api/menu/categories"),
        fetch("/api/tables"),
      ]);

      const [ordersResult, categoriesData, tablesData] = await Promise.all([
        ordersRes.json(),
        categoriesRes.json(),
        tablesRes.json(),
      ]);

      if (ordersResult.data) {
        setOrders(ordersResult.data);
        setTotalItems(ordersResult.pagination.totalItems);
        setTotalPages(ordersResult.pagination.totalPages);
      } else {
        const data = Array.isArray(ordersResult) ? ordersResult : [];
        setOrders(data);
        setTotalItems(data.length);
        setTotalPages(1);
      }

      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      setTables(Array.isArray(tablesData) ? tablesData : []);
      if (categoriesData.length > 0 && !selectedCategory) {
        setSelectedCategory(categoriesData[0].id);
      }
    } catch {
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, sortBy, sortDirection]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
    const completedOrders = orders.filter((o) => ["COMPLETED", "CANCELLED"].includes(o.status));
    if (selectedIds.size === completedOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(completedOrders.map((o) => o.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // PDF Export
  const handleExportPDF = () => {
    exportToPDF({
      title: "Orders Report",
      subtitle: `${totalItems} orders | Generated from RestaurantAI`,
      filename: "orders-report.pdf",
      orientation: "landscape",
      columns: [
        { header: "Order #", field: "orderNumber" },
        { header: "Type", field: "type" },
        { header: "Items", field: "itemCount" },
        { header: "Subtotal", field: "subtotal", format: (v: unknown) => `$${(v as number).toFixed(2)}` },
        { header: "Tax", field: "tax", format: (v: unknown) => `$${(v as number).toFixed(2)}` },
        { header: "Total", field: "total", format: (v: unknown) => `$${(v as number).toFixed(2)}` },
        { header: "Status", field: "status" },
        { header: "Payment", field: "paymentStatus" },
        { header: "Date", field: "date" },
      ],
      data: orders.map((o) => ({
        orderNumber: o.orderNumber,
        type: o.type,
        itemCount: `${o.items.length} items`,
        subtotal: o.subtotal,
        tax: o.tax,
        total: o.total,
        status: o.status,
        paymentStatus: o.paymentStatus,
        date: new Date(o.createdAt).toLocaleString(),
      })),
    });
    toast({ title: "Export Complete", description: "PDF has been downloaded" });
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const addToCart = (item: MenuItem) => {
    if (item.is86d || !item.isAvailable) {
      toast({ title: "Item Unavailable", description: "This item is currently not available", variant: "destructive" });
      return;
    }
    setCart((prev) => {
      const existingIndex = prev.findIndex((cartItem) => cartItem.menuItem.id === item.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex].quantity += 1;
        return updated;
      }
      return [...prev, { menuItem: item, quantity: 1, notes: "" }];
    });
  };

  const updateCartQuantity = (itemId: string, delta: number) => {
    setCart((prev) => {
      const updated = prev.map((item) => {
        if (item.menuItem.id === itemId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as CartItem[];
      return updated;
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((item) => item.menuItem.id !== itemId));
  };

  const calculateCartTotal = () => {
    const subtotal = cart.reduce((sum, item) => sum + item.menuItem.price * item.quantity, 0);
    const tax = subtotal * 0.0875;
    return { subtotal, tax, total: subtotal + tax };
  };

  const handleCreateOrder = async () => {
    if (cart.length === 0) {
      toast({ title: "Empty Cart", description: "Add items to create an order", variant: "destructive" });
      return;
    }
    if (orderType === "DINE_IN" && !selectedTable) {
      toast({ title: "Select Table", description: "Please select a table for dine-in orders", variant: "destructive" });
      return;
    }
    try {
      const response = await mutationFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: orderType,
          tableId: orderType === "DINE_IN" ? selectedTable : null,
          items: cart.map((item) => ({
            menuItemId: item.menuItem.id,
            quantity: item.quantity,
            notes: item.notes,
            modifierIds: [],
          })),
        }),
      });
      if (response.ok) {
        toast({ title: "Success", description: "Order created successfully" });
        setIsNewOrderDialogOpen(false);
        setCart([]);
        setSelectedTable("");
        fetchData();
      } else {
        throw new Error("Failed to create order");
      }
    } catch {
      toast({ title: "Error", description: "Failed to create order", variant: "destructive" });
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    if (status === "CANCELLED") {
      confirm({
        title: "Cancel Order",
        description: "Are you sure you want to cancel this order? This action cannot be undone.",
        variant: "danger",
        confirmLabel: "Cancel Order",
        onConfirm: async () => {
          try {
            const response = await mutationFetch(`/api/orders/${orderId}/actions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ toStatus: status, reason: "Cancelled by restaurant operator" }),
            });
            if (response.ok) {
              toast({ title: "Success", description: "Order cancelled" });
              fetchData();
            }
          } catch {
            toast({ title: "Error", description: "Failed to cancel order", variant: "destructive" });
          }
          closeConfirm();
        },
      });
      return;
    }

    try {
      const response = await mutationFetch(`/api/orders/${orderId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus: status }),
      });
      if (response.ok) {
        toast({ title: "Success", description: `Order status updated to ${status.toLowerCase()}` });
        fetchData();
      }
    } catch {
      toast({ title: "Error", description: "Failed to update order status", variant: "destructive" });
    }
  };

  const handlePayOrder = async (orderId: string) => {
    try {
      const response = await mutationFetch(`/api/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        const payment = await response.json();
        if (payment.redirectUrl) {const url=new URL(payment.redirectUrl);if(url.protocol!=="https:"||url.hostname!=="checkout.stripe.com")throw Error("Unexpected payment destination");window.location.assign(url.href);}
        else {
          toast({ title: "Payment started", description: "Complete the authorization in the connected payment client." });
          fetchData();
        }
      }
      else {const result=await response.json();throw Error(result.error||"Payment outcome not confirmed");}
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error?error.message:"Payment outcome not confirmed", variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"; label: string }> = {
      PENDING: { variant: "secondary", label: "Pending" },
      CONFIRMED: { variant: "default", label: "Confirmed" },
      PAYMENT_PENDING: { variant: "warning", label: "Payment pending" },
      PAYMENT_FAILED: { variant: "destructive", label: "Payment failed" },
      PREPARING: { variant: "warning", label: "Preparing" },
      READY: { variant: "success", label: "Ready" },
      SERVED: { variant: "outline", label: "Served" },
      COMPLETED: { variant: "default", label: "Completed" },
      FULFILLMENT_FAILED: { variant: "destructive", label: "Fulfillment failed" },
      EXCEPTION: { variant: "destructive", label: "Exception" },
      REFUND_PENDING: { variant: "warning", label: "Refund pending" },
      REFUNDED: { variant: "outline", label: "Refunded" },
      CANCELLED: { variant: "destructive", label: "Cancelled" },
    };
    const config = statusConfig[status] || { variant: "secondary" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPaymentBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"; label: string }> = {
      UNPAID: { variant: "destructive", label: "Unpaid" },
      AUTHORIZING: { variant: "warning", label: "Authorizing" },
      FAILED: { variant: "destructive", label: "Failed" },
      PARTIAL: { variant: "warning", label: "Partial" },
      PAID: { variant: "success", label: "Paid" },
      PARTIALLY_REFUNDED: { variant: "warning", label: "Partially refunded" },
      REFUNDED: { variant: "outline", label: "Refunded" },
    };
    const config = statusConfig[status] || { variant: "secondary" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const activeOrders = orders.filter((o) => !["COMPLETED", "CANCELLED"].includes(o.status));
  const completedOrders = orders.filter((o) => ["COMPLETED", "CANCELLED"].includes(o.status));
  const cartTotals = calculateCartTotal();

  const currentCategory = categories.find((c) => c.id === selectedCategory);
  const menuItems = currentCategory?.items.filter((item) => !item.is86d) || [];

  return (
    <div className="flex flex-col h-full">
      <Header title="Orders" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Order Management</h2>
            <p className="text-muted-foreground">{totalItems} total orders</p>
          </div>
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileDown className="mr-2 h-4 w-4" /> PDF
            </Button>
            <Dialog open={isNewOrderDialogOpen} onOpenChange={setIsNewOrderDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> New Order
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>Create New Order</DialogTitle>
                  <DialogDescription>Select items to add to the order</DialogDescription>
                </DialogHeader>

                <div className="flex-1 flex gap-4 overflow-hidden">
                  <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex gap-2 mb-4">
                      <Select value={orderType} onValueChange={setOrderType}>
                        <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DINE_IN">Dine In</SelectItem>
                          <SelectItem value="TAKEOUT">Takeout</SelectItem>
                          <SelectItem value="DELIVERY">Delivery</SelectItem>
                        </SelectContent>
                      </Select>
                      {orderType === "DINE_IN" && (
                        <Select value={selectedTable} onValueChange={setSelectedTable}>
                          <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Select Table" />
                          </SelectTrigger>
                          <SelectContent>
                            {tables
                              .filter((t) => t.status === "AVAILABLE" || t.status === "OCCUPIED")
                              .map((table) => (
                                <SelectItem key={table.id} value={table.id}>
                                  Table {table.number}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <div className="flex gap-2 mb-4 flex-wrap">
                      {categories.map((cat) => (
                        <Button key={cat.id} variant={selectedCategory === cat.id ? "default" : "outline"} size="sm" onClick={() => setSelectedCategory(cat.id)}>
                          {cat.name}
                        </Button>
                      ))}
                    </div>

                    <ScrollArea className="flex-1">
                      <div className="grid grid-cols-2 gap-2 pr-4">
                        {menuItems.map((item) => (
                          <Card key={item.id} className={`cursor-pointer transition-colors ${!item.isAvailable ? "opacity-50" : "hover:bg-accent"}`} onClick={() => addToCart(item)}>
                            <CardContent className="p-3">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-medium">{item.name}</p>
                                  <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                                </div>
                                <p className="font-bold">{formatCurrency(item.price)}</p>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        {menuItems.length === 0 && (
                          <div className="col-span-2 text-center py-8 text-muted-foreground">
                            No items in this category
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="w-80 flex flex-col border-l pl-4">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4" /> Order Items
                    </h3>
                    <ScrollArea className="flex-1">
                      {cart.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No items added</p>
                      ) : (
                        <div className="space-y-2 pr-4">
                          {cart.map((item) => (
                            <Card key={item.menuItem.id}>
                              <CardContent className="p-3">
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <p className="font-medium">{item.menuItem.name}</p>
                                    <p className="text-sm text-muted-foreground">{formatCurrency(item.menuItem.price)} each</p>
                                  </div>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFromCart(item.menuItem.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateCartQuantity(item.menuItem.id, -1)}>
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <span className="w-8 text-center">{item.quantity}</span>
                                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateCartQuantity(item.menuItem.id, 1)}>
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  <p className="font-bold">{formatCurrency(item.menuItem.price * item.quantity)}</p>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatCurrency(cartTotals.subtotal)}</span></div>
                      <div className="flex justify-between text-sm"><span>Tax (8.75%)</span><span>{formatCurrency(cartTotals.tax)}</span></div>
                      <div className="flex justify-between font-bold"><span>Total</span><span>{formatCurrency(cartTotals.total)}</span></div>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsNewOrderDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateOrder} disabled={cart.length === 0}>Create Order</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="active">Active Orders ({activeOrders.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedOrders.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeOrders.map((order) => (
                  <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openOrderDetail(order)}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{order.orderNumber}</CardTitle>
                        {getStatusBadge(order.status)}
                      </div>
                      <CardDescription>
                        {order.type} {order.table && `• Table ${order.table.number}`} {order.pickupAt && `· Pickup ${new Date(order.pickupAt).toLocaleString()}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 mb-4">
                        {order.items.slice(0, 3).map((item) => (
                          <div key={item.id} className="flex justify-between text-sm">
                            <span>{item.quantity}x {item.menuItem.name}</span>
                            <span>{formatCurrency(item.totalPrice)}</span>
                          </div>
                        ))}
                        {order.items.length > 3 && (
                          <p className="text-sm text-muted-foreground">+{order.items.length - 3} more items</p>
                        )}
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-bold mb-4">
                        <span>Total</span>
                        <span>{formatCurrency(order.total)}</span>
                      </div>
                      <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {order.status === "PENDING" && (
                          <Button size="sm" onClick={() => handleUpdateOrderStatus(order.id, "CONFIRMED")}>Confirm</Button>
                        )}
                        {order.status === "CONFIRMED" && (
                          <Button size="sm" onClick={() => handleUpdateOrderStatus(order.id, "PREPARING")}>
                            <ChefHat className="mr-1 h-3 w-3" /> Start Prep
                          </Button>
                        )}
                        {order.status === "PREPARING" && (
                          <Button size="sm" onClick={() => handleUpdateOrderStatus(order.id, "READY")}>
                            <CheckCircle className="mr-1 h-3 w-3" /> Ready
                          </Button>
                        )}
                        {order.status === "READY" && (
                          <Button size="sm" onClick={() => handleUpdateOrderStatus(order.id, "SERVED")}>Serve</Button>
                        )}
                        {["CONFIRMED", "READY", "SERVED"].includes(order.status) && ["UNPAID", "FAILED"].includes(order.paymentStatus) && (
                            <Button size="sm" onClick={() => handlePayOrder(order.id)}>
                              <CreditCard className="mr-1 h-3 w-3" /> Pay Card
                            </Button>
                        )}
                        {order.paymentStatus === "PAID" && order.status !== "COMPLETED" && (
                          <Button size="sm" onClick={() => handleUpdateOrderStatus(order.id, "COMPLETED")}>Complete</Button>
                        )}
                        {order.status === "PENDING" && (
                          <Button size="sm" variant="ghost" onClick={() => handleUpdateOrderStatus(order.id, "CANCELLED")}>
                            <XCircle className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                      <div className="mt-2">{getPaymentBadge(order.paymentStatus)}</div>
                    </CardContent>
                  </Card>
                ))}
                {activeOrders.length === 0 && (
                  <Card className="col-span-full">
                    <CardContent className="py-8 text-center text-muted-foreground">No active orders</CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed">
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
                                checked={selectedIds.size === completedOrders.length && completedOrders.length > 0}
                                onCheckedChange={toggleSelectAll}
                              />
                            </TableHead>
                          )}
                          <TableHead>
                            <SortHeader label="Order #" field="orderNumber" currentSort={sortBy} currentDirection={sortDirection} onSort={handleSort} />
                          </TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead>
                            <SortHeader label="Total" field="total" currentSort={sortBy} currentDirection={sortDirection} onSort={handleSort} />
                          </TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>
                            <SortHeader label="Time" field="createdAt" currentSort={sortBy} currentDirection={sortDirection} onSort={handleSort} />
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {completedOrders.map((order) => (
                          <TableRow
                            key={order.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => !bulkMode && openOrderDetail(order)}
                          >
                            {bulkMode && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedIds.has(order.id)}
                                  onCheckedChange={() => toggleSelect(order.id)}
                                />
                              </TableCell>
                            )}
                            <TableCell className="font-medium">{order.orderNumber}</TableCell>
                            <TableCell>{order.type}</TableCell>
                            <TableCell>{order.items.length} items</TableCell>
                            <TableCell>{formatCurrency(order.total)}</TableCell>
                            <TableCell>{getStatusBadge(order.status)}</TableCell>
                            <TableCell>{getPaymentBadge(order.paymentStatus)}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(order.createdAt).toLocaleTimeString()}
                            </TableCell>
                          </TableRow>
                        ))}
                        {completedOrders.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={bulkMode ? 9 : 8} className="text-center py-8 text-muted-foreground">
                              No completed orders
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
        </Tabs>

        {/* Order Detail Dialog */}
        <Dialog open={isDetailSheetOpen} onOpenChange={setIsDetailSheetOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            {detailOrder && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {detailOrder.orderNumber}
                    {getStatusBadge(detailOrder.status)}
                  </DialogTitle>
                  <DialogDescription>
                    {detailOrder.type} {detailOrder.table && `• Table ${detailOrder.table.number}`} {detailOrder.pickupAt && `· Pickup ${new Date(detailOrder.pickupAt).toLocaleString()}`}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                    <div>
                      <span className="text-sm text-muted-foreground">Created</span>
                      <p className="font-medium">{new Date(detailOrder.createdAt).toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Payment</span>
                      <div className="mt-1">{getPaymentBadge(detailOrder.paymentStatus)}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Items ({detailOrder.items.length})</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {detailOrder.items.map((item) => (
                        <div key={item.id} className="flex justify-between items-start p-3 bg-muted/50 rounded-lg">
                          <div className="flex-1">
                            <p className="font-medium">{item.quantity}x {item.menuItem.name}</p>
                            {item.notes && <p className="text-xs text-muted-foreground">Note: {item.notes}</p>}
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatCurrency(item.totalPrice)}</p>
                            <Badge variant="outline" className="text-xs">{item.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg space-y-1 text-sm">
                    <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(detailOrder.subtotal)}</span></div>
                    <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(detailOrder.tax)}</span></div>
                    {detailOrder.discount > 0 && (
                      <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatCurrency(detailOrder.discount)}</span></div>
                    )}
                    {detailOrder.tip > 0 && (
                      <div className="flex justify-between"><span>Tip</span><span>{formatCurrency(detailOrder.tip)}</span></div>
                    )}
                    <Separator className="my-2" />
                    <div className="flex justify-between font-bold text-lg"><span>Total</span><span>{formatCurrency(detailOrder.total)}</span></div>
                  </div>
                </div>

                <OrderFinance key={detailOrder.id} orderId={detailOrder.id}/>
                <DialogFooter className="flex-wrap gap-2">
                  {detailOrder.status === "PENDING" && (
                    <Button size="sm" onClick={() => { handleUpdateOrderStatus(detailOrder.id, "CONFIRMED"); setIsDetailSheetOpen(false); }}>
                      Confirm Order
                    </Button>
                  )}
                  {detailOrder.status === "CONFIRMED" && (
                    <Button size="sm" onClick={() => { handleUpdateOrderStatus(detailOrder.id, "PREPARING"); setIsDetailSheetOpen(false); }}>
                      <ChefHat className="mr-1 h-3 w-3" /> Start Prep
                    </Button>
                  )}
                  {detailOrder.status === "PREPARING" && (
                    <Button size="sm" onClick={() => { handleUpdateOrderStatus(detailOrder.id, "READY"); setIsDetailSheetOpen(false); }}>
                      <CheckCircle className="mr-1 h-3 w-3" /> Mark Ready
                    </Button>
                  )}
                  {detailOrder.status === "READY" && (
                    <Button size="sm" onClick={() => { handleUpdateOrderStatus(detailOrder.id, "SERVED"); setIsDetailSheetOpen(false); }}>
                      Serve
                    </Button>
                  )}
                  {["CONFIRMED", "READY", "SERVED"].includes(detailOrder.status) && ["UNPAID", "FAILED"].includes(detailOrder.paymentStatus) && (
                      <Button size="sm" onClick={() => { handlePayOrder(detailOrder.id); setIsDetailSheetOpen(false); }}>
                        <CreditCard className="mr-1 h-3 w-3" /> Pay Card
                      </Button>
                  )}
                  {detailOrder.status === "PENDING" && (
                    <Button size="sm" variant="destructive" onClick={() => { handleUpdateOrderStatus(detailOrder.id, "CANCELLED"); setIsDetailSheetOpen(false); }}>
                      <XCircle className="mr-1 h-3 w-3" /> Cancel
                    </Button>
                  )}
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

export default function OrdersPage() {
  return (
    <ErrorBoundary>
      <OrdersPageContent />
    </ErrorBoundary>
  );
}
