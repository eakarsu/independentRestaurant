"use client";

import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { Gift, Star, TrendingUp, Users, Crown, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  vipStatus: boolean;
  loyaltyPoints: {
    id: string;
    points: number;
    tier: string;
    lifetimePoints: number;
  } | null;
}

const TIER_COLORS: Record<string, string> = {
  BRONZE: "bg-amber-600",
  SILVER: "bg-gray-400",
  GOLD: "bg-yellow-500",
  PLATINUM: "bg-purple-500",
};

const TIER_THRESHOLDS = {
  BRONZE: 0,
  SILVER: 500,
  GOLD: 1500,
  PLATINUM: 5000,
};

export default function LoyaltyPage() {
  const requestKey = useRef<{body:string;key:string}|null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [pointsToAdd, setPointsToAdd] = useState("");

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const res = await fetch("/api/customers");
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Error", description: "Failed to load customers", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAddPoints = async () => {
    if (!selectedCustomer || !pointsToAdd) return;

    try {
      const signature = `${selectedCustomer.id}:${pointsToAdd}`;
      if (requestKey.current?.body !== signature) requestKey.current = {body: signature, key: crypto.randomUUID()};
      const response = await fetch(`/api/customers/${selectedCustomer.id}/loyalty`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey.current!.key },
        body: JSON.stringify({
          points: parseInt(pointsToAdd),
          type: "earned",
          description: "Manual points addition",
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Points update failed");
      requestKey.current = null;
      toast({ title: "Success", description: `Added ${pointsToAdd} points` });
      setPointsToAdd("");
      fetchCustomers();
      setIsDetailOpen(false);
    } catch {
      toast({ title: "Error", description: "Failed to add points", variant: "destructive" });
    }
  };

  const openDetail = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDetailOpen(true);
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    totalMembers: customers.filter((c) => c.loyaltyPoints).length,
    totalPoints: customers.reduce((sum, c) => sum + (c.loyaltyPoints?.points || 0), 0),
    goldMembers: customers.filter((c) => c.loyaltyPoints?.tier === "GOLD" || c.loyaltyPoints?.tier === "PLATINUM").length,
    avgPoints: Math.round(
      customers.reduce((sum, c) => sum + (c.loyaltyPoints?.points || 0), 0) /
        Math.max(customers.filter((c) => c.loyaltyPoints).length, 1)
    ),
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Loyalty Program" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Loyalty Program</h2>
            <p className="text-muted-foreground">Manage customer rewards and points</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalMembers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Points</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPoints.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gold+ Members</CardTitle>
              <Crown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.goldMembers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Points</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgPoints}</div>
            </CardContent>
          </Card>
        </div>

        {/* Tier Info */}
        <Card>
          <CardHeader>
            <CardTitle>Tier Benefits</CardTitle>
            <CardDescription>Points required for each tier level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              {Object.entries(TIER_THRESHOLDS).map(([tier, points]) => (
                <div key={tier} className="p-4 rounded-lg bg-muted/50 text-center">
                  <Badge className={TIER_COLORS[tier]}>{tier}</Badge>
                  <p className="mt-2 text-2xl font-bold">{points}+</p>
                  <p className="text-xs text-muted-foreground">lifetime points</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Members Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Current Points</TableHead>
                  <TableHead>Lifetime Points</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow key={customer.id} className="cursor-pointer" onClick={() => openDetail(customer)}>
                    <TableCell className="font-medium">
                      {customer.firstName} {customer.lastName}
                      {customer.vipStatus && <Badge variant="outline" className="ml-2">VIP</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>{customer.email}</p>
                        <p className="text-muted-foreground">{customer.phone}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {customer.loyaltyPoints && (
                        <Badge className={TIER_COLORS[customer.loyaltyPoints.tier]}>
                          {customer.loyaltyPoints.tier}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-bold">
                      {customer.loyaltyPoints?.points.toLocaleString() || 0}
                    </TableCell>
                    <TableCell>
                      {customer.loyaltyPoints?.lifetimePoints.toLocaleString() || 0}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" onClick={() => openDetail(customer)}>
                        <Gift className="h-4 w-4 mr-1" /> Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent>
            {selectedCustomer && (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {selectedCustomer.firstName} {selectedCustomer.lastName}
                  </DialogTitle>
                  <DialogDescription>Manage loyalty points</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-3xl font-bold">{selectedCustomer.loyaltyPoints?.points || 0}</p>
                      <p className="text-sm text-muted-foreground">Current Points</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      {selectedCustomer.loyaltyPoints && (
                        <Badge className={`${TIER_COLORS[selectedCustomer.loyaltyPoints.tier]} text-lg px-4 py-2`}>
                          {selectedCustomer.loyaltyPoints.tier}
                        </Badge>
                      )}
                      <p className="text-sm text-muted-foreground mt-2">Current Tier</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Points to add"
                      value={pointsToAdd}
                      onChange={(e) => setPointsToAdd(e.target.value)}
                    />
                    <Button onClick={handleAddPoints}>Add Points</Button>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Lifetime Points</p>
                    <p className="text-xl font-bold">{selectedCustomer.loyaltyPoints?.lifetimePoints || 0}</p>
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
