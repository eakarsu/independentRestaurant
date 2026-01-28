"use client";

import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { Plug, CreditCard, Truck, Calendar, FileText, Star, Settings } from "lucide-react";

export default function IntegrationsPage() {
  const integrations = [
    { id: "pos", name: "POS Systems", desc: "Connect to Square, Toast, Clover", icon: CreditCard, connected: false, category: "pos" },
    { id: "doordash", name: "DoorDash", desc: "Receive delivery orders from DoorDash", icon: Truck, connected: true, category: "delivery" },
    { id: "ubereats", name: "Uber Eats", desc: "Receive delivery orders from Uber Eats", icon: Truck, connected: false, category: "delivery" },
    { id: "grubhub", name: "Grubhub", desc: "Receive delivery orders from Grubhub", icon: Truck, connected: false, category: "delivery" },
    { id: "opentable", name: "OpenTable", desc: "Sync reservations with OpenTable", icon: Calendar, connected: true, category: "reservations" },
    { id: "resy", name: "Resy", desc: "Sync reservations with Resy", icon: Calendar, connected: false, category: "reservations" },
    { id: "stripe", name: "Stripe", desc: "Process payments with Stripe", icon: CreditCard, connected: true, category: "payments" },
    { id: "square", name: "Square Payments", desc: "Process payments with Square", icon: CreditCard, connected: false, category: "payments" },
    { id: "quickbooks", name: "QuickBooks", desc: "Sync financial data to QuickBooks", icon: FileText, connected: false, category: "accounting" },
    { id: "xero", name: "Xero", desc: "Sync financial data to Xero", icon: FileText, connected: false, category: "accounting" },
    { id: "google", name: "Google Reviews", desc: "Monitor and respond to Google reviews", icon: Star, connected: true, category: "reviews" },
    { id: "yelp", name: "Yelp", desc: "Monitor and respond to Yelp reviews", icon: Star, connected: false, category: "reviews" },
  ];

  const categories = [
    { id: "pos", name: "POS Systems", icon: CreditCard },
    { id: "delivery", name: "Delivery Platforms", icon: Truck },
    { id: "reservations", name: "Reservation Platforms", icon: Calendar },
    { id: "payments", name: "Payment Processors", icon: CreditCard },
    { id: "accounting", name: "Accounting Software", icon: FileText },
    { id: "reviews", name: "Review Platforms", icon: Star },
  ];

  const handleToggle = (integrationId: string, currentState: boolean) => {
    toast({
      title: currentState ? "Disconnected" : "Connected",
      description: `Integration ${currentState ? "disabled" : "enabled"} successfully`,
    });
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Integrations" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex items-center gap-2 mb-6">
          <Plug className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Integrations</h2>
            <p className="text-muted-foreground">Connect your restaurant to third-party services</p>
          </div>
        </div>

        <div className="grid gap-4">
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-green-800">
                    {integrations.filter((i) => i.connected).length} integrations connected
                  </p>
                  <p className="text-sm text-green-600">Your restaurant is connected to key services</p>
                </div>
                <Badge variant="success" className="bg-green-600">Active</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {categories.map((category) => {
          const categoryIntegrations = integrations.filter((i) => i.category === category.id);
          return (
            <div key={category.id}>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <category.icon className="h-5 w-5" />
                {category.name}
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {categoryIntegrations.map((integration) => (
                  <Card key={integration.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <integration.icon className="h-5 w-5" />
                          {integration.name}
                        </CardTitle>
                        <Switch
                          checked={integration.connected}
                          onCheckedChange={() => handleToggle(integration.id, integration.connected)}
                        />
                      </div>
                      <CardDescription>{integration.desc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        {integration.connected ? (
                          <Badge variant="success">Connected</Badge>
                        ) : (
                          <Badge variant="outline">Not Connected</Badge>
                        )}
                        <Button variant="ghost" size="sm">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
