"use client";

import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/use-toast";
import { Settings, Store, Clock, DollarSign, Bell, Shield } from "lucide-react";

export default function SettingsPage() {
  const handleSave = () => {
    toast({ title: "Settings Saved", description: "Your settings have been updated" });
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Settings" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Settings</h2>
            <p className="text-muted-foreground">Manage your restaurant configuration</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" /> Restaurant Info</CardTitle>
              <CardDescription>Basic restaurant information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Restaurant Name</Label>
                <Input id="name" defaultValue="My Restaurant" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" defaultValue="123 Main Street, City, State 12345" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" defaultValue="(555) 123-4567" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" defaultValue="contact@restaurant.com" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Hours of Operation</CardTitle>
              <CardDescription>Set your business hours</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                <div key={day} className="flex items-center justify-between">
                  <span className="w-24">{day}</span>
                  <div className="flex gap-2">
                    <Input type="time" defaultValue="11:00" className="w-28" />
                    <span className="self-center">to</span>
                    <Input type="time" defaultValue="22:00" className="w-28" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Tax & Payment</CardTitle>
              <CardDescription>Configure tax and payment settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="taxRate">Tax Rate (%)</Label>
                <Input id="taxRate" type="number" step="0.01" defaultValue="8.75" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" defaultValue="USD" />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Accept Tips</p>
                  <p className="text-sm text-muted-foreground">Allow customers to add tips</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Auto-gratuity for Large Parties</p>
                  <p className="text-sm text-muted-foreground">Add 18% for parties of 6+</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notifications</CardTitle>
              <CardDescription>Configure notification preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">New Order Alerts</p>
                  <p className="text-sm text-muted-foreground">Sound alert for new orders</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Low Inventory Alerts</p>
                  <p className="text-sm text-muted-foreground">Alert when items are below par</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Reservation Reminders</p>
                  <p className="text-sm text-muted-foreground">Send SMS reminders to guests</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">New Review Alerts</p>
                  <p className="text-sm text-muted-foreground">Email when new reviews posted</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-4">
          <Button variant="outline">Reset to Defaults</Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </div>
      </div>
    </div>
  );
}
